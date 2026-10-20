// The deterministic hunt simulation (Tech §3.1): createSim(config) → step(commands) once per
// 1/60 s tick, snapshot() for rendering, drainEvents() for audio/FX/UI/analytics.
//
// Tick order: Stampede start → due world events → due crates → commands (in order) → hold-to-fire
// → weapon/crate-weapon/power-up/gadget timers → wind → secrets → director spawns (fly-overs,
// pop-ups, flocks) → creatures (flock FSM + steering, birds; at half rate under Boeretroos) →
// crates fall → dust devils → tick++ → end check. Shots therefore resolve against the positions the player saw in the
// previous snapshot. A shot resolves damage first (a bag scores at the behaviour the bird had),
// then Whole Flock, then the threats it makes (GDD §6.1–6.4).
import type { Biome, ContentBundle } from '../content/schemas';
import {
  behaviourOf,
  isHittable,
  updateBird,
  viewOf,
  type Bird,
  type BirdCreature,
} from './birds/Bird';
import { spookBoss, updateScripted } from './birds/scripted';
import { clampCameraX, planeCentreX, planeToDx } from './camera';
import { sanitiseCommand } from './commands';
import { msToTicks, secondsToTicks } from './clock';
import { createDirector, type DirectorContext } from './director/SpawnDirector';
import {
  FLYOVER_EVENTS,
  scheduleWorldEvents,
  WORLD_EVENT_HANDLERS,
  type ScheduledEvent,
} from './director/events';
import {
  buildBossBird,
  buildDustDevil,
  buildPerchBird,
  type WorldDeps,
} from './director/worldEvents';
import type { BonusId, FlockCause, SimEvent, ThreatSource } from './events';
import { centroid, flockParams, flockView, removeMembers, type Flock } from './flocks/Flock';
import { applyThreat, forceState, tickFsm, type Transition } from './flocks/fsm';
import { moveFlock } from './flocks/steering';
import {
  reactionTargets,
  shotThreats,
  type FlockThreat,
  type PlaneGeometry,
  type ReactionEffect,
  type ReactionScope,
} from './flocks/threats';
import { devilContacts, dustDevilView, tickDustDevil, type DustDevil } from './omen/dustDevil';
import { createWind, tickWind, windDriftPx, windSpeedMul, windView } from './omen/wind';
import {
  activate,
  effectsOf,
  onShellFired,
  powerupView,
  tickPowerups,
  type ActivePowerup,
} from './powerups';
import {
  crateView,
  rollCrate,
  scheduleCrates,
  spawnCrate,
  tickCrate,
  type Crate,
} from './props/crates';
import {
  activeParts,
  buildSecrets,
  hitPart,
  partPosition,
  secretView,
  tickSecret,
  type Secret,
} from './props/secrets';
import { createRng } from './rng';
import { twoFliesBonus, wholeFlockBonus } from './scoring/bonuses';
import { frenzyMul, nextStreak } from './scoring/frenzy';
import { scoreBag, scoreEventBonus } from './scoring/pipeline';
import type { BagBehaviour, Command, HuntResult, PlaneId, SimConfig, SimState } from './types';
import { PLANES } from './types';
import { applyShotDamage } from './weapons/damage';
import {
  armCrateWeapon,
  crateWeaponSpent,
  tickCrateWeapon,
  tryFireCrate,
  type CrateWeaponState,
} from './weapons/crateWeapon';
import {
  buildSlices,
  resolvePellet,
  type HitBird,
  type HitExtra,
  type ShotGeometry,
} from './weapons/hitTest';
import { pelletOffsets } from './weapons/pellets';
import {
  createWeaponState,
  isReloading,
  reloadProgress,
  startReload,
  tickWeapon,
  tryFire,
  weaponTiming,
  type PrimaryWeapon,
} from './weapons/weaponState';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from './world';

export interface Sim {
  /** Advances exactly one tick (1/60 s). A no-op once the hunt is over. */
  step(commands: readonly Command[]): void;
  readonly tick: number;
  snapshot(): Readonly<SimState>;
  drainEvents(): readonly SimEvent[];
  isOver(): boolean;
  result(): HuntResult;
}

interface HuntSetup {
  readonly biome: Biome;
  readonly weapon: PrimaryWeapon;
  readonly huntSeconds: number;
  /** Biome weather on (mode config, else modes.json; D-021). */
  readonly omen: boolean;
}

function resolveSetup(content: ContentBundle, config: SimConfig): HuntSetup {
  const { mode } = config;
  const defaults = mode.id === 'seasonHunt' ? undefined : content.modes.modes[mode.id];
  const biomeId = mode.biome ?? defaults?.biome;
  const weaponId = mode.weapon ?? defaults?.weapon;
  const huntSeconds = mode.huntSeconds ?? defaults?.huntSeconds ?? content.run.huntSeconds;
  if (biomeId === undefined || weaponId === undefined) {
    throw new Error(`mode ${mode.id} needs a biome and a weapon`);
  }
  const biome = content.biomes.find((b) => b.id === biomeId);
  if (biome === undefined) throw new Error(`unknown biome ${biomeId}`);
  const weapon = content.weapons.weapons.find((w) => w.id === weaponId);
  if (weapon?.kind !== 'primary') throw new Error(`${weaponId} is not a primary weapon`);
  if (weapon.projectile !== null) {
    throw new Error(`${weaponId}: projectile weapons arrive in M8 (delayed hitscan)`);
  }
  // Replays store huntSeconds on the 0.5 grid, so only allow values that survive that.
  if (!(huntSeconds > 0) || !Number.isInteger(huntSeconds * 2)) {
    throw new Error('huntSeconds must be a positive multiple of 0.5');
  }
  for (const event of biome.events) {
    if (!FLYOVER_EVENTS.has(event.id) || event.creature === undefined) continue;
    const c = content.birds.creatures.find((x) => x.id === event.creature);
    if (c === undefined || c.kind === 'helper' || !((c.speeds?.fly ?? 0) > 0)) {
      throw new Error(`event ${event.id}: creature ${event.creature} needs speeds.fly to fly over`);
    }
  }
  return { biome, weapon, huntSeconds, omen: mode.omen ?? defaults?.omen ?? false };
}

/** The numbers a shot needs from whichever weapon is active (primary or crate weapon). */
interface ShotStats {
  readonly id: string;
  readonly pellets: number;
  readonly spreadPx: number;
  readonly alertRadiusPx: number;
  readonly windSensitivity: number;
  readonly scoreMul: PrimaryWeapon['scoreMul'];
}

export function createSim(config: SimConfig): Sim {
  const { content, mode, inputKind } = config;
  const assistMul = content.scoring.aimAssistLevels[config.aimAssist ?? 'standard'];
  const { scoring } = content;
  const setup = resolveSetup(content, config);
  const { biome, weapon } = setup;
  /** Pacing and the event schedule use the hunt's original length; bonus time only moves the
   *  end and the Stampede (D-021). */
  const baseDurationTicks = secondsToTicks(setup.huntSeconds);
  let durationTicks = baseDurationTicks;
  const stampedeEnabled = scoring.stampede.modes.includes(mode.id) || mode.stampede === true;
  let stampedeAtTick: number | null = stampedeEnabled
    ? Math.max(0, durationTicks - secondsToTicks(scoring.stampede.lastSeconds))
    : null;

  const rng = createRng(config.seed);
  const timing = weaponTiming(weapon);
  const weaponState = createWeaponState(timing);
  const fParams = flockParams(content);
  const flockRng = rng.stream('flockNoise');
  const omenRng = rng.stream('omen');
  const director = createDirector({
    content,
    biome,
    durationTicks,
    spawns: rng.stream('spawns'),
    flocks: rng.stream('flocks'),
    flockParams: fParams,
  });
  const planeGeo: PlaneGeometry = {
    near: { scrollFactor: scoring.planes.near.scrollFactor, scale: scoring.planes.near.scale },
    mid: { scrollFactor: scoring.planes.mid.scrollFactor, scale: scoring.planes.mid.scale },
    far: { scrollFactor: scoring.planes.far.scrollFactor, scale: scoring.planes.far.scale },
  };
  const stampedeFlockState = biome.pacing.stampede.flockState ?? null;
  const gadgetDef = content.weapons.gadgets[0] ?? null;
  const gadgetCooldownTicks = gadgetDef === null ? 0 : msToTicks(gadgetDef.cooldownMs);
  const schedule = scheduleWorldEvents(
    biome,
    mode.id,
    setup.omen,
    durationTicks,
    rng.stream('events'),
  );
  let scheduleCursor = 0;
  const crateCfg = content.powerups.crates;
  const crateTicks = scheduleCrates(crateCfg, mode.id, durationTicks, rng.stream('crates'));
  let crateCursor = 0;
  const birdCreatures = new Map<string, BirdCreature>();
  for (const c of content.birds.creatures) if (c.kind !== 'helper') birdCreatures.set(c.id, c);
  const worldDeps: WorldDeps = {
    biome,
    planes: scoring.planes,
    creatures: birdCreatures,
    leaveAngle: (fParams.flushAngleRad[0] + fParams.flushAngleRad[1]) / 2,
  };
  const layerById = new Map(biome.layers.map((l) => [l.id, l]));
  /** The layer each plane's birds (and crates) live on. */
  const planeLayer = new Map<PlaneId, string>();
  for (const l of biome.layers) if (l.plane !== undefined) planeLayer.set(l.plane, l.id);
  const chainTicks = secondsToTicks(scoring.secretChain.withinSeconds);
  /** Each prop's layer scroll factor (where a pellet that stopped on it landed). */
  const propLayerFactor = new Map(
    biome.props.map((p) => [p.id, layerById.get(p.layer)?.scrollFactor ?? 1]),
  );

  const geometry: ShotGeometry = {
    slices: buildSlices(biome),
    planeScale: {
      near: scoring.planes.near.scale,
      mid: scoring.planes.mid.scale,
      far: scoring.planes.far.scale,
    },
    assistPx:
      inputKind === 'touch'
        ? {
            near: scoring.planes.near.aimAssistPx * assistMul,
            mid: scoring.planes.mid.aimAssistPx * assistMul,
            far: scoring.planes.far.aimAssistPx * assistMul,
          }
        : { near: 0, mid: 0, far: 0 },
  };

  // --- state -----------------------------------------------------------------------------
  let tick = 0;
  let over = false;
  let cameraX = clampCameraX((CAMERA_MIN_X + CAMERA_MAX_X) / 2);
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let nextBirdId = 1;
  let nextShotId = 1;
  let nextFlockId = 1;
  let nextCrateId = 1;
  let nextDevilId = 1;
  let birds: Bird[] = [];
  /** Live flocks in id order. */
  let flocks: Flock[] = [];
  // Season Run gadget charges arrive with the run state in M6; until then every mode gets the
  // Classic number (D-020).
  let gadgetCharges = gadgetDef?.chargesPerClassicHunt ?? 0;
  let gadgetCooldown = 0;
  const secrets: Secret[] = buildSecrets(biome);
  let lastSecretTick: number | null = null;
  let crates: Crate[] = [];
  const powerups: ActivePowerup[] = [];
  let crateWeapon: CrateWeaponState | null = null;
  /** Held fire position (fireHoldStart … fireHoldEnd). */
  let hold: { dx: number; sy: number } | null = null;
  const wind =
    setup.omen && biome.omen.wind !== undefined ? createWind(biome.omen.wind, omenRng) : null;
  let dustDevils: DustDevil[] = [];
  /** Creature time accumulator (Boeretroos slows creatures, GDD §10.4). */
  let creatureClock = 0;
  let events: SimEvent[] = [];
  const stats = {
    shots: 0,
    hitShots: 0,
    bagged: 0,
    baggedByPlane: { near: 0, mid: 0, far: 0 } as Record<PlaneId, number>,
    wingShots: 0,
    penalties: 0,
    emptyClicks: 0,
    twoFlies: 0,
    wholeFlocks: 0,
    flushes: 0,
    gadgetUses: 0,
    secrets: 0,
    crates: 0,
  };

  const emit = (e: SimEvent): void => {
    events.push(e);
  };
  const stampedeActive = (): boolean => stampedeAtTick !== null && tick >= stampedeAtTick;
  const stampedeMul = (): number => (stampedeActive() ? scoring.stampede.mul : 1);
  const airMul = (sign: number): number => windSpeedMul(wind, sign);

  emit({ type: 'huntStarted', tick: 0, durationTicks, stampedeAtTick });
  if (wind !== null) emit({ type: 'windChanged', tick: 0, dir: wind.dir, strength: wind.strength });

  function directorContext(): DirectorContext {
    return {
      tick,
      cameraX,
      aliveBirds: birds.length,
      stampede: stampedeActive(),
      nextId: () => nextBirdId++,
    };
  }

  // --- flocks -----------------------------------------------------------------------------
  function emitTransition(f: Flock, tr: Transition | null): void {
    if (tr === null) return;
    if (tr.to === 'flush') stats.flushes++;
    const c = centroid(f);
    emit({
      type: 'flockStateChanged',
      tick,
      flockId: f.id,
      from: tr.from,
      to: tr.to,
      cause: tr.cause,
      plane: f.plane,
      x: c.x,
      y: c.y,
    });
  }

  function threaten(threats: readonly FlockThreat[], source: ThreatSource): void {
    for (const t of threats) {
      if (t.flock.members.length === 0) continue;
      emit({ type: 'flockThreatened', tick, flockId: t.flock.id, source });
      emitTransition(t.flock, applyThreat(t.flock, t.x, fParams, flockRng));
    }
  }

  /** World-event and gadget reactions (GDD §6.2). */
  function react(effect: ReactionEffect, scope: ReactionScope, cause: FlockCause): void {
    applyReaction(effect, reactionTargets(flocks, scope, cameraX, planeGeo), cause);
  }

  function applyReaction(
    effect: ReactionEffect,
    targets: readonly FlockThreat[],
    cause: FlockCause,
  ): void {
    if (effect === 'threat') {
      threaten(targets, 'event');
      return;
    }
    for (const t of targets)
      emitTransition(t.flock, forceState(t.flock, effect, t.x, cause, fParams, flockRng));
  }

  function addFlocks(added: readonly Flock[]): void {
    for (const f of added) {
      flocks.push(f);
      addBirds(f.members);
      const c = centroid(f);
      emit({
        type: 'flockSpawned',
        tick,
        flockId: f.id,
        plane: f.plane,
        size: f.spawnSize,
        state: f.state,
        x: c.x,
      });
      if (stampedeActive()) stampede(f);
    }
  }

  /** Plane x on the far side of a flock from the screen centre: forcing the flock away from it
   *  sends it across the player's view. */
  function towardCentre(f: Flock): number {
    const centre = planeCentreX(cameraX, planeGeo[f.plane].scrollFactor);
    const cx = centroid(f).x;
    return cx + (cx >= centre ? 1 : -1);
  }

  /** GDD §8 mass run/flush: the flock runs (or flushes) toward the screen centre, so the
   *  Stampede crosses the player's view instead of fleeing out of it. */
  function stampede(f: Flock): void {
    if (stampedeFlockState === null) return;
    emitTransition(
      f,
      forceState(f, stampedeFlockState, towardCentre(f), 'stampede', fParams, flockRng),
    );
  }

  function spawnFlocks(): void {
    addFlocks(
      director.spawnFlocks({
        ...directorContext(),
        flocks,
        nextFlockId: () => nextFlockId++,
      }),
    );
  }

  /** Drops gone birds from their flocks; removes flocks left empty. */
  function pruneFlocks(gone: ReadonlySet<number>, reason: 'bagged' | 'exited'): Flock[] {
    const emptied: Flock[] = [];
    for (const f of flocks) {
      if (removeMembers(f, gone, reason) && f.members.length === 0) emptied.push(f);
    }
    if (emptied.length > 0) {
      flocks = flocks.filter((f) => f.members.length > 0);
      for (const f of emptied) emit({ type: 'flockRemoved', tick, flockId: f.id, reason });
    }
    return emptied;
  }

  function addBirds(added: readonly Bird[]): void {
    for (const b of added) {
      birds.push(b);
      emit({
        type: 'birdSpawned',
        tick,
        birdId: b.id,
        creature: b.creature.id,
        plane: b.plane,
        motion: b.motion,
      });
    }
  }

  // --- weapons and power-ups -------------------------------------------------------------
  function shotStats(): ShotStats {
    const w = crateWeapon?.def ?? weapon;
    return {
      id: w.id,
      pellets: w.pellets,
      spreadPx: w.spreadPx,
      alertRadiusPx: w.alertRadiusPx,
      windSensitivity: w.windSensitivity,
      scoreMul: w.scoreMul,
    };
  }

  /** Holding fire keeps firing: a hold-to-fire crate weapon, or auto-fire on the primary. */
  function holdFires(): boolean {
    if (crateWeapon !== null) return crateWeapon.def.holdToFire === true;
    return effectsOf(powerups).autoFire;
  }

  function startPowerup(id: string, source: 'crate' | 'secret'): void {
    const def = content.powerups.powerups.find((p) => p.id === id);
    if (def === undefined) return;
    activate(powerups, def);
    emit({ type: 'powerupStarted', tick, powerup: id, source });
  }

  function endPowerups(ids: readonly string[]): void {
    for (const id of ids) emit({ type: 'powerupEnded', tick, powerup: id });
  }

  function armWeapon(id: string): void {
    const def = content.weapons.weapons.find((w) => w.id === id);
    if (def?.kind !== 'crate') return;
    crateWeapon = armCrateWeapon(def);
    hold = null;
    emit({ type: 'weaponChanged', tick, weapon: def.id, kind: 'crate' });
  }

  /** Uses a shell (or crate-weapon shot). Returns the shells left to report, or null when the
   *  shot doesn't go off. */
  function pullTrigger(): number | null {
    if (crateWeapon !== null) {
      if (!tryFireCrate(crateWeapon)) return null;
      return crateWeapon.shotsLeft ?? -1;
    }
    if (effectsOf(powerups).infiniteAmmo) {
      // Chilli Biltong: no shells used, no reload (GDD §10.4).
      if (weaponState.cooldownTicks > 0) return null;
      if (isReloading(weaponState)) {
        weaponState.reloadTicks = 0;
        emit({ type: 'reloadInterrupted', tick, shells: weaponState.shells });
      }
      weaponState.cooldownTicks = timing.cooldownTicks;
      return timing.magazine < 0 ? -1 : weaponState.shells;
    }
    const outcome = tryFire(weaponState, timing);
    if (outcome.kind === 'blocked') return null;
    if (outcome.kind === 'empty') {
      stats.emptyClicks++;
      emit({ type: 'emptyClick', tick });
      return null;
    }
    if (outcome.interrupted) {
      emit({ type: 'reloadInterrupted', tick, shells: weaponState.shells + 1 });
    }
    return weaponState.shells;
  }

  // --- shooting ----------------------------------------------------------------------------
  function hitExtras(): Map<string, HitExtra[]> {
    const out = new Map<string, HitExtra[]>();
    const add = (layerId: string, e: HitExtra): void => {
      const list = out.get(layerId);
      if (list === undefined) out.set(layerId, [e]);
      else list.push(e);
    };
    for (const c of crates) {
      const layerId = planeLayer.get(c.plane);
      if (layerId === undefined) continue;
      add(layerId, {
        kind: 'crate',
        crateId: c.id,
        x: c.x,
        y: c.y,
        shape: { type: 'ellipse', rx: c.rx, ry: c.ry },
      });
    }
    for (const s of secrets) {
      for (const part of activeParts(s)) {
        add(s.layerId, {
          kind: 'secret',
          propId: s.propId,
          partId: part.id,
          ...partPosition(s, part),
          shape: part.shape,
        });
      }
    }
    return out;
  }

  function fire(dx: number, sy: number): void {
    const shellsLeft = pullTrigger();
    if (shellsLeft === null) return;
    const shot = shotStats();
    const fx = effectsOf(powerups);
    const shotId = nextShotId++;
    stats.shots++;
    emit({ type: 'shotFired', tick, shotId, weapon: shot.id, dx, sy, shellsLeft });

    // Front-most first: higher ids are drawn on top within a plane.
    const byPlane: Record<PlaneId, HitBird[]> = { near: [], mid: [], far: [] };
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      if (b === undefined) continue;
      byPlane[b.plane].push({
        id: b.id,
        plane: b.plane,
        x: b.x,
        y: b.y,
        facing: b.facing,
        hitbox: b.creature.hitbox,
        hittable: isHittable(b),
      });
    }

    const extras = hitExtras();
    const drift = windDriftPx(wind, shot.windSensitivity);
    const farFactor = planeGeo.far.scrollFactor;
    // Wind drifts far shots (Tech §3.4): the far plane and everything behind it.
    const driftDx = (f: number): number => (f <= farFactor ? drift : 0);
    const byId0 = new Map(birds.map((b) => [b.id, b]));
    const pelletsOn = new Map<number, number>();
    const impacts: { dx: number; sy: number }[] = [];
    const partHits: { propId: string; partId: string }[] = [];
    const crateHits: number[] = [];
    for (const o of pelletOffsets(
      shot.pellets,
      shot.spreadPx * fx.spreadMul,
      rng.stream('pellets'),
    )) {
      const pdx = dx + o.ox;
      const psy = sy + o.oy;
      const r = resolvePellet(pdx, psy, cameraX, geometry, byPlane, extras, driftDx);
      // The impact is where the pellet landed: downwind if it stopped at or behind the far
      // plane (or flew on into the sky), so threats and the puff follow the drift (Tech §3.4).
      const landedFar =
        r.birdId !== null
          ? byId0.get(r.birdId)?.plane === 'far'
          : r.crateId !== null
            ? crateCfg.plane === 'far'
            : r.propId !== null
              ? (propLayerFactor.get(r.propId) ?? 1) <= farFactor
              : true;
      const ldx = landedFar ? pdx + drift : pdx;
      impacts.push({ dx: ldx, sy: psy });
      emit({
        type: 'pelletImpact',
        tick,
        shotId,
        dx: ldx,
        sy: psy,
        birdId: r.birdId,
        propId: r.propId,
        partId: r.partId,
        crateId: r.crateId,
      });
      if (r.birdId !== null) pelletsOn.set(r.birdId, (pelletsOn.get(r.birdId) ?? 0) + 1);
      const { propId, partId, crateId } = r;
      if (partId !== null && propId !== null) {
        if (!partHits.some((h) => h.propId === propId && h.partId === partId))
          partHits.push({ propId, partId });
      }
      if (crateId !== null && !crateHits.includes(crateId)) crateHits.push(crateId);
    }

    // Damage, in bird order (stable).
    const damage = applyShotDamage(birds, pelletsOn, shot.pellets);
    const byId = new Map(birds.map((b) => [b.id, b]));
    const bagged: { bird: Bird; behaviour: BagBehaviour }[] = [];
    const armorBonuses: number[] = [];
    for (const d of damage.outcomes) {
      const b = byId.get(d.birdId);
      if (b === undefined) continue;
      if (d.kind === 'armor') {
        emit({ type: 'armorKnocked', tick, shotId, birdId: b.id, armorLeft: d.armorLeft });
        if (b.creature.kind === 'boss' && b.creature.armorHitBonus !== undefined) {
          armorBonuses.push(b.creature.armorHitBonus);
        }
        if (d.armorLeft === 0) spookBoss(b);
      } else if (d.kind === 'hit') {
        emit({ type: 'targetHit', tick, shotId, birdId: b.id, hitsLeft: d.hitsLeft });
      } else {
        bagged.push({ bird: b, behaviour: behaviourOf(b) });
      }
    }
    const touchedAny = damage.touched;
    const hitThing = partHits.length > 0 || crateHits.length > 0;

    const targets = bagged.filter((x) => x.bird.creature.kind !== 'nonTarget');
    const nonTargets = bagged.filter((x) => x.bird.creature.kind === 'nonTarget');

    // Frenzy first: this shot's bags score with the streak including this shot (D-018). A shot
    // that only hits a secret part or a crate leaves the streak alone (D-021).
    const onlyThings = hitThing && damage.outcomes.length === 0;
    const newStreak = onlyThings ? streak : nextStreak(streak, targets.length > 0);
    if (newStreak !== streak) {
      streak = newStreak;
      bestStreak = Math.max(bestStreak, streak);
      emit({
        type: 'comboChanged',
        tick,
        streak,
        frenzyMul: frenzyMul(streak, scoring.frenzyTiers),
      });
    }
    const fMul = frenzyMul(streak, scoring.frenzyTiers);

    for (const { bird, behaviour } of targets) {
      const c = bird.creature;
      if (c.kind === 'nonTarget') continue;
      emit({
        type: 'targetBagged',
        tick,
        shotId,
        birdId: bird.id,
        creature: c.id,
        plane: bird.plane,
        behaviour,
        flockId: bird.fm?.flockId ?? null,
        x: bird.x,
        y: bird.y,
      });
      const s = scoreBag(
        {
          base: c.baseOverride ?? scoring.planes[bird.plane].base,
          behaviourAdd: scoring.behaviourAdd[behaviour],
          weaponScoreMul: shot.scoreMul[bird.plane] ?? shot.scoreMul.all ?? 1,
          frenzyMul: fMul,
          stampedeMul: stampedeMul(),
        },
        [],
      );
      score += s.award;
      emit({
        type: 'scoreAwarded',
        tick,
        birdId: bird.id,
        points: s.points,
        mult: s.mult,
        award: s.award,
        breakdown: s.breakdown,
      });
      stats.bagged++;
      stats.baggedByPlane[bird.plane]++;
      if (behaviour === 'flying') stats.wingShots++;
    }
    for (const { bird } of nonTargets) {
      const c = bird.creature;
      if (c.kind !== 'nonTarget') continue;
      score += c.penalty;
      stats.penalties++;
      emit({ type: 'penaltyApplied', tick, birdId: bird.id, creature: c.id, points: c.penalty });
    }

    // Event bonuses use the post-shot streak, like the bags (D-018).
    for (const bonus of armorBonuses) awardBonus('armor', bonus);
    const flies = twoFliesBonus(targets.length, scoring.twoFlies);
    if (flies > 0) {
      stats.twoFlies++;
      awardBonus('twoFlies', flies);
    }

    const baggedFlockIds = new Set<number>();
    if (bagged.length > 0) {
      const gone = new Set(bagged.map((x) => x.bird.id));
      birds = birds.filter((b) => !gone.has(b.id));
      for (const { bird } of bagged) {
        emit({ type: 'birdDespawned', tick, birdId: bird.id, reason: 'bagged' });
        if (bird.fm !== null) baggedFlockIds.add(bird.fm.flockId);
      }
      // Whole Flock (GDD §6.4): the last member of an eligible flock of ≥ minSize just fell.
      for (const f of pruneFlocks(gone, 'bagged')) {
        const bonus = f.eligible
          ? wholeFlockBonus(f.spawnSize, f.spawnSize, scoring.wholeFlock)
          : 0;
        if (bonus <= 0) continue;
        const last = bagged.filter((x) => x.bird.fm?.flockId === f.id).at(-1)?.bird;
        stats.wholeFlocks++;
        emit({
          type: 'flockWiped',
          tick,
          flockId: f.id,
          size: f.spawnSize,
          plane: f.plane,
          x: last?.x ?? f.homeX,
          y: last?.y ?? f.goalY,
        });
        awardBonus('wholeFlock', bonus);
      }
    }
    // This shot counts against shell power-ups it had; one it picks up starts with the next.
    endPowerups(onShellFired(powerups));
    for (const id of crateHits) openCrate(id);
    for (const s of secrets) {
      for (const h of partHits) if (h.propId === s.propId) hitSecretPart(s, h.partId);
    }
    // Threats (GDD §6.2): one per flock in range of any impact, hit or miss.
    threaten(
      shotThreats(flocks, impacts, cameraX, shot.alertRadiusPx, planeGeo, baggedFlockIds),
      shot.alertRadiusPx > 0 ? 'shot' : 'silentBag',
    );
    if (targets.length > 0) stats.hitShots++;
    if (!touchedAny && !hitThing) emit({ type: 'miss', tick, shotId });
  }

  function awardBonus(bonus: BonusId, base: number): void {
    const award = scoreEventBonus(base, {
      frenzyMul: frenzyMul(streak, scoring.frenzyTiers),
      stampedeMul: stampedeMul(),
      multipliers: scoring.eventBonusMultipliers,
    });
    score += award;
    emit({ type: 'bonusAwarded', tick, bonus, base, award });
  }

  // --- crates ------------------------------------------------------------------------------
  function dropCrate(): void {
    const p = scoring.planes[crateCfg.plane];
    const c = spawnCrate(
      crateCfg,
      biome,
      {
        id: nextCrateId,
        centreX: planeCentreX(cameraX, p.scrollFactor),
        planeScale: p.scale,
        midScale: scoring.planes.mid.scale,
      },
      rng.stream('crates'),
    );
    if (c === null) return;
    nextCrateId++;
    crates.push(c);
    emit({ type: 'crateSpawned', tick, crateId: c.id, plane: c.plane, x: c.x });
  }

  function openCrate(id: number): void {
    const c = crates.find((x) => x.id === id);
    if (c === undefined) return;
    crates = crates.filter((x) => x.id !== id);
    const item = rollCrate(crateCfg, rng.stream('crates'));
    if (item === null) return;
    stats.crates++;
    emit({
      type: 'crateOpened',
      tick,
      crateId: id,
      item: item.id,
      itemType: item.type,
      x: c.x,
      y: c.y,
    });
    if (item.type === 'weapon') armWeapon(item.id);
    else startPowerup(item.id, 'crate');
  }

  // --- secrets -----------------------------------------------------------------------------
  function hitSecretPart(s: Secret, partId: string): void {
    const r = hitPart(s, partId);
    if (r === null) return;
    if (r.kind === 'progress') {
      emit({ type: 'secretPartHit', tick, propId: s.propId, partId, partsLeft: r.partsLeft });
      return;
    }
    triggerSecret(s, partId);
  }

  /** Pays a secret's reward (GDD §11.1), all from its JSON entry. */
  function triggerSecret(s: Secret, partId: string): void {
    const reward = s.reward;
    stats.secrets++;
    emit({ type: 'secretTriggered', tick, propId: s.propId, partId });
    if (reward.points !== undefined) awardBonus('secret', reward.points);
    // Secret chain (GDD §9): two secrets within withinSeconds.
    if (lastSecretTick !== null && tick - lastSecretTick <= chainTicks) {
      awardBonus('secretChain', scoring.secretChain.bonus);
      lastSecretTick = null;
    } else {
      lastSecretTick = tick;
    }
    if (reward.event !== undefined) emit({ type: 'worldEvent', tick, event: reward.event });
    const at = reward.at === undefined ? undefined : biome.props.find((p) => p.id === reward.at);
    const atLayer = at === undefined ? undefined : layerById.get(at.layer);
    const atX =
      at === undefined || atLayer === undefined ? null : at.u * coreWidth(atLayer.scrollFactor);
    if (reward.reaction !== undefined) {
      const r = reward.reaction;
      if (r.scope === 'area') {
        if (at !== undefined && atLayer !== undefined && atX !== null && r.radiusPx !== undefined) {
          react(
            r.effect,
            {
              kind: 'area',
              dx: planeToDx(cameraX, atLayer.scrollFactor, atX),
              sy: at.y,
              radiusMidPx: r.radiusPx,
            },
            'event',
          );
        }
      } else {
        react(r.effect, { kind: r.scope }, 'event');
      }
    }
    if (reward.flushBirds !== undefined && atLayer?.plane !== undefined && atX !== null) {
      const f = director.spawnFlockAt(
        { ...directorContext(), flocks, nextFlockId: () => nextFlockId++ },
        atLayer.plane,
        atX,
        reward.flushBirds,
        rng.stream('secrets'),
      );
      if (f !== null) {
        // A burst is the secret's reward, not an escalation: no Whole Flock for it (D-021).
        f.eligible = false;
        addFlocks([f]);
        emitTransition(f, forceState(f, 'flush', towardCentre(f), 'event', fParams, flockRng));
      }
    }
    if (reward.addTimeSeconds !== undefined) addTime(secondsToTicks(reward.addTimeSeconds));
    if (reward.powerup !== undefined) startPowerup(reward.powerup, 'secret');
  }

  /** Bonus time (GDD §8): the end and a Stampede that hasn't started move later. */
  function addTime(ticks: number): void {
    durationTicks += ticks;
    if (stampedeAtTick !== null && tick < stampedeAtTick) stampedeAtTick += ticks;
    emit({ type: 'timeAdded', tick, ticks, durationTicks, stampedeAtTick });
  }

  // --- world events ------------------------------------------------------------------------
  function runWorldEvent(ev: ScheduledEvent): void {
    const def = biome.events[ev.index];
    if (def === undefined) return;
    switch (WORLD_EVENT_HANDLERS[ev.id]) {
      case 'flyover': {
        if (ev.creature === null) return;
        emit({ type: 'worldEvent', tick, event: ev.id });
        const added = director.spawnEventFlyover(
          directorContext(),
          ev.creature,
          rng.stream('events'),
        );
        addBirds(added);
        // Hadeda (GDD §6.2): its honking is one threat to every flock.
        const c = added[0]?.creature;
        if (c?.kind === 'nonTarget' && c.alertsAllFlocks === true) {
          react('threat', { kind: 'all' }, 'event');
        }
        return;
      }
      case 'perch':
      case 'boss': {
        if (birds.length >= biome.pacing.maxBirdsOnScreen) return;
        const handler = WORLD_EVENT_HANDLERS[ev.id];
        const build = handler === 'perch' ? buildPerchBird : buildBossBird;
        const b = build(
          worldDeps,
          def,
          nextBirdId,
          rng.stream(handler === 'perch' ? 'perch' : 'boss'),
        );
        if (b === null) return;
        nextBirdId++;
        emit({ type: 'worldEvent', tick, event: ev.id });
        addBirds([b]);
        return;
      }
      case 'dustDevil': {
        const d = buildDustDevil(worldDeps, def, nextDevilId, cameraX, wind?.dir ?? null, omenRng);
        if (d === null) return;
        nextDevilId++;
        dustDevils.push(d);
        emit({ type: 'worldEvent', tick, event: ev.id });
        emit({ type: 'dustDevilSpawned', tick, dustDevilId: d.id, plane: d.plane, x: d.x });
        return;
      }
      // Never scheduled from the biome (content validation rejects them there).
      case 'secretReward':
      case 'crate':
      case 'stampede':
      case 'later':
        return;
    }
  }

  function apply(raw: Command): void {
    const cmd = sanitiseCommand(raw);
    if (cmd === null) return;
    switch (cmd.t) {
      case 'fire':
        fire(cmd.dx, cmd.sy);
        return;
      case 'fireHoldStart':
        hold = { dx: cmd.dx, sy: cmd.sy };
        fire(cmd.dx, cmd.sy);
        return;
      case 'fireHoldMove':
        if (hold !== null) hold = { dx: cmd.dx, sy: cmd.sy };
        return;
      case 'fireHoldEnd':
        hold = null;
        return;
      case 'reload':
        // Crate weapons reload themselves (Voorlaaier ramrod) or never (Mielie-Masjien).
        if (crateWeapon === null && startReload(weaponState, timing))
          emit({ type: 'reloadStarted', tick, perShell: timing.perShell });
        return;
      case 'cameraTarget':
        cameraX = cmd.cx;
        return;
      case 'gadget':
        useGadget();
        return;
      // Consumables arrive with the Season Run (M6): recorded but inert.
      case 'consumable':
        return;
    }
  }

  /** The Vuvuzela (GDD §10.2): every visible flock straight to FLUSH. */
  function useGadget(): void {
    if (gadgetDef === null) return;
    if (gadgetCharges <= 0 || gadgetCooldown > 0) {
      emit({
        type: 'gadgetDenied',
        tick,
        gadget: gadgetDef.id,
        reason: gadgetCharges <= 0 ? 'noCharges' : 'cooldown',
      });
      return;
    }
    gadgetCharges--;
    gadgetCooldown = gadgetCooldownTicks;
    stats.gadgetUses++;
    const targets = reactionTargets(flocks, { kind: 'visible' }, cameraX, planeGeo);
    emit({
      type: 'gadgetUsed',
      tick,
      gadget: gadgetDef.id,
      chargesLeft: gadgetCharges,
      flocks: targets.length,
    });
    applyReaction('flush', targets, 'gadget');
  }

  /** Flocks and birds move one step (skipped every other tick under Boeretroos). */
  function stepCreatures(): void {
    const exitedMembers: Bird[] = [];
    for (const f of flocks) {
      emitTransition(f, tickFsm(f, fParams, flockRng));
      exitedMembers.push(...moveFlock(f, fParams, flockRng, airMul));
    }
    if (exitedMembers.length > 0) {
      const gone = new Set(exitedMembers.map((b) => b.id));
      for (const b of exitedMembers)
        emit({ type: 'birdDespawned', tick, birdId: b.id, reason: 'exited' });
      birds = birds.filter((b) => !gone.has(b.id));
      pruneFlocks(gone, 'exited');
    }

    const leaving: number[] = [];
    for (const b of birds) {
      const before = b.phase;
      let exit = updateBird(b, airMul);
      if (b.script !== null) exit = updateScripted(b, airMul);
      if (b.phase === 'perch' && before !== 'perch') {
        emit({ type: 'birdCalled', tick, birdId: b.id, creature: b.creature.id });
      }
      if (exit !== null) {
        leaving.push(b.id);
        emit({ type: 'birdDespawned', tick, birdId: b.id, reason: exit });
      }
    }
    if (leaving.length > 0) {
      const gone = new Set(leaving);
      birds = birds.filter((b) => !gone.has(b.id));
    }
  }

  // --- the tick ----------------------------------------------------------------------------
  function step(commands: readonly Command[]): void {
    if (over) return;

    if (stampedeAtTick !== null && tick === stampedeAtTick) {
      emit({ type: 'stampedeStarted', tick });
      // GDD §8: mass run/flush across the panorama.
      for (const f of flocks) stampede(f);
    }

    while (
      scheduleCursor < schedule.length &&
      (schedule[scheduleCursor]?.tick ?? Infinity) <= tick
    ) {
      const ev = schedule[scheduleCursor++];
      if (ev === undefined) break;
      runWorldEvent(ev);
    }
    while (crateCursor < crateTicks.length && (crateTicks[crateCursor] ?? Infinity) <= tick) {
      crateCursor++;
      dropCrate();
    }

    for (const cmd of commands) apply(cmd);
    if (hold !== null && holdFires()) fire(hold.dx, hold.sy);

    const w = tickWeapon(weaponState, timing);
    if (w === 'shellLoaded') emit({ type: 'shellLoaded', tick, shells: weaponState.shells });
    else if (w === 'reloadFinished')
      emit({ type: 'reloadFinished', tick, shells: weaponState.shells });
    if (crateWeapon !== null) {
      tickCrateWeapon(crateWeapon);
      if (crateWeaponSpent(crateWeapon)) {
        crateWeapon = null;
        hold = null;
        emit({ type: 'weaponChanged', tick, weapon: weapon.id, kind: 'primary' });
      }
    }
    endPowerups(tickPowerups(powerups));
    if (gadgetCooldown > 0) gadgetCooldown--;
    if (wind !== null && tickWind(wind, omenRng)) {
      emit({ type: 'windChanged', tick, dir: wind.dir, strength: wind.strength });
    }
    for (const s of secrets) {
      const t = tickSecret(s);
      if (t === 'reset') emit({ type: 'secretReset', tick, propId: s.propId });
      else if (t === 'ready') emit({ type: 'secretReady', tick, propId: s.propId });
    }

    addBirds(director.tick(directorContext()));
    spawnFlocks();

    creatureClock += effectsOf(powerups).creatureTimeScale;
    if (creatureClock >= 1) {
      creatureClock -= 1;
      stepCreatures();
    }

    if (crates.length > 0) {
      const expired = crates.filter((c) => tickCrate(c));
      if (expired.length > 0) {
        crates = crates.filter((c) => !expired.includes(c));
        for (const c of expired) emit({ type: 'crateExpired', tick, crateId: c.id });
      }
    }
    if (dustDevils.length > 0) {
      const ended: DustDevil[] = [];
      for (const d of dustDevils) {
        if (tickDustDevil(d)) ended.push(d);
        // A dust devil flushes what it touches (GDD §11).
        for (const f of devilContacts(d, flocks)) {
          if (d.flushes) emitTransition(f, forceState(f, 'flush', d.x, 'event', fParams, flockRng));
          else threaten([{ flock: f, x: d.x }], 'event');
        }
      }
      if (ended.length > 0) {
        dustDevils = dustDevils.filter((d) => !ended.includes(d));
        for (const d of ended) emit({ type: 'dustDevilEnded', tick, dustDevilId: d.id });
      }
    }

    tick++;
    if (tick >= durationTicks) {
      over = true;
      emit({ type: 'huntEnded', tick, score });
    }
  }

  // Warm-up (GDD §8): the first flocks are already foraging in view at the first snapshot.
  spawnFlocks();

  function rankFor(s: number): string {
    let rank = scoring.ranks[0]?.id ?? '';
    for (const r of scoring.ranks) if (s >= r.minScore) rank = r.id;
    return rank;
  }

  function weaponView(): SimState['weapon'] {
    const cw = crateWeapon;
    if (cw !== null) {
      const reloading = cw.shotsLeft !== null && cw.cooldownTicks > 0;
      return {
        id: cw.def.id,
        kind: 'crate',
        shells: cw.shotsLeft ?? -1,
        magazine: cw.def.shots ?? -1,
        reloading,
        reloadProgress: reloading ? 1 - cw.cooldownTicks / cw.cooldownLength : 0,
        cooldownTicks: cw.cooldownTicks,
        holdToFire: cw.def.holdToFire === true,
        infinite: cw.shotsLeft === null,
        ticksLeft: cw.ticksLeft,
        totalTicks: cw.totalTicks,
      };
    }
    const fx = effectsOf(powerups);
    return {
      id: weapon.id,
      kind: 'primary',
      shells: timing.magazine < 0 ? -1 : weaponState.shells,
      magazine: timing.magazine,
      reloading: isReloading(weaponState),
      reloadProgress: reloadProgress(weaponState, timing),
      cooldownTicks: weaponState.cooldownTicks,
      holdToFire: fx.autoFire,
      infinite: fx.infiniteAmmo || timing.magazine < 0,
      ticksLeft: null,
      totalTicks: null,
    };
  }

  return {
    step,
    get tick() {
      return tick;
    },
    snapshot(): SimState {
      return {
        tick,
        durationTicks,
        ticksLeft: Math.max(0, durationTicks - tick),
        cameraX,
        score,
        streak,
        frenzyMul: frenzyMul(streak, scoring.frenzyTiers),
        stampedeActive: stampedeActive(),
        weapon: weaponView(),
        birds: birds.map(viewOf),
        flocks: flocks.map(flockView),
        gadget:
          gadgetDef === null
            ? null
            : {
                id: gadgetDef.id,
                charges: gadgetCharges,
                cooldownTicks: gadgetCooldown,
                cooldownTotalTicks: gadgetCooldownTicks,
              },
        secrets: secrets.map(secretView),
        crates: crates.map(crateView),
        powerups: powerups.map(powerupView),
        wind: windView(wind),
        dustDevils: dustDevils.map(dustDevilView),
        over,
      };
    },
    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
    isOver: () => over,
    result(): HuntResult {
      return {
        seed: rng.seed,
        mode: mode.id,
        biome: biome.id,
        weapon: weapon.id,
        score,
        ticks: tick,
        shots: stats.shots,
        hitShots: stats.hitShots,
        accuracy: stats.shots === 0 ? 0 : stats.hitShots / stats.shots,
        bagged: stats.bagged,
        baggedByPlane: { ...stats.baggedByPlane },
        wingShots: stats.wingShots,
        penalties: stats.penalties,
        emptyClicks: stats.emptyClicks,
        bestStreak,
        twoFlies: stats.twoFlies,
        wholeFlocks: stats.wholeFlocks,
        flushes: stats.flushes,
        gadgetUses: stats.gadgetUses,
        secrets: stats.secrets,
        crates: stats.crates,
        rank: rankFor(score),
      };
    },
  };
}

/** Planes in front-to-back order (re-exported for renderers and tools). */
export { PLANES };
