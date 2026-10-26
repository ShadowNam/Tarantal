// The deterministic hunt simulation (Tech §3.1): createSim(config) → step(commands) once per
// 1/60 s tick, snapshot() for rendering, drainEvents() for audio/FX/UI/analytics.
//
// Tick order: Stampede start → due world events → due crates → commands (in order) → hold-to-fire
// → weapon/crate-weapon/power-up/gadget timers → wind → secrets → director spawns (fly-overs,
// pop-ups, flocks) → creatures (flock FSM + steering, birds; at half rate under Boeretroos) →
// crates fall → dust devils → tick++ → end check. Shots therefore resolve against the positions the player saw in the
// previous snapshot. A shot resolves damage first (a bag scores at the behaviour the bird had),
// then Whole Flock, then the threats it makes (GDD §6.1–6.4).
import type { Biome, ContentBundle, Feesdag, Sight } from '../content/schemas';
import {
  behaviourOf,
  isHittable,
  updateBird,
  viewOf,
  type Bird,
  type BirdCreature,
} from './birds/Bird';
import { duckBoss, spookBoss, updateScripted } from './birds/scripted';
import {
  lanternsLit,
  removeThings,
  spookShape,
  startSpookjag,
  stepSpookjag,
  type Spookjag,
} from './feesdag/spookjag';
import { createCharmEngine, type FiredEffect, type TriggerContext } from './charms/interpreter';
import { CHARM_SCRIPTS } from './charms/registry';
import { clampCameraX, planeCentreX, planeToDx, quantiseHalf, tapToPlane } from './camera';
import { sanitiseCommand } from './commands';
import { msToTicks, secondsToTicks } from './clock';
import { createDirector, type DirectorContext } from './director/SpawnDirector';
import {
  FLYOVER_EVENTS,
  mergeSchedules,
  scheduleExtraEvents,
  scheduleWorldEvents,
  WORLD_EVENT_HANDLERS,
  type ScheduledEvent,
} from './director/events';
import {
  buildBossBird,
  buildDustDevil,
  buildHopperBird,
  buildPerchBird,
  buildSkyPass,
  type WorldDeps,
} from './director/worldEvents';
import type { BonusId, FlockCause, SimEvent, ThreatSource } from './events';
import { centroid, flockParams, flockView, removeMembers, type Flock } from './flocks/Flock';
import { applyThreat, forceState, tickFsm, type Transition } from './flocks/fsm';
import { moveFlock } from './flocks/steering';
import {
  reactionTargets,
  shotThreats,
  loudShotThreats,
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
import { crateView, scheduleCrates, spawnCrate, tickCrate, type Crate } from './props/crates';
import {
  activeParts,
  buildSecrets,
  hitPart,
  nearMiss,
  partPosition,
  secretView,
  tickSecret,
  type Secret,
} from './props/secrets';
import { sin } from './detmath';
import { createRng } from './rng';
import { twoFliesBonus, wholeFlockBonus } from './scoring/bonuses';
import { dropTier, frenzyMul, frenzyTier, nextStreak } from './scoring/frenzy';
import { scoreBag, scoreEventBonus } from './scoring/pipeline';
import type {
  AimView,
  BagBehaviour,
  BirdView,
  ColonyView,
  Command,
  FlockState,
  HuntResult,
  PlaneId,
  RangeTarget,
  SeasonHuntConfig,
  SimConfig,
  SimState,
} from './types';
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
  pointInOccluder,
  resolvePattern,
  resolvePellet,
  type HitBird,
  type Occluder,
  type HitExtra,
  type PelletResult,
  type ShotGeometry,
} from './weapons/hitTest';
import { pelletOffsets } from './weapons/pellets';
import {
  breathAt,
  clampStep,
  isUp,
  raiseProgress,
  raiseSight,
  sightTiming,
  swayAt,
  type Aim,
} from './weapons/sight';
import { bandGeometry, projectileBands, type Flight } from './weapons/projectile';
import {
  createWeaponState,
  isReloading,
  reloadProgress,
  startReload,
  tickWeapon,
  tryFire,
  weaponTiming,
  type PrimaryWeapon,
  type WeaponTiming,
} from './weapons/weaponState';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from './world';
import { mapOmen, resolveMap, type ResolvedMap } from './maps';
import {
  FAMILIEFOTO_SECRET,
  createColony,
  diveColony,
  familyOut,
  hitMeerkat,
  lineUp,
  shapeOf,
  stepColony,
  type ColonyCtx,
  type ColonyState,
} from './meerkats/colony';

export { FAMILIEFOTO_SECRET };

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
  /** The map's biome (layout and bonus map applied). */
  readonly biome: Biome;
  readonly map: ResolvedMap;
  readonly weapon: PrimaryWeapon;
  readonly huntSeconds: number;
  /** Biome weather on (mode config, else modes.json; D-021). */
  readonly omen: boolean;
  /** FTUE script (mode 'ftue' only). */
  readonly tutorial: Tutorial | null;
  /** Season Run hunt (mode 'seasonHunt' with a season block), else null. */
  readonly season: SeasonHuntConfig | null;
  /** v1.3: the rifle's fitted sight (hold to zoom, release to fire), else null. */
  readonly sight: Sight | null;
  /** D-048: the special day this Daily plays (feesdae.json), else null. */
  readonly feesdag: Feesdag | null;
}

type Tutorial = ContentBundle['modes']['modes']['ftue']['tutorial'];

function resolveSetup(content: ContentBundle, config: SimConfig): HuntSetup {
  const { mode } = config;
  const defaults = mode.id === 'seasonHunt' ? undefined : content.modes.modes[mode.id];
  const tutorial = mode.id === 'ftue' ? content.modes.modes.ftue.tutorial : null;
  const ranged = mode.id === 'range';
  const biomeId = mode.biome ?? defaults?.biome;
  const weaponId = mode.weapon ?? defaults?.weapon;
  const timed = defaults !== undefined && 'huntSeconds' in defaults ? defaults : undefined;
  // v1.3x (D-037): the Skietbaan has no clock (huntSeconds 0 = endless).
  const huntSeconds = ranged
    ? 0
    : (mode.huntSeconds ?? timed?.huntSeconds ?? content.run.huntSeconds);
  if (biomeId === undefined || weaponId === undefined) {
    throw new Error(`mode ${mode.id} needs a biome and a weapon`);
  }
  const baseBiome = content.biomes.find((b) => b.id === biomeId);
  if (baseBiome === undefined) throw new Error(`unknown biome ${biomeId}`);
  // v1.2 (D-033): the day's layout and bonus map; none = the biome as it is (old replays).
  if (
    (mode.layout !== undefined || mode.bonus !== undefined) &&
    mode.id !== 'classic' &&
    mode.id !== 'daily' &&
    !(ranged && mode.bonus === undefined)
  )
    throw new Error(`mode ${mode.id} plays no layout`);
  if (ranged !== (mode.range !== undefined)) throw new Error('a range block needs mode range');
  // The Skietbaan always has the Ver plane open (any gun may try any distance).
  const map = resolveMap(baseBiome, mode.layout, mode.bonus, ranged);
  const biome = ranged ? rangeBiome(map.biome, content.modes.modes.range) : map.biome;
  const weapon = content.weapons.weapons.find((w) => w.id === weaponId);
  if (weapon?.kind !== 'primary') throw new Error(`${weaponId} is not a primary weapon`);
  // Replays store huntSeconds on the 0.5 grid, so only allow values that survive that.
  if (!ranged && (!(huntSeconds > 0) || !Number.isInteger(huntSeconds * 2))) {
    throw new Error('huntSeconds must be a positive multiple of 0.5');
  }
  for (const event of biome.events) {
    if (!FLYOVER_EVENTS.has(event.id) || event.creature === undefined) continue;
    const c = content.birds.creatures.find((x) => x.id === event.creature);
    if (c === undefined || c.kind === 'helper' || !((c.speeds?.fly ?? 0) > 0)) {
      throw new Error(`event ${event.id}: creature ${event.creature} needs speeds.fly to fly over`);
    }
  }
  const season = mode.season ?? null;
  if (season !== null) checkSeason(content, mode.id, season);
  // D-048: a special day is a Daily's (the date was decided outside the sim; its id is here).
  const feesdag =
    mode.feesdag === undefined
      ? null
      : (content.feesdae.specials.find((f) => f.id === mode.feesdag) ?? null);
  if (mode.feesdag !== undefined && (feesdag === null || mode.id !== 'daily'))
    throw new Error(`special day ${mode.feesdag} needs mode daily and a feesdae.json entry`);
  const omen = ranged
    ? false
    : mapOmen(
        map.weather,
        mode.omen,
        (season === null ? defaults?.omen : season.kind === 'omen') ?? false,
      );
  return {
    biome,
    map,
    weapon,
    huntSeconds,
    omen,
    tutorial,
    season,
    sight: fittedSight(content, weapon, mode.sight),
    feesdag,
  };
}

/** v1.3x (D-037): the range's biome — the range lanes added for planes the biome gives none. */
function rangeBiome(biome: Biome, setup: ContentBundle['modes']['modes']['range']): Biome {
  const lanes = { ...biome.lanes };
  for (const plane of PLANES) {
    const lane = setup.spots[plane].lane;
    if (lane !== undefined) lanes[plane] = { ...lanes[plane], ...lane };
  }
  return { ...biome, lanes };
}

/** v1.3: the sight a rifle carries this hunt (the mode's choice, else the gun's default). */
function fittedSight(
  content: ContentBundle,
  weapon: PrimaryWeapon,
  chosen: string | undefined,
): Sight | null {
  const aim = weapon.aim;
  if (aim === undefined) {
    if (chosen !== undefined) throw new Error(`${weapon.id} takes no sight`);
    return null;
  }
  const id = chosen ?? aim.defaultSight;
  if (!aim.sights.includes(id)) throw new Error(`${weapon.id} does not fit sight ${id}`);
  const sight = content.weapons.sights.find((x) => x.id === id);
  if (sight === undefined) throw new Error(`unknown sight ${id}`);
  return sight;
}

/** A Season Run block must name real content (the run builds it; replays carry it). */
function checkSeason(content: ContentBundle, mode: string, season: SeasonHuntConfig): void {
  if (mode !== 'seasonHunt') throw new Error(`mode ${mode} cannot carry a Season Run block`);
  for (const id of season.charms) {
    if (!content.charms.charms.some((c) => c.id === id)) throw new Error(`unknown charm ${id}`);
  }
  if (season.charms.length > content.charms.slots) throw new Error('more charms than slots');
  if (new Set(season.charms).size !== season.charms.length)
    throw new Error('a charm is equipped twice');
  for (const id of season.consumables) {
    if (id !== null && !content.powerups.powerups.some((p) => p.id === id))
      throw new Error(`unknown consumable ${id}`);
  }
  if (
    season.rental !== null &&
    !content.weapons.weapons.some((w) => w.id === season.rental && w.kind === 'crate')
  ) {
    throw new Error(`${season.rental} is not a crate weapon`);
  }
  if (season.kind === 'boss') {
    const boss = content.birds.creatures.find((c) => c.id === season.boss);
    if (boss?.kind !== 'boss')
      throw new Error(`boss hunt needs a boss creature, not ${String(season.boss)}`);
  }
  if (!Number.isInteger(season.runShellBonus) || season.runShellBonus < 0)
    throw new Error('runShellBonus must be a whole number ≥ 0');
}

/** Season Run: the primary's belt and reload with charm passives and the Boss Rule applied.
 *  A weapon with no belt (Kettie) has no reload: its draw (fire cooldown) is its reload, so reload
 *  charms (Snelhand) shorten it and Kuifkop Koning's "reload twice as long" doubles it (D-025). */
function seasonTiming(
  base: WeaponTiming,
  shellBonus: number,
  reloadSpeedMul: number,
  reloadMul: number,
): WeaponTiming {
  const unlimited = base.magazine < 0;
  return {
    ...base,
    magazine: unlimited ? base.magazine : Math.max(1, base.magazine + shellBonus),
    reloadTicks: Math.max(1, Math.round(base.reloadTicks / reloadSpeedMul)) * reloadMul,
    cooldownTicks: unlimited
      ? Math.max(1, Math.round(base.cooldownTicks / reloadSpeedMul)) * reloadMul
      : base.cooldownTicks,
  };
}

/** A fired shot until it resolves (at once, or when a Kettie stone lands). */
interface ShotContext {
  readonly shotId: number;
  readonly shot: ShotStats;
  readonly shellIndex: number | null;
  readonly lastShell: boolean;
  /** Camera centre when fired (impacts are screen dx from it). */
  readonly cx: number;
}

/** A pellet that has landed: where (screen px for the shot's camera) and on what. */
interface Landed {
  readonly dx: number;
  readonly sy: number;
  readonly r: PelletResult;
}

/** The numbers a shot needs from whichever weapon is active (primary or crate weapon). */
interface ShotStats {
  readonly id: string;
  readonly pellets: number;
  readonly spreadPx: number;
  readonly alertRadiusPx: number;
  readonly windSensitivity: number;
  readonly scoreMul: PrimaryWeapon['scoreMul'];
  /** v1.3: reaches the Ver plane (rifles); everything else falls short of it. */
  readonly reachesVer: boolean;
  /** v1.4: every shot threatens every flock (Die Langloop). */
  readonly alertsAllFlocks: boolean;
}

export function createSim(config: SimConfig): Sim {
  const { content, mode, inputKind } = config;
  const assistMul = content.scoring.aimAssistLevels[config.aimAssist ?? 'standard'];
  const { scoring } = content;
  const setup = resolveSetup(content, config);
  const { biome, weapon } = setup;
  // v1.3x (D-037) Skietbaan: endless and unscored; its targets come from the range program.
  const rangeCfg = mode.id === 'range' ? (mode.range ?? null) : null;
  if (rangeCfg !== null && config.rangeProgram === undefined)
    throw new Error('mode range needs its spawn program (SimConfig.rangeProgram)');
  const ranged = rangeCfg !== null;
  const rangeCrate =
    rangeCfg?.crate === undefined
      ? null
      : (content.weapons.weapons.find((w) => w.id === rangeCfg.crate && w.kind === 'crate') ??
        null);
  if (rangeCfg?.crate !== undefined && rangeCrate === null)
    throw new Error(`${rangeCfg.crate} is not a crate weapon`);
  const { pointsMul, planePointsMul } = setup.map;
  /** v1.2: the map's points multiplier on a bird's base points (dusk: fewer birds, worth more);
   *  v1.4 B: times the map's multiplier for the bird's plane. */
  const mapPoints = (base: number, plane: PlaneId): number => {
    const k = pointsMul * (planePointsMul[plane] ?? 1);
    return k === 1 ? base : Math.round(base * k);
  };
  /** Pacing and the event schedule use the hunt's original length; bonus time only moves the
   *  end and the Stampede (D-021). */
  const baseDurationTicks = secondsToTicks(setup.huntSeconds);
  let durationTicks = baseDurationTicks;
  const season = setup.season;
  const charmDefs = (season?.charms ?? []).map((id) => {
    const c = content.charms.charms.find((x) => x.id === id);
    if (c === undefined) throw new Error(`unknown charm ${id}`);
    return c;
  });
  const hasCharms = charmDefs.length > 0;
  const charms = createCharmEngine(charmDefs, CHARM_SCRIPTS);
  const pass = charms.passives;
  const seasonBoss =
    season?.kind === 'boss' ? content.birds.creatures.find((c) => c.id === season.boss) : undefined;
  /** run.json bossRules id in force (GDD §13.3), applied whatever boss stands in (M6: Generaal). */
  const bossRule = seasonBoss?.kind === 'boss' ? seasonBoss.bossRule : null;
  const bossExempt = seasonBoss?.kind === 'boss' && seasonBoss.exemptFromOwnBossRule === true;
  const blastDef =
    pass.weaponBlastEvery === null
      ? null
      : (content.weapons.weapons.find(
          (w) => w.id === pass.weaponBlastEvery?.weapon && w.kind === 'crate',
        ) ?? null);
  const stampedeEnabled =
    scoring.stampede.modes.includes(mode.id) || mode.stampede === true || pass.enableStampede;
  let stampedeAtTick: number | null = stampedeEnabled
    ? Math.max(0, durationTicks - secondsToTicks(scoring.stampede.lastSeconds))
    : null;

  const rng = createRng(config.seed);
  const timing =
    season === null
      ? weaponTiming(weapon)
      : seasonTiming(
          weaponTiming(weapon),
          pass.shellCapacity + season.runShellBonus,
          pass.reloadSpeedMul,
          bossRule === 'reloadDouble' ? 2 : 1,
        );
  const weaponState = createWeaponState(timing);
  const reloadFloorTicks = Math.max(1, msToTicks(content.powerups.reloadFloorMs));
  const fParams = flockParams(content);
  const flockRng = rng.stream('flockNoise');
  const twistRng = rng.stream('twist');
  const runChance = biome.twist?.flushAsRunChance ?? 0;
  const omenRng = rng.stream('omen');
  const director = createDirector({
    content,
    biome,
    durationTicks,
    spawns: rng.stream('spawns'),
    flocks: rng.stream('flocks'),
    flockParams: fParams,
    rateMul: setup.tutorial?.spawnRateMul ?? 1,
  });
  // FTUE beats (GDD §16): fractions of the original length, in time order.
  const tutorialBeats = (setup.tutorial?.beats ?? [])
    .map((b, i) => ({ ...b, tick: Math.floor(b.at * baseDurationTicks), i }))
    .sort((a, b) => a.tick - b.tick || a.i - b.i);
  let beatCursor = 0;
  const firstHitAssistPx = setup.tutorial?.firstHitAssistPx ?? 0;
  /** A flock has run or flushed this hunt (the FTUE dog only comes if none has). */
  let flockRan = false;
  const planeGeo: PlaneGeometry = {
    near: { scrollFactor: scoring.planes.near.scrollFactor, scale: scoring.planes.near.scale },
    mid: { scrollFactor: scoring.planes.mid.scrollFactor, scale: scoring.planes.mid.scale },
    far: { scrollFactor: scoring.planes.far.scrollFactor, scale: scoring.planes.far.scale },
    ver: { scrollFactor: scoring.planes.ver.scrollFactor, scale: scoring.planes.ver.scale },
  };
  const stampedeFlockState = biome.pacing.stampede.flockState ?? null;
  const vuvuzela = content.weapons.gadgets[0] ?? null;
  /** The gadget button: the Vuvuzela, or a charm that replaces it (Fluitjie: no charge limit,
   *  its own cooldown). */
  const gadgetDef = ranged
    ? null
    : pass.gadget !== null
      ? { id: pass.gadget.charm, cooldownMs: pass.gadget.cooldownMs, charges: -1, charm: true }
      : vuvuzela === null
        ? null
        : {
            id: vuvuzela.id,
            cooldownMs: vuvuzela.cooldownMs,
            // Season Run gadget charges are the Classic number (D-020).
            charges: vuvuzela.chargesPerClassicHunt,
            charm: false,
          };
  const gadgetCooldownTicks = gadgetDef === null ? 0 : msToTicks(gadgetDef.cooldownMs);
  const baseSchedule = ranged
    ? []
    : scheduleWorldEvents(
        biome,
        mode.id,
        setup.omen,
        durationTicks,
        rng.stream('events'),
        season?.kind === 'boss',
      );
  const schedule =
    pass.spawnRateMul.size === 0
      ? baseSchedule
      : mergeSchedules(
          baseSchedule,
          scheduleExtraEvents(
            biome,
            mode.id,
            setup.omen,
            durationTicks,
            pass.spawnRateMul,
            rng.stream('charms'),
          ),
        );
  // Stormvoël rule (GDD §13.3): dark except lightning, never above maxFlashesPerSecond (schema).
  const lightningRule = bossRule === 'darkExceptLightning' ? content.run.bossRules[bossRule] : null;
  const lightningTicks: number[] = [];
  let flashTicks = 0;
  if (lightningRule !== null && lightningRule !== undefined) {
    // The schema requires both for darkExceptLightning.
    const every = lightningRule.flashEverySeconds;
    if (every === undefined || lightningRule.flashMs === undefined)
      throw new Error('darkExceptLightning needs flashEverySeconds and flashMs');
    flashTicks = msToTicks(lightningRule.flashMs);
    const lr = rng.stream('lightning');
    for (let t = lr.range(every[0], every[1]); ; t += lr.range(every[0], every[1])) {
      const at = secondsToTicks(t);
      if (at >= durationTicks) break;
      lightningTicks.push(at);
    }
  }
  let lightningCursor = 0;
  // M8: one lightning timeline. The Kalahari storm (omen) and Die Stormvoël's own flashes (any
  // hunt he flies in without his boss rule, at his rule's cadence) are drawn at run time from the
  // 'storm' stream; every flash, whatever its source, keeps the shared gap (≤ the lowest
  // maxFlashesPerSecond in play, D-025). The boss rule's own schedule above is unchanged.
  const storm = setup.omen ? (biome.omen.storm ?? null) : null;
  const stormTick = storm === null ? null : Math.floor(storm.stormAt * baseDurationTicks);
  const hazePeriodTicks = storm === null ? 1 : Math.max(1, secondsToTicks(storm.hazePeriodSeconds));
  // v1.4 B (D-039): the Namibië mirage (omen): far and Ver birds shimmer all hunt.
  const mirage = setup.omen ? (biome.omen.mirage ?? null) : null;
  const miragePeriodTicks =
    mirage === null ? 1 : Math.max(1, secondsToTicks(mirage.hazePeriodSeconds));
  const stormRng = rng.stream('storm');
  const voelRule = ((): {
    every: readonly [number, number];
    flashMs: number;
    max: number;
  } | null => {
    for (const ev of biome.events) {
      const c = content.birds.creatures.find((x) => x.id === ev.creature);
      if (c?.kind !== 'boss' || !c.behaviours.includes('lightningOnly')) continue;
      const r = content.run.bossRules[c.bossRule];
      if (r?.flashEverySeconds === undefined || r.flashMs === undefined) continue;
      return { every: r.flashEverySeconds, flashMs: r.flashMs, max: r.maxFlashesPerSecond ?? 3 };
    }
    return null;
  })();
  const flashCaps = [
    ...(lightningRule !== null && lightningRule !== undefined
      ? [lightningRule.maxFlashesPerSecond ?? 3]
      : []),
    ...(storm === null ? [] : [storm.maxFlashesPerSecond]),
    ...(voelRule === null ? [] : [voelRule.max]),
  ];
  const flashGapTicks = Math.ceil(60 / Math.min(3, ...flashCaps));
  let lastFlashTick = -Infinity;
  let nextOwnFlash = -1;
  let scheduleCursor = 0;
  const crateCfg = content.powerups.crates;
  const crateTicks = ranged
    ? []
    : scheduleCrates(crateCfg, mode.id, durationTicks, rng.stream('crates'));
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
      ver: scoring.planes.ver.scale,
    },
    assistPx:
      inputKind === 'touch'
        ? {
            near: scoring.planes.near.aimAssistPx * assistMul,
            mid: scoring.planes.mid.aimAssistPx * assistMul,
            far: scoring.planes.far.aimAssistPx * assistMul,
            ver: scoring.planes.ver.aimAssistPx * assistMul,
          }
        : { near: 0, mid: 0, far: 0, ver: 0 },
  };
  /** Kettie flight bands (delayed hitscan, Tech §3.4); null for hitscan weapons. */
  const bands =
    weapon.projectile === null
      ? null
      : projectileBands(
          weapon.projectile,
          // Stones fall short of the Ver plane (v1.3): its layer is never in their flight.
          geometry.slices.filter((sl) => sl.plane !== 'ver'),
          {
            near: planeGeo.near.scrollFactor,
            mid: planeGeo.mid.scrollFactor,
            far: planeGeo.far.scrollFactor,
          },
        );
  // FTUE "generous first hit" (GDD §16): wider radii until the first bag.
  const firstHitGeometry: ShotGeometry =
    firstHitAssistPx > 0
      ? {
          ...geometry,
          assistPx: {
            near: geometry.assistPx.near + firstHitAssistPx,
            mid: geometry.assistPx.mid + firstHitAssistPx,
            far: geometry.assistPx.far + firstHitAssistPx,
            ver: geometry.assistPx.ver + firstHitAssistPx,
          },
        }
      : geometry;
  // M9 (D-026): touch aim assist rescues a missed shot (snap to the bird under the aim point)
  // instead of growing every pellet's target. Hitscan pellets resolve at the real hitboxes (plus
  // the FTUE's first-hit help); pointer input never has assist, so its shots are unchanged.
  const touchAssistPx = geometry.assistPx;
  const touchAssist =
    touchAssistPx.near > 0 ||
    touchAssistPx.mid > 0 ||
    touchAssistPx.far > 0 ||
    touchAssistPx.ver > 0;
  const withoutTouchAssist = (g: ShotGeometry): ShotGeometry =>
    touchAssist
      ? {
          ...g,
          assistPx: {
            near: g.assistPx.near - touchAssistPx.near,
            mid: g.assistPx.mid - touchAssistPx.mid,
            far: g.assistPx.far - touchAssistPx.far,
            ver: g.assistPx.ver - touchAssistPx.ver,
          },
        }
      : g;
  const preciseGeometry = withoutTouchAssist(geometry);
  const preciseFirstHitGeometry = withoutTouchAssist(firstHitGeometry);
  /** v1.3: a shot that falls short of the Ver plane never meets anything on its layer. */
  const hasVer = geometry.slices.some((sl) => sl.plane === 'ver');
  const reach = (g: ShotGeometry, ver: boolean): ShotGeometry =>
    ver || !hasVer ? g : { ...g, slices: g.slices.filter((sl) => sl.plane !== 'ver') };

  // v1.3 rifles (D-036): the fitted sight, its zoom step and the sight while it is held.
  const sight = setup.sight === null ? null : sightTiming(setup.sight);
  const swayRng = rng.stream('sway');
  let zoomStep = 0;
  let aim: Aim | null = null;

  // --- state -----------------------------------------------------------------------------
  let tick = 0;
  let over = false;
  // v1.2: a map may open the hunt elsewhere along the pan (on its feeding spot).
  const startU = ranged ? content.modes.modes.range.cameraU : biome.cameraStartU;
  let cameraX = clampCameraX(
    startU === undefined
      ? (CAMERA_MIN_X + CAMERA_MAX_X) / 2
      : quantiseHalf(CAMERA_MIN_X + startU * (CAMERA_MAX_X - CAMERA_MIN_X)),
  );
  const rangeProgram =
    rangeCfg === null || config.rangeProgram === undefined
      ? null
      : config.rangeProgram({
          content,
          biome,
          range: rangeCfg,
          cameraX,
          rng: rng.stream('range'),
        });
  const papers = rangeProgram?.papers ?? [];
  /** Range shots not yet landed: the target a miss is counted for, and the aim (screen). */
  const rangeShots = new Map<
    number,
    { plane: PlaneId; target: RangeTarget; cx: number; dx: number; sy: number }
  >();
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
  let gadgetCharges = gadgetDef?.charges ?? 0;
  let gadgetCooldown = 0;
  // The Skietbaan has no secrets (nothing scores there).
  const secrets: Secret[] = ranged ? [] : buildSecrets(biome);
  let lastSecretTick: number | null = null;
  let crates: Crate[] = [];
  // v1.7 (D-044): the desert maps' meerkat colonies (none in the Skietbaan).
  const mk = content.birds.meerkats;
  const meerkatRng = rng.stream('meerkats');
  let nextMeerkatId = 1;
  const sunbatheLight =
    (setup.map.layout?.light ?? null) !== null &&
    mk.sunbatheLights.includes(setup.map.layout?.light ?? '');
  const colonies: ColonyState[] = [];
  // D-048: the special day's twist (Halloween's Spookjag), from its own stream.
  const spook: Spookjag | null =
    setup.feesdag === null
      ? null
      : startSpookjag({
          twist: setup.feesdag.twist,
          biome,
          planes: scoring.planes,
          durationTicks,
          rng: rng.stream('feesdag'),
        });
  const spookTally = { bats: 0, owls: 0 };
  if (!ranged) {
    for (const def of biome.colonies ?? []) {
      const layer = layerById.get(def.layer);
      const plane = layer?.plane;
      if (layer === undefined || plane === undefined) continue;
      colonies.push(
        createColony(
          def,
          { id: layer.id, scrollFactor: layer.scrollFactor, plane },
          scoring.planes[plane].scale,
          mk,
          meerkatRng,
          () => nextMeerkatId++,
          sunbatheLight,
        ),
      );
    }
  }
  const mkCalmTicks = secondsToTicks(mk.calmSeconds);
  const mkCooldownTicks = secondsToTicks(mk.hit.cooldownSeconds);
  const mkHoldTicks = secondsToTicks(mk.familiefoto.holdSeconds);
  /** The tick of the last shot (calm colonies, the Familiefoto's held fire). */
  let lastShotTick = -mkCalmTicks;
  /** The Familiefoto: paid once per hunt; the colony lining up for it now. */
  let photoDone = false;
  let photoColony: ColonyState | null = null;
  /** Points of each shot meerkat's hit, said again when it scolds. */
  const scoldPoints = new Map<number, number>();
  const colonyCtx = (): ColonyCtx => ({
    tuning: mk,
    rng: meerkatRng,
    sunbathe: sunbatheLight,
    calm: tick - lastShotTick >= mkCalmTicks,
  });
  const powerups: ActivePowerup[] = [];
  let crateWeapon: CrateWeaponState | null = null;
  /** Kettie stones in the air, in fire order, and their shots. */
  let flights: Flight[] = [];
  const stoneShots = new Map<number, ShotContext>();
  /** Held fire position (fireHoldStart … fireHoldEnd). */
  let hold: { dx: number; sy: number } | null = null;
  const wind =
    setup.omen && biome.omen.wind !== undefined ? createWind(biome.omen.wind, omenRng) : null;
  let dustDevils: DustDevil[] = [];
  /** Bushveld low sun (omen): which side of the view the glare is on, drawn once (D-025). */
  /** Okavango water zones as occluder shapes on their layers (twist, every mode). */
  const splash =
    biome.twist?.splash === undefined
      ? null
      : {
          alertRadiusPx: biome.twist.splash.alertRadiusPx,
          zones: biome.twist.splash.zones.map((z) => {
            const f = layerById.get(z.layer)?.scrollFactor ?? 1;
            const sh = z.shape;
            const occluder: Occluder = {
              propId: '',
              x: z.u * coreWidth(f) + sh.ox,
              y: z.y + sh.oy,
              shape:
                sh.type === 'rect'
                  ? { type: 'rect', w: sh.w, h: sh.h }
                  : { type: 'ellipse', rx: sh.rx, ry: sh.ry },
            };
            return { scrollFactor: f, occluder };
          }),
        };
  /** Okavango sun-showers (omen): rain intervals drawn once (D-025). */
  const showers = setup.omen ? (biome.omen.showers ?? null) : null;
  const rainSpells: { from: number; to: number }[] = [];
  if (showers !== null) {
    for (let t = omenRng.range(showers.everySeconds[0], showers.everySeconds[1]); ;) {
      const from = secondsToTicks(t);
      if (from >= durationTicks) break;
      const last = omenRng.range(showers.lastSeconds[0], showers.lastSeconds[1]);
      rainSpells.push({ from, to: secondsToTicks(t + last) });
      t += last + omenRng.range(showers.everySeconds[0], showers.everySeconds[1]);
    }
  }
  const raining = (): boolean => rainSpells.some((r) => tick >= r.from && tick < r.to);
  let wasRaining = false;
  const glare =
    setup.omen && biome.omen.glare !== undefined
      ? { side: omenRng.chance(0.5) ? (1 as const) : (-1 as const), ...biome.omen.glare }
      : null;
  /** Creature time accumulator (Boeretroos slows creatures, GDD §10.4). */
  let creatureClock = 0;
  // Season Run state.
  let primaryShots = 0;
  /** v1.6b Oupa Laai: ticks since the last shot of any gun (the per-shell idle top-up). */
  let ticksSinceShot = 0;
  let huntDoppies = 0;
  let shellCapacityGain = 0;
  let bossesBagged = 0;
  const consumables: (string | null)[] = [...(season?.consumables ?? [])];
  const consumablesUsed: number[] = [];
  let rental = season?.rental ?? null;
  let rentalUsed = false;
  /** Boeretroos-Fles slow-mo (creatures only, like the Boeretroos power-up). */
  let slowMoTicks = 0;
  let slowMoScale = 1;
  let lightningLeft = 0;
  const charmQueue: FiredEffect[] = [];
  let applyingCharms = false;
  let events: SimEvent[] = [];
  const stats = {
    shots: 0,
    hitShots: 0,
    bagged: 0,
    baggedByPlane: { near: 0, mid: 0, far: 0, ver: 0 } as Record<PlaneId, number>,
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
  for (const c of colonies)
    emit({
      type: 'colonySpawned',
      tick: 0,
      colonyId: c.id,
      plane: c.plane,
      x: c.cx,
      y: c.ground,
      family: c.meerkats.length,
    });
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
    if (tr.to === 'run' || tr.to === 'flush') flockRan = true;
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
    if (tr.to === 'alert') charmTrigger('flockAlerted');
    else if (tr.to === 'flush') charmTrigger('flockFlushed');
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
      // Biome twist (Bushveld): some flocks run instead of taking wing (own stream, D-025).
      if (runChance > 0) f.runsOnly = twistRng.chance(runChance);
      // Kalahari storm: in the rain every flock runs (GDD §11 "rain makes flocks run not fly").
      if (stormActive()) f.runsOnly = true;
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

  // --- charms (Tech §3.8) ------------------------------------------------------------------
  function kwevoelCalling(): boolean {
    return birds.some((b) => b.phase === 'perch' && b.creature.behaviours.includes('perchHigh'));
  }

  function charmCtx(extra: Partial<TriggerContext> = {}): TriggerContext {
    return {
      streak,
      frenzyTier: frenzyTier(streak, scoring.frenzyTiers),
      omenActive: setup.omen,
      omen: setup.omen ? biome.omen.id : null,
      biome: biome.id,
      kwevoelCalling: kwevoelCalling(),
      weapon: crateWeapon?.def.id ?? weapon.id,
      ...extra,
    };
  }

  function charmTrigger(on: string, extra: Partial<TriggerContext> = {}): void {
    if (!hasCharms) return;
    applyCharms(charms.trigger(on, charmCtx(extra)));
  }

  /** Applies fired charm actions in order. Actions that set off more triggers (a flush from a
   *  charm sets off flockFlushed) queue behind the current ones instead of nesting. */
  function applyCharms(fired: readonly FiredEffect[]): void {
    if (fired.length === 0) return;
    charmQueue.push(...fired);
    if (applyingCharms) return;
    applyingCharms = true;
    for (let f = charmQueue.shift(); f !== undefined; f = charmQueue.shift()) applyCharm(f);
    applyingCharms = false;
  }

  function applyCharm(f: FiredEffect): void {
    emit({ type: 'charmTriggered', tick, charm: f.charm, slot: f.slot, trigger: f.trigger });
    const a = f.actions;
    if (a.addShells !== undefined) addShells(a.addShells);
    if (a.shellCapacityForRun !== undefined) shellCapacityGain += a.shellCapacityForRun;
    if (a.alertNearestFlock === true) {
      // A flushing flock can't be nudged further: Fluitjie skips it (like Bles).
      const t = nearestVisibleFlock(['flush']);
      if (t !== null) threaten([t], 'gadget');
    }
    if (a.flushFlocks !== undefined) {
      const targets = visibleFlocksByDistance(['flush']);
      const n = a.flushFlocks === true ? targets.length : a.flushFlocks;
      applyReaction('flush', targets.slice(0, n), 'event');
    }
    if (a.spawnEvent !== undefined) spawnCharmEvent(a.spawnEvent);
    if (a.slowMo !== undefined) {
      slowMoTicks = msToTicks(a.slowMo.ms);
      slowMoScale = a.slowMo.scale;
      emit({ type: 'slowMo', tick, ticks: slowMoTicks, scale: slowMoScale });
    }
    if (a.addTime !== undefined) addTime(secondsToTicks(a.addTime));
    if (a.addDoppies !== undefined) addDoppies(a.addDoppies, null);
  }

  function addShells(n: number): void {
    if (crateWeapon !== null || timing.magazine < 0) return;
    const before = weaponState.shells;
    weaponState.shells = Math.min(timing.magazine, before + n);
    if (weaponState.shells > before) {
      emit({
        type: 'shellsAdded',
        tick,
        added: weaponState.shells - before,
        shells: weaponState.shells,
      });
    }
  }

  function addDoppies(n: number, birdId: number | null): void {
    if (season === null || n === 0) return;
    huntDoppies += n;
    emit({ type: 'doppiesFound', tick, amount: n, total: huntDoppies, birdId });
  }

  /** Visible flocks, nearest the screen centre first, skipping flocks in `skip` states. */
  function visibleFlocksByDistance(skip: readonly FlockState[]): FlockThreat[] {
    const found = reactionTargets(flocks, { kind: 'visible' }, cameraX, planeGeo)
      .filter((t) => !skip.includes(t.flock.state))
      .map((t) => ({
        t,
        d: Math.abs(
          centroid(t.flock).x - planeCentreX(cameraX, planeGeo[t.flock.plane].scrollFactor),
        ),
      }));
    // Stable: equal distances keep flock order.
    return found
      .map((x, i) => ({ ...x, i }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .map((x) => x.t);
  }

  function nearestVisibleFlock(skip: readonly FlockState[]): FlockThreat | null {
    return visibleFlocksByDistance(skip)[0] ?? null;
  }

  /** Bles die Plaashond (GDD §13.5): the visible flock nearest the centre starts to RUN. */
  function runFarmDog(): void {
    emit({ type: 'worldEvent', tick, event: 'farmDog' });
    const t = nearestVisibleFlock(['run', 'flush']);
    if (t !== null)
      emitTransition(t.flock, forceState(t.flock, 'run', t.x, 'event', fParams, flockRng));
  }

  /** A charm's spawnEvent: the biome's own entry for that event, or the farm dog. */
  function spawnCharmEvent(id: ScheduledEvent['id']): void {
    if (WORLD_EVENT_HANDLERS[id] === 'farmDog') {
      runFarmDog();
      return;
    }
    const index = biome.events.findIndex((e) => e.id === id);
    if (index < 0) return;
    runWorldEvent({ tick, index, id, creature: biome.events[index]?.creature ?? null });
  }

  // --- weapons and power-ups -------------------------------------------------------------
  function shotStats(): ShotStats {
    return statsOf(crateWeapon?.def ?? weapon);
  }

  function statsOf(
    w: Omit<ShotStats, 'reachesVer' | 'alertsAllFlocks'> & {
      readonly reachesVer?: boolean | undefined;
      readonly alertsAllFlocks?: boolean | undefined;
    },
  ): ShotStats {
    return {
      id: w.id,
      pellets: w.pellets,
      spreadPx: w.spreadPx,
      alertRadiusPx: w.alertRadiusPx,
      windSensitivity: w.windSensitivity,
      scoreMul: w.scoreMul,
      reachesVer: w.reachesVer === true,
      alertsAllFlocks: w.alertsAllFlocks === true,
    };
  }

  /** Holding fire keeps firing: a hold-to-fire crate weapon, or auto-fire on the primary. */
  function holdFires(): boolean {
    if (crateWeapon !== null) return crateWeapon.def.holdToFire === true;
    return effectsOf(powerups).autoFire;
  }

  function startPowerup(id: string, source: 'crate' | 'secret' | 'consumable'): void {
    const def = content.powerups.powerups.find((p) => p.id === id);
    if (def === undefined) return;
    activate(powerups, def);
    emit({ type: 'powerupStarted', tick, powerup: id, source });
  }

  /** v1.6b: a reload step (or the Kettie draw, or the Voorlaaier ramrod) with power-ups applied.
   *  Blitslaai multiplies on top of Snelhand and the Boss Rule; never below reloadFloorMs (and
   *  never longer than it was). */
  function reloadLen(ticks: number): number {
    const mul = effectsOf(powerups).reloadTimeMul;
    if (mul === 1) return ticks;
    return Math.min(ticks, Math.max(reloadFloorTicks, Math.round(ticks * mul)));
  }

  /** v1.6b Oupa Laai: an empty gun starts its reload by itself; a per-shell gun also tops up
   *  after a while without a shot. Nothing to do under Chilli Biltong or with a crate weapon. */
  function autoReload(): void {
    const idle = ticksSinceShot++;
    if (crateWeapon !== null || timing.magazine < 0 || isReloading(weaponState)) return;
    const fx = effectsOf(powerups);
    if (!fx.autoReload || fx.infiniteAmmo) return;
    const empty = weaponState.shells <= 0;
    const topUp =
      timing.perShell &&
      fx.idleTopUpTicks !== null &&
      idle >= fx.idleTopUpTicks &&
      weaponState.cooldownTicks === 0;
    if (!empty && !topUp) return;
    if (!startReload(weaponState, timing, reloadLen(timing.reloadTicks), true)) return;
    endAim('reload');
    emit({ type: 'reloadStarted', tick, perShell: timing.perShell, auto: true });
    charmTrigger('reload');
  }

  function endPowerups(ids: readonly string[]): void {
    for (const id of ids) emit({ type: 'powerupEnded', tick, powerup: id });
  }

  function armWeapon(id: string): void {
    const def = content.weapons.weapons.find((w) => w.id === id);
    if (def?.kind !== 'crate') return;
    crateWeapon = armCrateWeapon(def);
    hold = null;
    endAim('weapon');
    emit({ type: 'weaponChanged', tick, weapon: def.id, kind: 'crate' });
  }

  /** Uses a shell (or crate-weapon shot). Returns the shells left to report, or null when the
   *  shot doesn't go off. */
  function pullTrigger(): number | null {
    if (crateWeapon !== null) {
      if (!tryFireCrate(crateWeapon, reloadLen)) return null;
      ticksSinceShot = 0;
      return crateWeapon.shotsLeft ?? -1;
    }
    if (effectsOf(powerups).infiniteAmmo) {
      // Chilli Biltong: no shells used, no reload (GDD §10.4).
      if (weaponState.cooldownTicks > 0) return null;
      ticksSinceShot = 0;
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
    ticksSinceShot = 0;
    // The Kettie's draw is its reload (D-025): Blitslaai shortens it too (D-043).
    if (timing.magazine < 0) weaponState.cooldownTicks = reloadLen(weaponState.cooldownTicks);
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
    // D-048: the Spookjag's bats, owls and lit lanterns come first in their plane's layer.
    for (const t of spook?.things ?? []) {
      const layerId = planeLayer.get(t.plane);
      const shape = spook === null ? null : spookShape(spook, t, scoring.planes);
      if (layerId === undefined || shape === null) continue;
      add(layerId, {
        kind: 'spook',
        spookId: t.id,
        x: t.x,
        y: t.y,
        shape: { type: 'ellipse', ...shape },
      });
    }
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
    // v1.7: meerkats come after the crates (a crate is drawn in the plane's overlay, over the
    // meerkats in the layer's fixtures) and before the secret parts.
    for (const c of colonies) {
      for (const m of c.meerkats) {
        const kind = shapeOf(m.pose);
        if (kind === null) continue;
        const box = mk.hitboxes[kind];
        const k = c.scale * (m.pup ? mk.pupScale : 1);
        add(c.layerId, {
          kind: 'meerkat',
          meerkatId: m.id,
          x: m.x + box.body.ox * k * m.facing,
          y: m.y + box.body.oy * k,
          shape: { type: 'ellipse', rx: box.body.rx * k, ry: box.body.ry * k },
        });
        if (box.head !== undefined)
          add(c.layerId, {
            kind: 'meerkat',
            meerkatId: m.id,
            x: m.x + box.head.ox * k * m.facing,
            y: m.y + box.head.oy * k,
            shape: { type: 'ellipse', rx: box.head.r * k, ry: box.head.r * k },
          });
      }
    }
    for (const p of papers) {
      const layerId = planeLayer.get(p.plane);
      if (layerId === undefined) continue;
      add(layerId, {
        kind: 'paper',
        paperId: p.id,
        x: p.x,
        y: p.y,
        shape: { type: 'ellipse', rx: p.r, ry: p.r },
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

  /** Birds as hit-test targets, front-most first per plane (higher ids are drawn on top). */
  function hitBirds(): Record<PlaneId, HitBird[]> {
    const byPlane: Record<PlaneId, HitBird[]> = { near: [], mid: [], far: [], ver: [] };
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      if (b === undefined) continue;
      byPlane[b.plane].push({
        id: b.id,
        plane: b.plane,
        x: b.x + hazeDx(b),
        y: b.y,
        facing: b.facing,
        hitbox: b.creature.hitbox,
        hittable: canHit(b),
        snappable: b.creature.kind === 'target' || b.creature.kind === 'boss',
      });
    }
    return byPlane;
  }

  /** A lightning flash, unless one came less than the shared gap ago (photosensitivity, D-025). */
  function flash(ticks: number): void {
    if (tick - lastFlashTick < flashGapTicks) return;
    lastFlashTick = tick;
    lightningLeft = Math.max(lightningLeft, ticks);
    emit({ type: 'lightning', tick, ticks });
  }

  const stormActive = (): boolean => stormTick !== null && tick >= stormTick;

  /** The Kalahari thunderstorm breaks: rain, and every flock runs instead of flying. */
  function startStorm(): void {
    emit({ type: 'weatherChanged', tick, rain: true });
    for (const f of flocks) f.runsOnly = true;
  }

  /** Storm lightning, or Die Stormvoël's own flashes when no boss rule lights the hunt. */
  function ownLightning(): void {
    const src =
      storm !== null && stormActive()
        ? { every: storm.lightningEverySeconds, flashMs: storm.flashMs }
        : voelRule !== null &&
            lightningTicks.length === 0 &&
            birds.some((b) => b.creature.behaviours.includes('lightningOnly'))
          ? voelRule
          : null;
    if (src === null) {
      nextOwnFlash = -1;
      return;
    }
    const gap = (): number => secondsToTicks(stormRng.range(src.every[0], src.every[1]));
    if (nextOwnFlash < 0) nextOwnFlash = tick + gap();
    else if (tick >= nextOwnFlash) {
      flash(msToTicks(src.flashMs));
      nextOwnFlash = tick + gap();
    }
  }

  /** Hittable now: Die Stormvoël (lightningOnly) only while lightning lights him up. */
  function canHit(b: Bird): boolean {
    if (!isHittable(b)) return false;
    return !b.creature.behaviours.includes('lightningOnly') || lightningLeft > 0;
  }

  /** Kalahari heat haze (omen, before the storm): far-plane birds wobble sideways — the hitbox
   *  with them, so what you see is what you hit (D-025). */
  function hazeDx(b: Bird): number {
    if (mirage !== null && (b.plane === 'far' || b.plane === 'ver')) {
      const px = b.plane === 'far' ? mirage.hazePx : mirage.verPx;
      return px * sin((2 * Math.PI * tick) / miragePeriodTicks + b.id * 1.7);
    }
    if (storm === null || b.plane !== 'far' || stormActive()) return 0;
    return storm.hazePx * sin((2 * Math.PI * tick) / hazePeriodTicks + b.id * 1.7);
  }

  /** The snapshot of a bird, with the haze and the lit-only rule applied. */
  function birdView(b: Bird): BirdView {
    const v = viewOf(b);
    const dx = hazeDx(b);
    const hittable = canHit(b);
    return dx === 0 && hittable === v.hittable ? v : { ...v, x: v.x + dx, hittable };
  }

  /** Wind drift of a shot, in screen px on the far plane and behind (Tech §3.4). */
  function shotDrift(shot: ShotStats): number {
    return windDriftPx(wind, shot.windSensitivity) * pass.windDriftMul;
  }

  /**
   * Where a pellet (or stone) that stopped with result `r` landed, and its pelletImpact event: a
   * pellet that stopped at or behind the far plane (or flew on into the sky) lands downwind, so
   * threats and the puff follow the drift (Tech §3.4).
   */
  function landPellet(
    shotId: number,
    pdx: number,
    psy: number,
    r: PelletResult,
    drift: number,
    cx: number | null,
  ): Landed {
    const farFactor = planeGeo.far.scrollFactor;
    const plane = r.birdId === null ? null : (birds.find((b) => b.id === r.birdId)?.plane ?? null);
    const landedFar =
      r.birdId !== null
        ? plane === 'far' || plane === 'ver'
        : r.meerkatId !== undefined
          ? false
          : r.spookId !== undefined
            ? spook?.things.find((t) => t.id === r.spookId)?.plane === 'far'
            : r.crateId !== null
              ? crateCfg.plane === 'far'
              : r.propId !== null
                ? (propLayerFactor.get(r.propId) ?? 1) <= farFactor
                : true;
    const ldx = landedFar ? pdx + drift : pdx;
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
      ...(r.paperId === undefined ? {} : { paperId: r.paperId }),
      ...(r.meerkatId === undefined ? {} : { meerkatId: r.meerkatId }),
      ...(r.spookId === undefined ? {} : { spookId: r.spookId }),
      ...(cx === null ? {} : { cx }),
    });
    return { dx: ldx, sy: psy, r };
  }

  function driftOn(drift: number): (f: number) => number {
    const farFactor = planeGeo.far.scrollFactor;
    return (f: number): number => (f <= farFactor ? drift : 0);
  }

  /** `how`: v1.3 rifles fire through the sight (swayed aim, no spread) or from the hip (the
   *  gun's hip spread). Returns false when the shot didn't go off. */
  function fire(
    dx: number,
    sy: number,
    aimed?: 'sight' | 'hip',
    /** Rifles through the sight: the aim point before the sway (the Skietbaan's aim point). */
    aimAt: { readonly dx: number; readonly sy: number } = { dx, sy },
  ): boolean {
    const usingCrate = crateWeapon !== null;
    // A rifle shot that didn't come through a raised sight (a plain fire command, a second
    // finger's tap, auto-fire) is a hip shot: no shortcut past the sway (review of v1.3).
    const how = aimed ?? (!usingCrate && sight !== null ? 'hip' : undefined);
    const shellsLeft = pullTrigger();
    if (shellsLeft === null) return false;
    const fx = effectsOf(powerups);
    // Haelstorm: every nth primary shot goes off as a crate-weapon blast (a normal shell).
    let blast = false;
    if (!usingCrate) {
      primaryShots++;
      const every = pass.weaponBlastEvery?.every ?? 0;
      blast = blastDef !== null && every > 0 && primaryShots % every === 0;
    }
    const shot = blast && blastDef !== null ? statsOf(blastDef) : shotStats();
    // Rooi Patrone / Laaste Patroon: the shell's place in the belt (primary shells only).
    const shellIndex =
      !usingCrate && timing.magazine >= 0 && !fx.infiniteAmmo ? timing.magazine - shellsLeft : null;
    const lastShell = shellIndex !== null && shellsLeft === 0;
    const shotId = nextShotId++;
    stats.shots++;
    lastShotTick = tick;
    emit({
      type: 'shotFired',
      tick,
      shotId,
      weapon: shot.id,
      dx,
      sy,
      shellsLeft,
      ...(how === undefined ? {} : { aim: how }),
    });
    const ctx: ShotContext = { shotId, shot, shellIndex, lastShell, cx: cameraX };
    if (rangeProgram !== null) {
      // The Skietbaan's aim point on its plane: groups are measured from it.
      const aimed = rangeProgram.aimTarget(cameraX, aimAt.dx, aimAt.sy, birds);
      const p = tapToPlane(cameraX, planeGeo[aimed.plane].scrollFactor, aimAt.dx, aimAt.sy);
      rangeShots.set(shotId, { ...aimed, cx: cameraX, dx: aimAt.dx, sy: aimAt.sy });
      emit({ type: 'rangeShot', tick, shotId, ...aimed, x: p.x, y: p.y });
    }

    // Kettie: the stone is in the air; it resolves band by band in flyStones() (Tech §3.4).
    if (!usingCrate && !blast && bands !== null) {
      flights.push({ shotId, dx, sy, cx: cameraX, firedTick: tick, next: 0 });
      stoneShots.set(shotId, ctx);
      return true;
    }

    const byPlane = hitBirds();
    const extras = hitExtras();
    const drift = shotDrift(shot);
    const hip = how === 'hip' && !usingCrate && !blast ? (weapon.aim?.hipSpreadPx ?? 0) : 0;
    const offsets = pelletOffsets(
      shot.pellets,
      (shot.spreadPx + hip) * fx.spreadMul,
      rng.stream('pellets'),
    );
    const assisted = reach(stats.bagged === 0 ? firstHitGeometry : geometry, shot.reachesVer);
    const precise = reach(
      stats.bagged === 0 ? preciseFirstHitGeometry : preciseGeometry,
      shot.reachesVer,
    );
    // Touch assist rescues a clean miss only (resolvePattern, D-026); pointer never has it.
    const pellets = resolvePattern(
      dx,
      sy,
      cameraX,
      offsets,
      precise,
      touchAssist ? assisted : null,
      byPlane,
      extras,
      driftOn(drift),
    );
    const landed = pellets.map((p) => landPellet(shotId, p.pdx, p.psy, p.r, drift, null));
    resolveShot(ctx, landed);
    return true;
  }

  /** Kettie stones in fire order: each reaches its next band, is tested there, and stops at the
   *  first thing it meets; after the far band it has missed (Tech §3.4). */
  function flyStones(): void {
    if (bands === null || flights.length === 0) return;
    const flying: Flight[] = [];
    for (const f of flights) {
      const ctx = stoneShots.get(f.shotId);
      let done = ctx === undefined;
      while (!done && ctx !== undefined) {
        const band = bands[f.next];
        if (band === undefined || tick - f.firedTick < band.ticks) break;
        f.next++;
        const drift = shotDrift(ctx.shot);
        const psy = f.sy + band.dropPx;
        // Bands are built without the Ver layer: a stone falls short of it.
        const geo = bandGeometry(stats.bagged === 0 ? firstHitGeometry : geometry, band);
        const r = resolvePellet(f.dx, psy, f.cx, geo, hitBirds(), hitExtras(), driftOn(drift));
        // A paper target or steel plate (the range only) stops a stone too.
        const stopped =
          r.birdId !== null ||
          r.propId !== null ||
          r.crateId !== null ||
          r.paperId !== undefined ||
          r.meerkatId !== undefined ||
          f.next >= bands.length;
        if (!stopped) continue;
        resolveShot(ctx, [landPellet(f.shotId, f.dx, psy, r, drift, f.cx)]);
        done = true;
      }
      if (done) stoneShots.delete(f.shotId);
      else flying.push(f);
    }
    flights = flying;
  }

  /**
   * Okavango water (biome.twist.splash): pellets that stopped on nothing over a water zone
   * splash — one threat to each flock in range that the shot didn't already threaten (one threat
   * per flock per shot, GDD §6.1). Not the gun's noise: silent guns and Stil Loop still splash.
   */
  function splashThreats(
    landed: readonly Landed[],
    cx: number,
    threatened: readonly FlockThreat[],
    bagged: ReadonlySet<number>,
  ): void {
    if (splash === null) return;
    const wet: { dx: number; sy: number }[] = [];
    for (const l of landed) {
      if (l.r.birdId !== null || l.r.propId !== null || l.r.crateId !== null) continue;
      const inWater = splash.zones.some((z) => {
        const p = tapToPlane(cx, z.scrollFactor, l.dx, l.sy);
        return pointInOccluder(p.x, p.y, z.occluder);
      });
      if (inWater) wet.push({ dx: l.dx, sy: l.sy });
    }
    const first = wet[0];
    if (first === undefined) return;
    emit({ type: 'splash', tick, dx: first.dx, sy: first.sy, cx });
    const already = new Set(threatened.map((t) => t.flock.id));
    const more = shotThreats(flocks, wet, cx, splash.alertRadiusPx, planeGeo, bagged).filter(
      (t) => !already.has(t.flock.id),
    );
    threaten(more, 'splash');
  }

  /** Damage, scoring, bonuses, crates, secrets and threats of a shot whose pellets have landed. */
  function resolveShot(ctx: ShotContext, landed: readonly Landed[]): void {
    const { shotId, shot, shellIndex, lastShell, cx: shotCx } = ctx;
    const pelletsOn = new Map<number, number>();
    const impacts: { dx: number; sy: number }[] = [];
    const partHits: { propId: string; partId: string }[] = [];
    const crateHits: number[] = [];
    const meerkatHits: number[] = [];
    const spookHits: number[] = [];
    let paperHits = 0;
    /** Range: pellets per paper target or steel plate, in landing order. */
    const paperPellets = new Map<number, number>();
    for (const { dx: ldx, sy: lsy, r } of landed) {
      impacts.push({ dx: ldx, sy: lsy });
      const paper = r.paperId === undefined ? undefined : papers.find((p) => p.id === r.paperId);
      if (paper !== undefined) {
        // Where on the paper (its plane's coordinates): the Skietbaan draws and measures it,
        // against the shot's aim point on the same plane.
        const sfp = planeGeo[paper.plane].scrollFactor;
        const p = tapToPlane(shotCx, sfp, ldx, lsy);
        const aimed = rangeShots.get(shotId);
        const a = aimed === undefined ? p : tapToPlane(aimed.cx, sfp, aimed.dx, aimed.sy);
        emit({
          type: paper.kind === 'plate' ? 'plateHit' : 'paperHit',
          tick,
          shotId,
          paperId: paper.id,
          x: p.x,
          y: p.y,
          aimX: a.x,
          aimY: a.y,
        });
        paperHits++;
        paperPellets.set(paper.id, (paperPellets.get(paper.id) ?? 0) + 1);
      }
      if (r.birdId !== null) pelletsOn.set(r.birdId, (pelletsOn.get(r.birdId) ?? 0) + 1);
      const { propId, partId, crateId } = r;
      if (partId !== null && propId !== null) {
        if (!partHits.some((h) => h.propId === propId && h.partId === partId))
          partHits.push({ propId, partId });
      }
      if (crateId !== null && !crateHits.includes(crateId)) crateHits.push(crateId);
      if (r.meerkatId !== undefined && !meerkatHits.includes(r.meerkatId))
        meerkatHits.push(r.meerkatId);
      if (r.spookId !== undefined && !spookHits.includes(r.spookId)) spookHits.push(r.spookId);
    }

    if (rangeProgram !== null) {
      // 24 Oct update (D-037): what the shot hit, or that it missed (short: of Ver).
      const aimed = rangeShots.get(shotId);
      rangeShots.delete(shotId);
      const hits = rangeProgram.hits(paperPellets, pelletsOn, birds);
      const short = hits.length === 0 && aimed?.plane === 'ver' && !shot.reachesVer;
      emit({ type: 'rangeOutcome', tick, shotId, hits, short });
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
        duckBoss(b);
      } else {
        bagged.push({ bird: b, behaviour: behaviourOf(b) });
      }
    }
    const touchedAny = damage.touched;
    const hitThing =
      partHits.length > 0 ||
      crateHits.length > 0 ||
      paperHits > 0 ||
      meerkatHits.length > 0 ||
      spookHits.length > 0;

    const targets = bagged.filter((x) => x.bird.creature.kind !== 'nonTarget');
    const nonTargets = bagged.filter((x) => x.bird.creature.kind === 'nonTarget');

    // Frenzy first: this shot's bags score with the streak including this shot (D-018). A shot
    // that only hits a secret part or a crate leaves the streak alone (D-021).
    const onlyThings = hitThing && damage.outcomes.length === 0;
    // The Skietbaan has no Frenzy: the streak stays 0.
    let newStreak = ranged || onlyThings ? streak : nextStreak(streak, targets.length > 0);
    // Geheime Resep: a shot that bags nothing drops one Frenzy tier instead of resetting.
    if (!ranged && !onlyThings && targets.length === 0 && pass.frenzyMissBehaviour === 'dropTier')
      newStreak = dropTier(streak, scoring.frenzyTiers);
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

    let bagIndex = 0;
    /** Bags that scored under Ou Grys's rule (wing shots, or an exempt boss). */
    let ruleBags = 0;
    for (const { bird, behaviour } of targets) {
      const c = bird.creature;
      if (c.kind === 'nonTarget') continue;
      const bag = hasCharms
        ? charms.bag(
            charmCtx({
              plane: bird.plane,
              behaviour,
              creature: c.id,
              boss: c.kind === 'boss',
              weapon: shot.id,
              firstBagOfShot: bagIndex === 0,
              shellIndex,
              lastShell,
            }),
          )
        : null;
      bagIndex++;
      // Ou Grys's rule: ground bags score 0 (the season's boss is exempt if it says so).
      const groundZero =
        bossRule === 'groundShotsZero' &&
        behaviour !== 'flying' &&
        !(c.kind === 'boss' && bossExempt);
      if (!groundZero) ruleBags++;
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
      // The Skietbaan scores nothing (its stats count the hits).
      if (!ranged) {
        const s = scoreBag(
          {
            base: mapPoints(c.baseOverride ?? scoring.planes[bird.plane].base, bird.plane),
            behaviourAdd: scoring.behaviourAdd[behaviour],
            weaponScoreMul: shot.scoreMul[bird.plane] ?? shot.scoreMul.all ?? 1,
            frenzyMul: fMul,
            stampedeMul: stampedeMul(),
            ...(groundZero ? { ruleMul: 0 } : {}),
          },
          bag?.modifiers ?? [],
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
      }
      stats.bagged++;
      stats.baggedByPlane[bird.plane]++;
      if (behaviour === 'flying') stats.wingShots++;
      if (c.kind === 'boss') bossesBagged++;
      if (c.kind === 'target' && c.doppiesDrop !== undefined) addDoppies(c.doppiesDrop, bird.id);
      if (bag !== null) applyCharms(bag.fired);
    }
    for (const { bird } of nonTargets) {
      const c = bird.creature;
      if (c.kind !== 'nonTarget') continue;
      const points = pass.penaltyOverride.get(c.id) ?? c.penalty;
      if (ranged) continue;
      score += points;
      stats.penalties++;
      emit({ type: 'penaltyApplied', tick, birdId: bird.id, creature: c.id, points });
      charmTrigger('penalty', { creature: c.id, plane: bird.plane });
    }

    // Event bonuses use the post-shot streak, like the bags (D-018). Under Ou Grys's rule a shot
    // whose bags were all ground bags earns no Twee Vlieë or Whole Flock either (D-023).
    const bonusRuleMul = bossRule === 'groundShotsZero' && ruleBags === 0 ? 0 : 1;
    for (const bonus of armorBonuses) awardBonus('armor', bonus);
    const flies = twoFliesBonus(targets.length, scoring.twoFlies);
    if (flies > 0) {
      stats.twoFlies++;
      awardBonus('twoFlies', flies, bonusRuleMul);
      if (bonusRuleMul > 0) charmTrigger('twoFlies');
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
        awardBonus('wholeFlock', bonus, bonusRuleMul);
        if (bonusRuleMul > 0) charmTrigger('flockWiped', { plane: f.plane });
      }
    }
    if (spookHits.length > 0) shotSpook(shotId, spookHits);
    // This shot counts against shell power-ups it had; one it picks up starts with the next.
    endPowerups(onShellFired(powerups));
    for (const id of crateHits) openCrate(id);
    for (const s of secrets) {
      for (const h of partHits) if (h.propId === s.propId) hitSecretPart(s, h.partId);
      // Near-miss secrets (the dassie): a pellet that landed close to the part, not on it.
      if (s.nearMissPx > 0) {
        for (const imp of impacts) {
          const p = tapToPlane(shotCx, s.scrollFactor, imp.dx, imp.sy);
          if (!nearMiss(s, p.x, p.y)) continue;
          triggerSecret(s, s.parts[0]?.id ?? '');
          break;
        }
      }
    }
    // Threats (GDD §6.2): one per flock in range of any impact, hit or miss. Charms scale the
    // radius (Stil Loop: a miss alerts nobody).
    const miss = !touchedAny && !hitThing;
    // Okavango sun-showers: rain muffles the shot (omen.showers.alertRadiusMul).
    const rainMul = raining() ? (showers?.alertRadiusMul ?? 1) : 1;
    const radius =
      shot.alertRadiusPx * pass.alertRadiusMul * (miss ? pass.missAlertMul : 1) * rainMul;
    shotAtColonies(shotId, meerkatHits, impacts, shotCx, radius > 0, shot.alertsAllFlocks);
    const near = shotThreats(flocks, impacts, shotCx, radius, planeGeo, baggedFlockIds);
    threaten(near, radius > 0 ? 'shot' : 'silentBag');
    // v1.4 (D-038): a very loud gun alerts every other flock too (unless a charm or the rain
    // silenced the shot to nothing).
    const loud =
      shot.alertsAllFlocks && radius > 0
        ? loudShotThreats(flocks, near, impacts, shotCx, planeGeo)
        : [];
    threaten(loud, 'shot');
    const threatened = loud.length === 0 ? near : [...near, ...loud];
    splashThreats(landed, shotCx, threatened, baggedFlockIds);
    if (targets.length > 0) stats.hitShots++;
    if (miss) {
      emit({ type: 'miss', tick, shotId });
      charmTrigger('miss', { weapon: shot.id });
      // Generaal's rule (GDD §13.3): every miss alerts all flocks — one threat per flock per shot
      // (GDD §6.1), so flocks the miss already threatened are not threatened twice.
      if (bossRule === 'missAlertsAll') {
        const hit = new Set(threatened.map((t) => t.flock.id));
        applyReaction(
          'threat',
          reactionTargets(flocks, { kind: 'all' }, shotCx, planeGeo).filter(
            (t) => !hit.has(t.flock.id),
          ),
          'event',
        );
      }
    }
    if (hasCharms) {
      charmTrigger('shot', { weapon: shot.id, shellIndex, lastShell });
      if (lastShell) charmTrigger('beltEmpty', { weapon: shot.id });
    }
  }

  /** D-048: the Spookjag things a shot hit (in hit order): flat points, lanterns go dark. */
  function shotSpook(shotId: number, ids: readonly number[]): void {
    if (spook === null) return;
    const gone: number[] = [];
    for (const id of ids) {
      const t = spook.things.find((x) => x.id === id);
      if (t === undefined || (t.kind === 'lantern' && t.dark)) continue;
      let points = 0;
      if (t.kind === 'lantern') t.dark = true;
      else {
        gone.push(t.id);
        if (t.kind === 'bat') {
          points = spook.twist.bats.points;
          spookTally.bats++;
        } else {
          points = spook.twist.owls.points;
          spookTally.owls++;
          stats.penalties++;
        }
      }
      score += points;
      const lit = lanternsLit(spook);
      emit({
        type: 'spookHit',
        tick,
        shotId,
        thing: t.kind,
        id: t.id,
        plane: t.plane,
        x: t.x,
        y: t.y,
        points,
        lanternsLit: lit,
      });
      if (t.kind === 'lantern' && lit === 0 && !spook.allOutPaid) {
        spook.allOutPaid = true;
        const bonus = spook.twist.lanterns.allOutBonus;
        score += bonus;
        emit({ type: 'lanternsOut', tick, points: bonus });
      }
    }
    if (gone.length > 0) removeThings(spook, gone);
  }

  function awardBonus(bonus: BonusId, base: number, ruleMul = 1): void {
    if (ranged) return;
    const charmMul =
      bonus === 'wholeFlock' || bonus === 'twoFlies' || bonus === 'secretChain'
        ? pass.bonusMul[bonus]
        : 1;
    const award = scoreEventBonus(base, {
      frenzyMul: frenzyMul(streak, scoring.frenzyTiers),
      stampedeMul: stampedeMul(),
      multipliers: scoring.eventBonusMultipliers,
      ...(charmMul === 1 ? {} : { bonusMul: charmMul }),
    });
    const paid = ruleMul === 1 ? award : Math.round(award * ruleMul);
    score += paid;
    emit({ type: 'bonusAwarded', tick, bonus, base, award: paid });
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
    emit({
      type: 'crateSpawned',
      tick,
      crateId: c.id,
      plane: c.plane,
      x: c.x,
      item: c.item?.id ?? null,
    });
  }

  function openCrate(id: number): void {
    const c = crates.find((x) => x.id === id);
    if (c === undefined) return;
    crates = crates.filter((x) => x.id !== id);
    // v1.7b (D-046): rolled when it dropped (props/crates.ts).
    const item = c.item;
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
    // "Don't shoot it" (the weaver nest): points off, and not a secret found (D-025).
    if (reward.penalty !== undefined) {
      score -= reward.penalty;
      stats.penalties++;
      emit({ type: 'secretPenalty', tick, propId: s.propId, partId, points: -reward.penalty });
      return;
    }
    secretFound(s.propId, partId, reward.points);
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

  /** A secret paid out: counted, its points, and the secret chain (GDD §9). */
  function secretFound(propId: string, partId: string, points: number | undefined): void {
    stats.secrets++;
    emit({ type: 'secretTriggered', tick, propId, partId });
    charmTrigger('secret');
    if (points !== undefined) awardBonus('secret', points);
    // Secret chain (GDD §9): two secrets within withinSeconds.
    if (lastSecretTick !== null && tick - lastSecretTick <= chainTicks) {
      awardBonus('secretChain', scoring.secretChain.bonus);
      lastSecretTick = null;
    } else {
      lastSecretTick = tick;
    }
  }

  // --- meerkat colonies (v1.7, D-044) -------------------------------------------------------
  function diveNow(c: ColonyState, cause: 'shot' | 'loud' | 'alarm' | 'hit'): void {
    if (photoColony === c) photoColony = null;
    if (!diveColony(c, colonyCtx())) return;
    emit({
      type: 'meerkatsDived',
      tick,
      colonyId: c.id,
      cause,
      plane: c.plane,
      x: c.cx,
      y: c.ground,
    });
  }

  /** A shot's meerkat hits (points off, cooldown), then which colonies dive: the hit one, every
   *  one for a very loud gun, and any with an impact within shotDive.radiusPx on its plane. A
   *  silenced shot (alert radius 0) only scares the colony it hit. */
  function shotAtColonies(
    shotId: number,
    hits: readonly number[],
    impacts: readonly { dx: number; sy: number }[],
    cx: number,
    heard: boolean,
    loud: boolean,
  ): void {
    if (colonies.length === 0) return;
    const scared = new Map<ColonyState, 'shot' | 'loud' | 'hit'>();
    for (const id of hits) {
      const c = colonies.find((x) => x.meerkats.some((m) => m.id === id));
      const m = c?.meerkats.find((x) => x.id === id);
      if (c === undefined || m === undefined || shapeOf(m.pose) === null) continue;
      const points = c.cooldown > 0 ? 0 : -mk.hit.penalty;
      if (points < 0) {
        score += points;
        stats.penalties++;
        c.cooldown = mkCooldownTicks;
      }
      scoldPoints.set(m.id, points);
      emit({
        type: 'meerkatHit',
        tick,
        shotId,
        colonyId: c.id,
        meerkatId: m.id,
        plane: c.plane,
        x: m.x,
        y: m.y,
        points,
      });
      hitMeerkat(c, m, mk);
      scared.set(c, 'hit');
    }
    if (heard) {
      for (const c of colonies) {
        if (scared.has(c)) continue;
        if (loud) {
          scared.set(c, 'loud');
          continue;
        }
        const left = Math.min(...c.burrows.map((b) => b.x));
        const right = Math.max(...c.burrows.map((b) => b.x));
        const close = impacts.some((imp) => {
          const p = tapToPlane(cx, c.scrollFactor, imp.dx, imp.sy);
          const ox = p.x < left ? left - p.x : p.x > right ? p.x - right : 0;
          const oy = p.y - c.ground;
          return ox * ox + oy * oy <= mk.shotDive.radiusPx * mk.shotDive.radiusPx;
        });
        if (close) scared.set(c, 'shot');
      }
    }
    for (const c of colonies) {
      const cause = scared.get(c);
      if (cause !== undefined) diveNow(c, cause);
    }
  }

  /** Alarm: a raptor or the crop sprayer over a colony. The sentinel (or any meerkat up) barks,
   *  the colony dives, and the nearest guineafowl flock hears it (GDD §11). */
  function colonyAlarms(): void {
    for (const c of colonies) {
      const cu = c.cx / coreWidth(c.scrollFactor);
      for (const b of birds) {
        if (!mk.alarm.creatures.includes(b.creature.id) || c.alarmedBy.includes(b.id)) continue;
        const bu = b.x / coreWidth(planeGeo[b.plane].scrollFactor);
        if (Math.abs(bu - cu) > mk.alarm.radiusU) continue;
        c.alarmedBy.push(b.id);
        const up = c.meerkats.filter((m) => !m.shot && shapeOf(m.pose) !== null);
        const caller = up.find((m) => m.id === c.sentinel) ?? up.find((m) => !m.pup);
        if (caller === undefined) continue;
        let flockId: number | null = null;
        if (mk.alarm.alertsNearestFlock) {
          let best: { f: Flock; d: number } | null = null;
          for (const f of flocks) {
            if (f.members.length === 0 || f.state === 'flush') continue;
            const fu = centroid(f).x / coreWidth(planeGeo[f.plane].scrollFactor);
            const d = Math.abs(fu - cu);
            if (best === null || d < best.d) best = { f, d };
          }
          if (best !== null) {
            flockId = best.f.id;
            threaten(
              [{ flock: best.f, x: cu * coreWidth(planeGeo[best.f.plane].scrollFactor) }],
              'meerkatAlarm',
            );
          }
        }
        emit({
          type: 'meerkatAlarm',
          tick,
          colonyId: c.id,
          meerkatId: caller.id,
          creature: b.creature.id,
          flockId,
          plane: c.plane,
          x: caller.x,
          y: caller.y,
        });
        diveNow(c, 'alarm');
      }
    }
  }

  /** Held fire with a colony on screen and the whole family out: the Familiefoto line-up (once
   *  per hunt). The cooldown of each colony's penalty runs here too (sim ticks). */
  function tickColonies(): void {
    const shotNow = lastShotTick === tick;
    if (photoColony !== null && photoColony.phase !== 'lineUp') photoColony = null;
    for (const c of colonies) {
      if (c.cooldown > 0) c.cooldown--;
      const onScreen =
        Math.abs(planeToDx(cameraX, c.scrollFactor, c.cx)) <= mk.familiefoto.onScreenHalfPx;
      // "Holding fire" starts with the first shot of the hunt (not the opening look round).
      c.hold = shotNow || !onScreen || stats.shots === 0 ? 0 : c.hold + 1;
      if (
        !photoDone &&
        photoColony === null &&
        c.phase === 'normal' &&
        c.hold >= mkHoldTicks &&
        familyOut(c)
      ) {
        lineUp(c, mk);
        photoColony = c;
      }
    }
  }

  function stepColonies(): void {
    for (const c of colonies) {
      for (const note of stepColony(c, colonyCtx())) {
        if (note.kind === 'scold') {
          const m = note.meerkat;
          emit({
            type: 'meerkatScold',
            tick,
            colonyId: c.id,
            meerkatId: m.id,
            plane: c.plane,
            x: m.x,
            y: m.y,
            points: scoldPoints.get(m.id) ?? 0,
          });
        } else if (!photoDone) {
          photoDone = true;
          photoColony = null;
          emit({
            type: 'familiefoto',
            tick,
            colonyId: c.id,
            family: c.meerkats.length,
            plane: c.plane,
            x: c.cx,
            y: c.ground,
          });
          secretFound(FAMILIEFOTO_SECRET, c.id, mk.familiefoto.bonus);
        }
      }
    }
  }

  function colonyView(c: ColonyState): ColonyView {
    return {
      id: c.id,
      layerId: c.layerId,
      plane: c.plane,
      burrows: c.burrows,
      ground: c.ground,
      phase: c.phase,
      meerkats: c.meerkats.map((m) => ({
        id: m.id,
        pup: m.pup,
        x: m.x,
        y: m.y,
        facing: m.facing,
        pose: m.pose,
        look: m.look,
        poseTicks: m.t,
        hittable: shapeOf(m.pose) !== null,
      })),
    };
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
      case 'hopper': {
        if (birds.length >= biome.pacing.maxBirdsOnScreen) return;
        const b = buildHopperBird(worldDeps, def, nextBirdId, rng.stream('hop'));
        if (b === null) return;
        nextBirdId++;
        emit({ type: 'worldEvent', tick, event: ev.id });
        addBirds([b]);
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
      case 'farmDog':
        runFarmDog();
        return;
      // Never scheduled from the biome (content validation rejects them there).
      case 'secretReward':
      case 'crate':
      case 'stampede':
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
      case 'aimStart':
        startAim(cmd.dx, cmd.sy);
        return;
      case 'aimMove':
        if (aim !== null) {
          aim.dx = cmd.dx;
          aim.sy = cmd.sy;
        }
        return;
      case 'aimRelease':
        releaseAim();
        return;
      case 'aimCancel':
        endAim('cancel');
        return;
      case 'zoom':
        setZoom(cmd.step);
        return;
      case 'reload':
        // A reload lowers a raised sight first (v1.3).
        if (crateWeapon === null) endAim('reload');
        // Crate weapons reload themselves (Voorlaaier ramrod) or never (Mielie-Masjien).
        if (
          crateWeapon === null &&
          startReload(weaponState, timing, reloadLen(timing.reloadTicks))
        ) {
          emit({ type: 'reloadStarted', tick, perShell: timing.perShell });
          charmTrigger('reload');
        }
        return;
      case 'cameraTarget':
        cameraX = cmd.cx;
        return;
      case 'gadget':
        useGadget();
        return;
      case 'consumable':
        useConsumable(cmd.slot);
        return;
      case 'charmOrder':
        if (charms.reorder(cmd.order))
          emit({ type: 'charmsReordered', tick, charms: charms.order() });
        return;
    }
  }

  // --- rifle sights (v1.3, D-036) ------------------------------------------------------------
  /** A rifle's hold applies only while the rifle itself is in hand (not a crate weapon). */
  const rifleInHand = (): boolean => sight !== null && crateWeapon === null;

  function startAim(dx: number, sy: number): void {
    if (sight === null || !rifleInHand() || aim !== null) return;
    aim = raiseSight(dx, sy, zoomStep, swayRng, sight);
    emit({
      type: 'aimStarted',
      tick,
      sight: sight.id,
      zoom: sight.zoom[zoomStep] ?? 1,
      dx,
      sy,
    });
  }

  function endAim(reason: 'cancel' | 'blocked' | 'reload' | 'weapon' | 'fired' | 'hip'): void {
    if (aim === null) return;
    aim = null;
    emit({ type: 'aimEnded', tick, reason });
  }

  /** Release: through the sight once it is up (aim + sway), else from the hip (aim point). */
  function releaseAim(): void {
    const a = aim;
    if (a === null || sight === null) return;
    const up = isUp(a, sight);
    const sway = up ? swayAt(a, sight) : { dx: 0, dy: 0 };
    aim = null;
    const fired = fire(a.dx + sway.dx, a.sy + sway.dy, up ? 'sight' : 'hip', a);
    emit({ type: 'aimEnded', tick, reason: fired ? (up ? 'fired' : 'hip') : 'blocked' });
  }

  function setZoom(step: number): void {
    if (sight === null) return;
    const next = clampStep(step, sight);
    if (next === zoomStep) return;
    zoomStep = next;
    // v1.4 (D-038): a held sight changes zoom at once (scroll / +/- while aiming).
    if (aim !== null) aim.step = next;
    emit({ type: 'zoomChanged', tick, step: next, zoom: sight.zoom[next] ?? 1 });
  }

  /** One tick of a held sight: it comes up, then the breath settles and tires (events only on
   *  the change). Runs after the commands, so a press and release in one tick is a hip shot. */
  function tickAim(): void {
    if (aim === null || sight === null) return;
    const before = breathAt(aim.heldTicks, sight).breath;
    aim.heldTicks++;
    if (aim.heldTicks === sight.raiseTicks) emit({ type: 'aimRaised', tick, sight: sight.id });
    const after = breathAt(aim.heldTicks, sight).breath;
    if (after !== before && (after === 'held' || after === 'tired'))
      emit({ type: 'aimBreath', tick, breath: after });
  }

  function aimView(): AimView | null {
    if (aim === null || sight === null) return null;
    const sway = swayAt(aim, sight);
    return {
      sight: sight.id,
      zoom: sight.zoom[aim.step] ?? 1,
      progress: raiseProgress(aim, sight),
      dx: aim.dx,
      sy: aim.sy,
      swayDx: sway.dx,
      swayDy: sway.dy,
      breath: breathAt(aim.heldTicks, sight).breath,
      heldTicks: aim.heldTicks,
    };
  }

  /** Season Run consumables (GDD §10.4): one use each. The slot after the last is the rental. */
  function useConsumable(slot: number): void {
    if (season === null) return;
    if (slot === consumables.length) {
      if (rental === null) return;
      const id = rental;
      rental = null;
      rentalUsed = true;
      emit({ type: 'consumableUsed', tick, slot, item: id, itemType: 'weapon' });
      armWeapon(id);
      return;
    }
    const id = consumables[slot];
    if (id === null || id === undefined) return;
    consumables[slot] = null;
    consumablesUsed.push(slot);
    emit({ type: 'consumableUsed', tick, slot, item: id, itemType: 'powerup' });
    startPowerup(id, 'consumable');
  }

  /** The Vuvuzela (GDD §10.2): every visible flock straight to FLUSH. A charm gadget
   *  (Fluitjie) does its charm's `on: gadget` effects instead. */
  function useGadget(): void {
    if (gadgetDef === null) return;
    const outOfCharges = gadgetDef.charges >= 0 && gadgetCharges <= 0;
    if (outOfCharges || gadgetCooldown > 0) {
      emit({
        type: 'gadgetDenied',
        tick,
        gadget: gadgetDef.id,
        reason: outOfCharges ? 'noCharges' : 'cooldown',
      });
      return;
    }
    if (gadgetDef.charm) {
      gadgetCooldown = gadgetCooldownTicks;
      stats.gadgetUses++;
      emit({
        type: 'gadgetUsed',
        tick,
        gadget: gadgetDef.id,
        chargesLeft: -1,
        flocks: nearestVisibleFlock(['flush']) === null ? 0 : 1,
      });
      charmTrigger('gadget');
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
    charmTrigger('gadget');
  }

  /** FTUE beat: the visible flock nearest the screen centre runs (Bles) or flushes. */
  function runTutorialBeat(action: 'spook' | 'flush', skipIfFlockRan: boolean): void {
    if (action === 'spook' && skipIfFlockRan && flockRan) {
      emit({ type: 'tutorialBeat', tick, beat: action, flockId: null });
      return;
    }
    const to = action === 'spook' ? 'run' : 'flush';
    const best = nearestVisibleFlock(['flush', to]);
    emit({ type: 'tutorialBeat', tick, beat: action, flockId: best?.flock.id ?? null });
    if (best !== null) {
      emitTransition(best.flock, forceState(best.flock, to, best.x, 'event', fParams, flockRng));
    }
  }

  /** Flocks and birds move one step (skipped every other tick under Boeretroos). */
  function stepCreatures(): void {
    stepColonies();
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
      // Die Stormvoël: when a pass leaves the sky still unbagged, his next pass comes back the
      // other way on its plane (far, then mid), keeping the hits he has taken.
      const next: Bird[] = [];
      for (const b of birds) {
        const s = b.script;
        if (!gone.has(b.id) || s === null || s.passes.length === 0) continue;
        const [plane, ...rest] = s.passes;
        if (plane === undefined) continue;
        const p = buildSkyPass(
          worldDeps,
          b.creature,
          plane,
          s.dir > 0 ? -1 : 1,
          b.hitsLeft,
          rest,
          nextBirdId,
        );
        if (p === null) continue;
        nextBirdId++;
        next.push(p);
      }
      birds = birds.filter((b) => !gone.has(b.id));
      addBirds(next);
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
    while (
      beatCursor < tutorialBeats.length &&
      (tutorialBeats[beatCursor]?.tick ?? Infinity) <= tick
    ) {
      const beat = tutorialBeats[beatCursor++];
      if (beat !== undefined) runTutorialBeat(beat.action, beat.skipIfFlockRan === true);
    }
    while (crateCursor < crateTicks.length && (crateTicks[crateCursor] ?? Infinity) <= tick) {
      crateCursor++;
      dropCrate();
    }
    while (
      lightningCursor < lightningTicks.length &&
      (lightningTicks[lightningCursor] ?? Infinity) <= tick
    ) {
      lightningCursor++;
      flash(flashTicks);
    }
    if (stormTick !== null && tick === stormTick) startStorm();
    ownLightning();
    if (hasCharms) applyCharms(charms.tickTriggers(tick, durationTicks - tick, charmCtx()));

    for (const cmd of commands) apply(cmd);
    if (hold !== null && holdFires()) fire(hold.dx, hold.sy);
    tickAim();

    const w = tickWeapon(weaponState, timing, reloadLen(timing.reloadTicks));
    if (w === 'shellLoaded') emit({ type: 'shellLoaded', tick, shells: weaponState.shells });
    else if (w === 'reloadFinished')
      emit({ type: 'reloadFinished', tick, shells: weaponState.shells });
    autoReload();
    if (crateWeapon !== null) {
      tickCrateWeapon(crateWeapon);
      if (rangeCrate !== null && crateWeaponSpent(crateWeapon)) {
        // The Skietbaan's reserve never runs out: a fresh load (its ramrod reload still runs).
        crateWeapon.shotsLeft = crateWeapon.def.shots ?? null;
        crateWeapon.ticksLeft = crateWeapon.totalTicks;
      } else if (crateWeaponSpent(crateWeapon)) {
        crateWeapon = null;
        hold = null;
        emit({ type: 'weaponChanged', tick, weapon: weapon.id, kind: 'primary' });
      }
    }
    endPowerups(tickPowerups(powerups));
    if (gadgetCooldown > 0) gadgetCooldown--;
    if (rainSpells.length > 0 && raining() !== wasRaining) {
      wasRaining = !wasRaining;
      emit({ type: 'weatherChanged', tick, rain: wasRaining });
    }
    if (wind !== null && tickWind(wind, omenRng)) {
      emit({ type: 'windChanged', tick, dir: wind.dir, strength: wind.strength });
    }
    for (const s of secrets) {
      const t = tickSecret(s);
      if (t === 'reset') emit({ type: 'secretReset', tick, propId: s.propId });
      else if (t === 'ready') emit({ type: 'secretReady', tick, propId: s.propId });
    }

    if (ranged) rangeStep();
    else {
      addBirds(director.tick(directorContext()));
      spawnFlocks();
    }

    const slow = slowMoTicks > 0 ? slowMoScale : 1;
    creatureClock += Math.min(effectsOf(powerups).creatureTimeScale, slow);
    if (slowMoTicks > 0) slowMoTicks--;
    if (lightningLeft > 0) lightningLeft--;
    if (creatureClock >= 1) {
      creatureClock -= 1;
      stepCreatures();
    }
    // Stones land after the birds moved: leading the target is the skill (Tech §3.4).
    flyStones();
    if (colonies.length > 0) {
      colonyAlarms();
      tickColonies();
    }
    if (spook !== null) {
      const r = stepSpookjag(
        spook,
        { biome, planes: scoring.planes, rng: rng.stream('feesdag') },
        tick,
      );
      for (const f of r.spawned)
        if (f.kind !== 'lantern')
          emit({ type: 'spookFlew', tick, thing: f.kind, id: f.id, plane: f.plane });
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
    if (!ranged && tick >= durationTicks) {
      over = true;
      charmTrigger('huntEnd');
      emit({ type: 'huntEnded', tick, score });
    }
  }

  /** v1.3x (D-037): one tick of the Skietbaan's spawn program. */
  function rangeStep(): void {
    if (rangeProgram === null) return;
    const r = rangeProgram.step({
      tick,
      birds,
      nextBirdId: () => nextBirdId++,
      spawnFlockAt: (plane, x, size) =>
        director.spawnFlockAt(
          { ...directorContext(), flocks, nextFlockId: () => nextFlockId++ },
          plane,
          x,
          size,
          rng.stream('range'),
        ),
    });
    if (r.retire.length > 0) {
      const gone = new Set(r.retire);
      for (const id of r.retire)
        emit({ type: 'birdDespawned', tick, birdId: id, reason: 'exited' });
      birds = birds.filter((b) => !gone.has(b.id));
      pruneFlocks(gone, 'exited');
    }
    addBirds(r.birds);
    addFlocks(r.flocks);
  }

  // Warm-up (GDD §8): the first flocks are already foraging in view at the first snapshot.
  if (ranged) {
    if (rangeCrate !== null) armWeapon(rangeCrate.id);
    rangeStep();
  } else spawnFlocks();
  charmTrigger('huntStart');

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
        reloadProgress:
          reloading && cw.cooldownStep > 0 ? 1 - cw.cooldownTicks / cw.cooldownStep : 0,
        perShellReload: false,
        cooldownTicks: cw.cooldownTicks,
        holdToFire: cw.def.holdToFire === true,
        infinite: cw.shotsLeft === null,
        ticksLeft: cw.ticksLeft,
        totalTicks: cw.totalTicks,
        sight: null,
        zoomStep: 0,
      };
    }
    const fx = effectsOf(powerups);
    return {
      id: weapon.id,
      kind: 'primary',
      shells: timing.magazine < 0 ? -1 : weaponState.shells,
      magazine: timing.magazine,
      reloading: isReloading(weaponState),
      reloadProgress: reloadProgress(weaponState),
      perShellReload: timing.perShell,
      cooldownTicks: weaponState.cooldownTicks,
      holdToFire: fx.autoFire,
      infinite: fx.infiniteAmmo || timing.magazine < 0,
      ticksLeft: null,
      totalTicks: null,
      sight: sight?.id ?? null,
      zoomStep,
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
        birds: birds.map(birdView),
        flocks: flocks.map(flockView),
        gadget:
          gadgetDef === null
            ? null
            : {
                id: gadgetDef.id,
                charges: gadgetDef.charges < 0 ? -1 : gadgetCharges,
                cooldownTicks: gadgetCooldown,
                cooldownTotalTicks: gadgetCooldownTicks,
              },
        secrets: secrets.map(secretView),
        crates: crates.map(crateView),
        meerkats: colonies.map(colonyView),
        powerups: powerups.map(powerupView),
        wind: windView(wind),
        dustDevils: dustDevils.map(dustDevilView),
        glare,
        rain: raining() || stormActive(),
        mirage: mirage !== null,
        lightning: lightningLeft > 0,
        projectiles: flights.map((f) => ({
          shotId: f.shotId,
          dx: f.dx,
          sy: f.sy,
          cx: f.cx,
          age: tick - f.firedTick,
          flightTicks: bands?.at(-1)?.ticks ?? 1,
        })),
        aim: aimView(),
        season:
          season === null
            ? null
            : {
                kind: season.kind,
                bossRule,
                charms: charms.order(),
                charmMults: charms.huntMults(),
                consumables: [...consumables],
                rental,
                doppies: huntDoppies,
                revealSecrets: pass.revealSecrets,
                dark: bossRule === 'darkExceptLightning',
                lightning: lightningLeft > 0,
                slowMo: slowMoTicks > 0,
              },
        over,
        ...(ranged ? { range: { papers } } : {}),
        ...(spook === null || setup.feesdag === null
          ? {}
          : {
              feesdag: {
                id: setup.feesdag.id,
                things: spook.things.map((t) => ({
                  id: t.id,
                  kind: t.kind,
                  plane: t.plane,
                  x: t.x,
                  y: t.y,
                  facing: t.facing,
                  dark: t.dark,
                })),
                lanternsLit: lanternsLit(spook),
                lanternsTotal: spook.lanternsTotal,
              },
            }),
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
        layout: setup.map.layout?.id ?? null,
        bonus: setup.map.bonus?.id ?? null,
        weapon: weapon.id,
        sight: setup.sight?.id ?? null,
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
        doppies: huntDoppies,
        shellCapacityForRun: shellCapacityGain,
        consumablesUsed: [...consumablesUsed],
        rentalUsed,
        bossesBagged,
        ...(spook === null || setup.feesdag === null
          ? {}
          : {
              feesdag: {
                id: setup.feesdag.id,
                bats: spookTally.bats,
                owls: spookTally.owls,
                lanterns: spook.lanternsTotal - lanternsLit(spook),
                lanternsTotal: spook.lanternsTotal,
              },
            }),
      };
    },
  };
}

/** Planes in front-to-back order (re-exported for renderers and tools). */
export { PLANES };
