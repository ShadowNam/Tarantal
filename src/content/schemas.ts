// Zod schemas for every file in content/. Types are inferred from these (never written twice).
// Schemas are strict: unknown keys fail, except `$comment`. Cross-file references are checked
// separately in crossRefs.ts. Vocabulary sources: docs/02-TECH-ARCHITECTURE.md §3.6 and §3.8.
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Building blocks

/** Strict object that also allows a free-text `$comment`. Every object in content/ uses it. */
function obj<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject({ $comment: z.string().optional(), ...shape });
}

const id = z.string().regex(/^[a-z][a-zA-Z0-9_-]*$/, 'ids are lower-case ascii');
const i18nKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, 'i18n keys look like a.b_c');
const nonNegInt = z.number().int().nonnegative();
const posInt = z.number().int().positive();
const nonNeg = z.number().nonnegative();
const pos = z.number().positive();
const fraction = z.number().min(0).max(1);

/** [min, max] with min <= max. */
function range(item: z.ZodNumber) {
  return z.tuple([item, item]).refine(([a, b]) => a <= b, 'range must be [min, max]');
}
/** Window as fractions of hunt length (Tech §3.6). */
const windowFraction = range(fraction);

const version = z.literal(1);

export const PlaneIdSchema = z.enum(['near', 'mid', 'far']);
export const ModeIdSchema = z.enum(['classic', 'daily', 'seasonHunt']);
export const BagBehaviourSchema = z.enum(['forage', 'alert', 'run', 'flying']);

/** World-event ids (Tech §3.6). Each gets a handler in director/events.ts. */
export const WorldEventIdSchema = z.enum([
  'hadeda',
  'cropSprayer',
  'kwevoel',
  'dustDevil',
  'farmDog',
  'carAlarm',
  'reservoirFlush',
  'bossAppearance',
  'crate',
  'stampede',
]);
export type WorldEventId = z.infer<typeof WorldEventIdSchema>;

function perPlane<T extends z.ZodType>(item: T) {
  return obj({ near: item, mid: item, far: item });
}
function somePlanes<T extends z.ZodType>(item: T) {
  return obj({ near: item.optional(), mid: item.optional(), far: item.optional() });
}

const shakeSchema = obj({ px: nonNeg, ms: nonNegInt });

/** Score multipliers by plane; `all` applies to every plane. */
const scoreMulSchema = obj({ all: pos.optional(), near: pos.optional(), mid: pos.optional(), far: pos.optional() })
  .refine((m) => Object.keys(m).length > 0, 'scoreMul needs at least one entry');

// ---------------------------------------------------------------------------------------------
// scoring.json

export const ScoringSchema = obj({
  version,
  planes: perPlane(
    obj({
      base: posInt,
      scale: pos,
      scrollFactor: pos,
      aimAssistPx: nonNeg,
      lineWeightPx: pos,
    }),
  ),
  behaviourAdd: obj({ forage: nonNeg, alert: nonNeg, run: nonNeg, flying: nonNeg }),
  frenzyTiers: z
    .array(obj({ atStreak: posInt, mul: pos }))
    .min(1)
    .refine(
      (tiers) => tiers.every((t, i) => i === 0 || t.atStreak > (tiers[i - 1]?.atStreak ?? 0)),
      'frenzyTiers must be sorted by atStreak',
    ),
  twoFlies: z.array(obj({ birds: z.number().int().min(2), bonus: posInt })).min(1),
  wholeFlock: obj({
    minSize: posInt,
    perBird: posInt,
    slowMo: obj({ scale: z.number().gt(0).max(1), ms: posInt }),
  }),
  stampede: obj({ lastSeconds: pos, mul: pos, modes: z.array(ModeIdSchema) }),
  secretChain: obj({ withinSeconds: pos, bonus: posInt }),
  ranks: z
    .array(obj({ id, minScore: nonNegInt }))
    .min(1)
    .refine((r) => r[0]?.minScore === 0, 'the first rank must start at 0')
    .refine(
      (r) => r.every((x, i) => i === 0 || x.minScore > (r[i - 1]?.minScore ?? 0)),
      'ranks must be sorted by minScore',
    ),
  /** GDD §5.3: event bonuses are multiplied by Frenzy × Stampede only, never by the weapon. */
  eventBonusMultipliers: z
    .array(z.enum(['frenzy', 'stampede']))
    .refine((m) => new Set(m).size === m.length, 'eventBonusMultipliers must be unique'),
});
export type Scoring = z.infer<typeof ScoringSchema>;

// ---------------------------------------------------------------------------------------------
// birds.json

export const CreatureBehaviourSchema = z.enum([
  'flock',
  'flyover',
  'popup',
  'hop',
  'boss',
  'peekFromCover',
  'lightningOnly',
  'perchHigh',
  'flyoverEvent',
  'popupHelper',
]);

const hitboxSchema = obj({
  body: obj({ rx: pos, ry: pos, ox: z.number(), oy: z.number() }),
  head: obj({ r: pos, ox: z.number(), oy: z.number() }).optional(),
});
const fullSpeedsSchema = obj({ walk: nonNeg, run: nonNeg, fly: nonNeg, glide: nonNeg });
const partialSpeedsSchema = obj({
  walk: nonNeg.optional(),
  run: nonNeg.optional(),
  fly: nonNeg.optional(),
  glide: nonNeg.optional(),
});

const creatureCommon = {
  id,
  planes: z.array(PlaneIdSchema).min(1),
  behaviours: z.array(CreatureBehaviourSchema).min(1),
  /** Biome ids this creature is limited to; absent = any biome. */
  biomes: z.array(id).min(1).optional(),
};

const targetCreatureSchema = obj({
  ...creatureCommon,
  kind: z.literal('target'),
  rare: z.boolean().optional(),
  baseOverride: posInt.optional(),
  doppiesDrop: posInt.optional(),
  pelletsToBag: posInt,
  speeds: fullSpeedsSchema,
  hitbox: hitboxSchema,
  spawnWeight: nonNeg,
  maxPerHunt: posInt.optional(),
});

const bossCreatureSchema = obj({
  ...creatureCommon,
  kind: z.literal('boss'),
  baseOverride: posInt,
  armorHits: posInt.optional(),
  armorHitBonus: posInt.optional(),
  pelletsToBag: posInt,
  hitsToBag: posInt,
  speeds: fullSpeedsSchema,
  hitbox: hitboxSchema,
  bossRule: id,
  exemptFromOwnBossRule: z.boolean().optional(),
});

const nonTargetCreatureSchema = obj({
  ...creatureCommon,
  kind: z.literal('nonTarget'),
  penalty: z.number().int().negative(),
  firstSightingBadge: z.boolean().optional(),
  alertsAllFlocks: z.boolean().optional(),
  speeds: partialSpeedsSchema.optional(),
  hitbox: hitboxSchema,
});

const helperCreatureSchema = obj({
  ...creatureCommon,
  kind: z.literal('helper'),
  grants: id,
});

export const CreatureSchema = z.discriminatedUnion('kind', [
  targetCreatureSchema,
  bossCreatureSchema,
  nonTargetCreatureSchema,
  helperCreatureSchema,
]);
export type Creature = z.infer<typeof CreatureSchema>;

export const BirdsSchema = obj({
  version,
  flockDefaults: obj({
      sizeMin: posInt,
      sizeMax: posInt,
      alertMs: range(nonNeg),
      escalationWindowMs: posInt,
      flushAngleDeg: range(z.number().min(0).max(90)),
      flushStaggerMs: range(nonNeg),
      flightMs: range(pos),
      settleTimeoutMs: range(pos),
      boids: obj({
        separation: nonNeg,
        alignment: nonNeg,
        cohesion: nonNeg,
        noise: nonNeg,
        neighbourRadiusPx: pos,
      }),
    })
    .refine((f) => f.sizeMin <= f.sizeMax, 'sizeMin must be <= sizeMax'),
  creatures: z.array(CreatureSchema).min(1),
});
export type Birds = z.infer<typeof BirdsSchema>;

// ---------------------------------------------------------------------------------------------
// weapons.json

const unlockSchema = z.discriminatedUnion('type', [
  obj({ type: z.literal('start') }),
  obj({ type: z.literal('challenge'), id }),
  obj({ type: z.literal('rank'), id }),
]);

const primaryWeaponSchema = obj({
  id,
  kind: z.literal('primary'),
  unlock: unlockSchema,
  /** Shells in the belt; -1 = unlimited (Kettie). */
  magazine: z.number().int().min(-1).refine((n) => n !== 0, 'magazine cannot be 0'),
  reloadMs: nonNegInt,
  perShellReload: z.boolean(),
  interruptibleReload: z.boolean().optional(),
  fireCooldownMs: posInt,
  pellets: posInt,
  spreadPx: nonNeg,
  alertRadiusPx: nonNeg,
  windSensitivity: nonNeg,
  projectile: obj({ travelMs: perPlane(posInt), dropPx: perPlane(nonNeg) })
    .nullable(),
  scoreMul: scoreMulSchema,
  shake: shakeSchema,
});

const crateWeaponSchema = obj({
    id,
    kind: z.literal('crate'),
    shots: posInt.optional(),
    durationMs: posInt.optional(),
    holdToFire: z.boolean().optional(),
    fireIntervalMs: posInt.optional(),
    reloadMs: nonNegInt.optional(),
    pellets: posInt,
    spreadPx: nonNeg,
    alertRadiusPx: nonNeg,
    windSensitivity: nonNeg,
    smokeMs: nonNegInt.optional(),
    scoreMul: scoreMulSchema,
    shake: shakeSchema,
  })
  .refine((w) => w.shots !== undefined || w.durationMs !== undefined, {
    message: 'crate weapons need shots or durationMs',
  });

export const WeaponSchema = z.discriminatedUnion('kind', [primaryWeaponSchema, crateWeaponSchema]);
export type Weapon = z.infer<typeof WeaponSchema>;

export const WeaponsSchema = obj({
  version,
  weapons: z.array(WeaponSchema).min(1),
  gadgets: z
    .array(
      obj({
        id,
        effect: z.enum(['flushAllVisibleFlocks']),
        cooldownMs: posInt,
        chargesPerClassicHunt: posInt,
      }),
    )
    .min(1),
});
export type Weapons = z.infer<typeof WeaponsSchema>;

// ---------------------------------------------------------------------------------------------
// powerups.json

export const PowerupsSchema = obj({
  version,
  powerups: z
    .array(
      obj({
          id,
          effect: obj({
              autoFire: z.boolean().optional(),
              infiniteAmmo: z.boolean().optional(),
              creatureTimeScale: z.number().gt(0).max(1).optional(),
              spreadMul: pos.optional(),
              revealHidden: z.boolean().optional(),
            })
            .refine((e) => Object.keys(e).length > 0, 'effect needs at least one entry'),
          durationMs: posInt.optional(),
          durationShells: posInt.optional(),
          padstalPrice: posInt,
        })
        .refine((p) => p.durationMs !== undefined || p.durationShells !== undefined, {
          message: 'power-ups need durationMs or durationShells',
        }),
    )
    .min(1),
  crates: obj({
    modes: z.array(ModeIdSchema),
    perHunt: nonNegInt,
    windows: z.array(windowFraction),
    table: z
      .array(
        obj({ id, weight: pos, type: z.enum(['powerup', 'weapon']).optional() }),
      )
      .min(1),
  }),
});
export type Powerups = z.infer<typeof PowerupsSchema>;

// ---------------------------------------------------------------------------------------------
// run.json

export const RunSchema = obj({
  version,
  huntSeconds: posInt,
  seasons: z
    .array(
      obj({
        id,
        biome: id,
        omen: id,
        boss: id,
        quotas: z.array(posInt).min(1),
      }),
    )
    .min(1),
  huntPattern: z.array(z.enum(['plain', 'omen', 'boss'])).min(1),
  bossRules: z.record(
    id,
    obj({
      descriptionKey: i18nKey,
      /** Photosensitivity rule: never more than 3 large flashes per second (CLAUDE.md). */
      maxFlashesPerSecond: z.number().positive().max(3).optional(),
    }),
  ),
  doppies: obj({
    start: nonNegInt,
    perHunt: nonNegInt,
    perTenPercentOverQuota: nonNegInt,
    overQuotaCap: nonNegInt,
    interestPer: posInt,
    interestCap: nonNegInt,
    bossHuntBonus: nonNegInt,
  }),
  padstal: obj({
    charmOffers: nonNegInt,
    consumableOffers: nonNegInt,
    weaponOffers: nonNegInt,
    rerollBase: nonNegInt,
    rerollIncrement: nonNegInt,
    consumableSlots: nonNegInt,
    weaponRentalPrice: nonNegInt,
  }),
  rewardedRetryPerRun: nonNegInt,
}).superRefine((run, ctx) => {
  run.seasons.forEach((s, i) => {
    if (s.quotas.length !== run.huntPattern.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['seasons', i, 'quotas'],
        message: `needs one quota per huntPattern entry (${run.huntPattern.length})`,
      });
    }
  });
});
export type Run = z.infer<typeof RunSchema>;

// ---------------------------------------------------------------------------------------------
// charms.json — the effect DSL (Tech §3.8). Unknown triggers, conditions or actions fail.

export const CHARM_TRIGGERS = [
  'passive',
  'runStart',
  'huntStart',
  'shot',
  'bag',
  'miss',
  'reload',
  'beltEmpty',
  'gadget',
  'flockAlerted',
  'flockFlushed',
  'flockWiped',
  'twoFlies',
  'secret',
  'penalty',
  'huntEnd',
  'shopOpen',
] as const;

export const CharmTriggerSchema = z.union([
  z.enum(CHARM_TRIGGERS),
  z.string().regex(/^tick:every:[1-9][0-9]*$/, 'tick:every:<ticks>'),
  z.string().regex(/^timeLeft:[0-9]+(\.[0-9]+)?$/, 'timeLeft:<seconds>'),
]);

export const CharmConditionsSchema = obj({
  plane: z.array(PlaneIdSchema).min(1).optional(),
  behaviour: z.array(BagBehaviourSchema).min(1).optional(),
  weapon: z.array(id).min(1).optional(),
  creature: z.array(id).min(1).optional(),
  boss: z.boolean().optional(),
  frenzyAtLeast: posInt.optional(),
  streakEvery: posInt.optional(),
  shellIndex: z.union([z.literal('first'), z.literal('last'), posInt]).optional(),
  omenActive: z.boolean().optional(),
  omen: z.array(id).min(1).optional(),
  biome: z.array(id).min(1).optional(),
  kwevoelCalling: z.boolean().optional(),
});

export const BONUS_IDS = ['wholeFlock', 'twoFlies', 'secretChain'] as const;

export const CharmActionsSchema = obj({
    // scoring
    addPoints: z.number().optional(),
    addMult: z.number().optional(),
    mulMult: pos.optional(),
    addMultForHunt: z.number().optional(),
    bonusMul: obj({ bonus: z.enum(BONUS_IDS), mul: nonNeg }).optional(),
    penaltyOverride: obj({ creature: id, points: z.number().int() }).optional(),
    // ammo
    addShells: posInt.optional(),
    shellCapacity: z.number().int().optional(),
    shellCapacityForRun: z.number().int().optional(),
    reloadSpeedMul: pos.optional(),
    weaponBlastEvery: obj({ every: posInt, weapon: id }).optional(),
    // flock / world
    alertRadiusMul: z
      .union([nonNeg, obj({ source: z.enum(['miss']), mul: nonNeg })])
      .optional(),
    alertNearestFlock: z.literal(true).optional(),
    flushFlocks: z.union([z.literal(true), posInt]).optional(),
    spawnEvent: WorldEventIdSchema.optional(),
    spawnRateMul: obj({ creature: id, mul: nonNeg }).optional(),
    windDriftMul: nonNeg.optional(),
    revealSecrets: z.literal(true).optional(),
    slowMo: obj({ scale: z.number().gt(0).max(1), ms: posInt }).optional(),
    addTime: pos.optional(),
    enableStampede: z.literal(true).optional(),
    // frenzy
    frenzyMissBehaviour: z.enum(['reset', 'dropTier']).optional(),
    // economy (additive, Tech §3.8 value semantics)
    addDoppies: z.number().int().optional(),
    interestCap: z.number().int().optional(),
    shopSlots: z.number().int().optional(),
    rerollDiscount: z.number().int().optional(),
  })
  .refine((a) => Object.keys(a).length > 0, 'do needs at least one action');

export const CharmEffectSchema = obj({
  on: CharmTriggerSchema,
  if: CharmConditionsSchema.optional(),
  do: CharmActionsSchema,
});

export const RaritySchema = z.enum(['common', 'uncommon', 'rare', 'legendary']);

export const CharmSchema = obj({
  id,
  rarity: RaritySchema,
  archetype: id,
  effects: z.array(CharmEffectSchema).min(1),
  gadget: obj({ replaces: id, cooldownMs: posInt }).optional(),
  /** Escape hatch to a TypeScript charm in src/sim/charms/registry.ts (Tech §3.8). */
  script: id.optional(),
});
export type Charm = z.infer<typeof CharmSchema>;

export const CharmsSchema = obj({
  version,
  slots: posInt,
  prices: obj({ common: posInt, uncommon: posInt, rare: posInt, legendary: posInt }),
  sellRatio: fraction,
  charms: z.array(CharmSchema).min(1),
});
export type Charms = z.infer<typeof CharmsSchema>;

// ---------------------------------------------------------------------------------------------
// biomes/*.json

const occluderSchema = z.discriminatedUnion('type', [
  obj({ type: z.literal('rect'), w: pos, h: pos, ox: z.number(), oy: z.number() }),
  obj({ type: z.literal('ellipse'), rx: pos, ry: pos, ox: z.number(), oy: z.number() }),
]);

const secretRewardSchema = obj({
    points: posInt.optional(),
    event: WorldEventIdSchema.optional(),
    flushBirds: posInt.optional(),
    effect: z.enum(['allHiddenJump']).optional(),
    addTimeSeconds: pos.optional(),
    barkKey: i18nKey.optional(),
    powerup: id.optional(),
  })
  .refine((r) => Object.keys(r).length > 0, 'reward needs at least one entry');

const secretSchema = z.discriminatedUnion('type', [
  obj({
    type: z.literal('multiHit'),
    parts: z.array(id).min(2),
    partsMoveWith: id.optional(),
    reward: secretRewardSchema,
  }),
  obj({
    type: z.literal('singleHit'),
    part: id,
    oncePerHunt: z.boolean().optional(),
    cooldownSeconds: pos.optional(),
    reward: secretRewardSchema,
  }),
]);

const laneSchema = obj({
  groundY: range(nonNeg).optional(),
  skyY: range(nonNeg).optional(),
  popupY: range(nonNeg).optional(),
});

export const BiomeSchema = obj({
  version,
  id,
  season: id,
  nameKey: i18nKey,
  panoramaWidth: posInt,
  skyBand: obj({ top: nonNeg, bottom: nonNeg })
    .refine((b) => b.top < b.bottom, 'skyBand.top must be above bottom'),
  layers: z
    .array(
      obj({
        id,
        scrollFactor: pos,
        asset: z.string().min(1),
        lowTierMergeWith: id.nullable().optional(),
        plane: PlaneIdSchema.optional(),
        occludes: z.boolean().optional(),
      }),
    )
    .min(1),
  lanes: somePlanes(laneSchema),
  props: z.array(
    obj({
      id,
      layer: id,
      u: fraction,
      y: z.number(),
      asset: z.string().min(1),
      occluder: occluderSchema.optional(),
      secret: secretSchema.optional(),
    }),
  ),
  events: z.array(
    obj({
      id: WorldEventIdSchema,
      creature: id.optional(),
      perHunt: range(nonNegInt),
      window: windowFraction,
      perchProps: z.array(id).min(1).optional(),
      omenOnly: z.boolean().optional(),
      flushOnContact: z.boolean().optional(),
      speedPxPerSec: pos.optional(),
      modes: z.array(ModeIdSchema).min(1).optional(),
    }),
  ),
  omen: obj({
    id,
    wind: obj({
        strength: range(nonNeg),
        directionChangeSeconds: range(pos),
        tailwindSpeedMul: pos,
        headwindSpeedMul: pos,
        driftPxAtFar: nonNeg,
      })
      .optional(),
    /** Renderer-only flags. New omens add their flags here in M8 (strict, so typos fail). */
    visual: obj({
      windSock: z.boolean().optional(),
      leaves: z.boolean().optional(),
      dust: z.boolean().optional(),
    }).optional(),
  }),
  pacing: obj({
    keyframes: z
      .array(
        obj({
          t: fraction,
          flocks: somePlanes(nonNegInt),
          flyoversPerMin: nonNeg,
          popupsPerMin: nonNeg,
        }),
      )
      .min(2)
      .refine((k) => k[0]?.t === 0 && k[k.length - 1]?.t === 1, 'keyframes must span t = 0..1')
      .refine(
        (k) => k.every((x, i) => i === 0 || x.t > (k[i - 1]?.t ?? 0)),
        'keyframes must be sorted by t',
      ),
    maxBirdsOnScreen: posInt,
    maxFlocks: posInt,
  }),
  spawnTable: z.array(obj({ creature: id, weight: pos })).min(1),
  music: obj({ calm: id, build: id, stampede: id }),
  ambience: id,
});
export type Biome = z.infer<typeof BiomeSchema>;

// ---------------------------------------------------------------------------------------------
// The whole bundle

/** Fixed top-level files in content/ and the schema each one must match. */
export const CONTENT_FILES = {
  'scoring.json': ScoringSchema,
  'birds.json': BirdsSchema,
  'weapons.json': WeaponsSchema,
  'powerups.json': PowerupsSchema,
  'charms.json': CharmsSchema,
  'run.json': RunSchema,
} as const;

export interface ContentBundle {
  readonly scoring: Scoring;
  readonly birds: Birds;
  readonly weapons: Weapons;
  readonly powerups: Powerups;
  readonly charms: Charms;
  readonly run: Run;
  readonly biomes: readonly Biome[];
}
