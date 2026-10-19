// The deterministic hunt simulation (Tech §3.1): createSim(config) → step(commands) once per
// 1/60 s tick, snapshot() for rendering, drainEvents() for audio/FX/UI/analytics.
//
// Tick order: Stampede start → due world events → commands (in order) → weapon timers →
// director spawns → bird movement/despawns → tick++ → end check. Shots therefore resolve
// against the positions the player saw in the previous snapshot.
import type { Biome, ContentBundle } from '../content/schemas';
import { behaviourOf, isHittable, updateBird, viewOf, type Bird } from './birds/Bird';
import { clampCameraX } from './camera';
import { sanitiseCommand } from './commands';
import { secondsToTicks } from './clock';
import { createDirector, type DirectorContext } from './director/SpawnDirector';
import { FLYOVER_EVENTS, scheduleWorldEvents } from './director/events';
import type { SimEvent } from './events';
import { createRng } from './rng';
import { twoFliesBonus } from './scoring/bonuses';
import { frenzyMul, nextStreak } from './scoring/frenzy';
import { scoreBag, scoreEventBonus } from './scoring/pipeline';
import type { BagBehaviour, Command, HuntResult, PlaneId, SimConfig, SimState } from './types';
import { PLANES } from './types';
import { applyShotDamage } from './weapons/damage';
import { buildSlices, resolvePellet, type HitBird, type ShotGeometry } from './weapons/hitTest';
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
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';

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
  return { biome, weapon, huntSeconds };
}

export function createSim(config: SimConfig): Sim {
  const { content, mode, inputKind } = config;
  const { scoring } = content;
  const setup = resolveSetup(content, config);
  const { biome, weapon } = setup;
  const durationTicks = secondsToTicks(setup.huntSeconds);
  const stampedeEnabled = scoring.stampede.modes.includes(mode.id) || mode.stampede === true;
  const stampedeAtTick = stampedeEnabled
    ? Math.max(0, durationTicks - secondsToTicks(scoring.stampede.lastSeconds))
    : null;

  const rng = createRng(config.seed);
  const timing = weaponTiming(weapon);
  const weaponState = createWeaponState(timing);
  const director = createDirector({ content, biome, durationTicks, spawns: rng.stream('spawns') });
  const schedule = scheduleWorldEvents(
    biome,
    mode.id,
    mode.omen === true,
    durationTicks,
    rng.stream('events'),
  );
  let scheduleCursor = 0;

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
            near: scoring.planes.near.aimAssistPx,
            mid: scoring.planes.mid.aimAssistPx,
            far: scoring.planes.far.aimAssistPx,
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
  let birds: Bird[] = [];
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
  };

  const emit = (e: SimEvent): void => {
    events.push(e);
  };
  const stampedeActive = (): boolean => stampedeAtTick !== null && tick >= stampedeAtTick;
  const stampedeMul = (): number => (stampedeActive() ? scoring.stampede.mul : 1);
  const weaponScoreMul = (plane: PlaneId): number =>
    weapon.scoreMul[plane] ?? weapon.scoreMul.all ?? 1;

  emit({ type: 'huntStarted', tick: 0, durationTicks, stampedeAtTick });

  function directorContext(): DirectorContext {
    return {
      tick,
      cameraX,
      aliveBirds: birds.length,
      stampede: stampedeActive(),
      nextId: () => nextBirdId++,
    };
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

  // --- shooting ----------------------------------------------------------------------------
  function fire(dx: number, sy: number): void {
    const outcome = tryFire(weaponState, timing);
    if (outcome.kind === 'blocked') return;
    if (outcome.kind === 'empty') {
      stats.emptyClicks++;
      emit({ type: 'emptyClick', tick });
      return;
    }
    if (outcome.interrupted) {
      emit({ type: 'reloadInterrupted', tick, shells: weaponState.shells + 1 });
    }
    const shotId = nextShotId++;
    stats.shots++;
    emit({
      type: 'shotFired',
      tick,
      shotId,
      weapon: weapon.id,
      dx,
      sy,
      shellsLeft: weaponState.shells,
    });

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

    const pelletsOn = new Map<number, number>();
    for (const o of pelletOffsets(timing.pellets, timing.spreadPx, rng.stream('pellets'))) {
      const pdx = dx + o.ox;
      const psy = sy + o.oy;
      const r = resolvePellet(pdx, psy, cameraX, geometry, byPlane);
      emit({
        type: 'pelletImpact',
        tick,
        shotId,
        dx: pdx,
        sy: psy,
        birdId: r.birdId,
        propId: r.propId,
      });
      if (r.birdId !== null) pelletsOn.set(r.birdId, (pelletsOn.get(r.birdId) ?? 0) + 1);
    }

    // Damage, in bird order (stable).
    const damage = applyShotDamage(birds, pelletsOn, timing.pellets);
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
      } else if (d.kind === 'hit') {
        emit({ type: 'targetHit', tick, shotId, birdId: b.id, hitsLeft: d.hitsLeft });
      } else {
        bagged.push({ bird: b, behaviour: behaviourOf(b) });
      }
    }
    const touchedAny = damage.touched;

    const targets = bagged.filter((x) => x.bird.creature.kind !== 'nonTarget');
    const nonTargets = bagged.filter((x) => x.bird.creature.kind === 'nonTarget');

    // Frenzy first: this shot's bags score with the streak including this shot (D-018).
    const newStreak = nextStreak(streak, targets.length > 0);
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
        x: bird.x,
        y: bird.y,
      });
      const s = scoreBag(
        {
          base: c.baseOverride ?? scoring.planes[bird.plane].base,
          behaviourAdd: scoring.behaviourAdd[behaviour],
          weaponScoreMul: weaponScoreMul(bird.plane),
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

    if (bagged.length > 0) {
      const gone = new Set(bagged.map((x) => x.bird.id));
      birds = birds.filter((b) => !gone.has(b.id));
      for (const { bird } of bagged)
        emit({ type: 'birdDespawned', tick, birdId: bird.id, reason: 'bagged' });
    }
    if (targets.length > 0) stats.hitShots++;
    if (!touchedAny) emit({ type: 'miss', tick, shotId });
  }

  function awardBonus(bonus: 'twoFlies' | 'armor', base: number): void {
    const award = scoreEventBonus(base, {
      frenzyMul: frenzyMul(streak, scoring.frenzyTiers),
      stampedeMul: stampedeMul(),
      multipliers: scoring.eventBonusMultipliers,
    });
    score += award;
    emit({ type: 'bonusAwarded', tick, bonus, base, award });
  }

  function apply(raw: Command): void {
    const cmd = sanitiseCommand(raw);
    if (cmd === null) return;
    switch (cmd.t) {
      case 'fire':
        fire(cmd.dx, cmd.sy);
        return;
      case 'reload':
        if (startReload(weaponState, timing))
          emit({ type: 'reloadStarted', tick, perShell: timing.perShell });
        return;
      case 'cameraTarget':
        cameraX = cmd.cx;
        return;
      // Hold-to-fire weapons (M8), the gadget (M3) and consumables (M6) are recorded but inert.
      case 'fireHoldStart':
      case 'fireHoldMove':
      case 'fireHoldEnd':
      case 'gadget':
      case 'consumable':
        return;
    }
  }

  // --- the tick ----------------------------------------------------------------------------
  function step(commands: readonly Command[]): void {
    if (over) return;

    if (stampedeAtTick !== null && tick === stampedeAtTick) emit({ type: 'stampedeStarted', tick });

    while (
      scheduleCursor < schedule.length &&
      (schedule[scheduleCursor]?.tick ?? Infinity) <= tick
    ) {
      const ev = schedule[scheduleCursor++];
      if (ev === undefined) break;
      if (FLYOVER_EVENTS.has(ev.id) && ev.creature !== null) {
        emit({ type: 'worldEvent', tick, event: ev.id });
        addBirds(director.spawnEventFlyover(directorContext(), ev.creature, rng.stream('events')));
      }
    }

    for (const cmd of commands) apply(cmd);

    const w = tickWeapon(weaponState, timing);
    if (w === 'shellLoaded') emit({ type: 'shellLoaded', tick, shells: weaponState.shells });
    else if (w === 'reloadFinished')
      emit({ type: 'reloadFinished', tick, shells: weaponState.shells });

    addBirds(director.tick(directorContext()));

    const leaving: number[] = [];
    for (const b of birds) {
      const exit = updateBird(b);
      if (exit !== null) {
        leaving.push(b.id);
        emit({ type: 'birdDespawned', tick, birdId: b.id, reason: exit });
      }
    }
    if (leaving.length > 0) {
      const gone = new Set(leaving);
      birds = birds.filter((b) => !gone.has(b.id));
    }

    tick++;
    if (tick >= durationTicks) {
      over = true;
      emit({ type: 'huntEnded', tick, score });
    }
  }

  function rankFor(s: number): string {
    let rank = scoring.ranks[0]?.id ?? '';
    for (const r of scoring.ranks) if (s >= r.minScore) rank = r.id;
    return rank;
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
        weapon: {
          id: weapon.id,
          shells: timing.magazine < 0 ? -1 : weaponState.shells,
          magazine: timing.magazine,
          reloading: isReloading(weaponState),
          reloadProgress: reloadProgress(weaponState, timing),
          cooldownTicks: weaponState.cooldownTicks,
        },
        birds: birds.map(viewOf),
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
        rank: rankFor(score),
      };
    },
  };
}

/** Planes in front-to-back order (re-exported for renderers and tools). */
export { PLANES };
