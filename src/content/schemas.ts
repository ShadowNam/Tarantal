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
      /** Foraging: members wander around a goal that moves within this radius of the flock. */
      forageWanderPx: pos,
      /** How often the foraging goal moves. */
      forageGoalMs: range(pos),
      /** After landing, each bird runs on for this long before the flock settles. */
      landRunMs: range(pos),
      /** Gliding birds sink at this speed (design px/s at the mid plane) until they land. */
      glideSinkPxPerSec: pos,
      /** New flocks start scattered within this radius (design px at the mid plane). */
      spawnSpreadPx: pos,
      /** A new flock keeps at least this far (plane px) from other flocks on its plane. */
      spawnSpacingPx: nonNeg,
      /** Hunt-start flocks forage within this many px of the screen centre (in view, GDD §8). */
      startInViewPx: nonNeg,
      /** ALERT birds shuffle at this fraction of walking speed once their freeze ends. */
      alertShuffleMul: nonNeg,
      /** Landed birds run on at this fraction of running speed. */
      landRunSpeedMul: nonNeg,
      /** RUN steers toward a point this far ahead, away from the threat. */
      fleeLookAheadPx: pos,
      /** RUN zigzag: sideways weave period and weight (added to the boids steering). */
      runZigzag: obj({ periodMs: pos, weight: nonNeg }),
      boids: obj({
        separation: nonNeg,
        alignment: nonNeg,
        cohesion: nonNeg,
        noise: nonNeg,
        neighbourRadiusPx: pos,
        /** Birds closer than this push apart (≤ neighbourRadiusPx). */
        separationRadiusPx: pos,
        /** Fraction per tick by which a bird's velocity turns toward its steering target. */
        turnRate: z.number().gt(0).max(1),
      }),
    })
    .refine((f) => f.sizeMin <= f.sizeMax, 'sizeMin must be <= sizeMax'),
  /** Classic fly-overs (GDD §6.5) on the mid and far sky lanes. */
  flyoverDefaults: obj({
    planeWeights: obj({ mid: nonNeg, far: nonNeg }).refine(
      (w) => w.mid + w.far > 0,
      'planeWeights need at least one positive weight',
    ),
    groupSize: range(z.number().int().positive()),
    groupSpacingPx: range(nonNeg),
    bobPx: nonNeg,
    bobPeriodMs: range(pos),
  }),
  /** Near-plane pop-ups (GDD §5.2): rise, stare, duck. */
  popupDefaults: obj({
    riseMs: posInt,
    stareMs: range(pos),
    duckMs: posInt,
    /** Pop-ups appear within this many design px of the screen centre (≤ 720 keeps them on a 4:3 screen). */
    spawnHalfWidthPx: z.number().positive().max(720),
  }),
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
    /** The plane crates parachute onto; they fall from its sky lane top to its ground lane. */
    plane: PlaneIdSchema,
    /** Design px/s at the mid plane. */
    fallPxPerSec: pos,
    /** Time on the ground before the crate is gone. */
    lingerMs: posInt,
    /** Crates appear within this many design px of the screen centre (≤ 720: on a 4:3 screen). */
    spawnHalfWidthPx: z.number().nonnegative().max(720),
    /** Hit ellipse at scale 1.0 (scaled by the plane like birds). */
    hitbox: obj({ rx: pos, ry: pos }),
    table: z
      .array(
        obj({ id, weight: pos, type: z.enum(['powerup', 'weapon']).optional() }),
      )
      .min(1),
  }).refine((c) => c.windows.length === c.perHunt, 'crates need one window per crate (perHunt)'),
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

/** World events a secret can set off (the rest are scheduled, Tech §3.6). */
export const SECRET_EVENT_IDS = ['carAlarm', 'reservoirFlush'] as const;

/** Flock reaction to a world event or secret (GDD §6.2, Tech §3.5). */
export const ReactionSchema = obj({
  effect: z.enum(['threat', 'run', 'flush']),
  scope: z.enum(['all', 'visible', 'area']),
  /** Area scope only: design px at the mid plane around the reward's `at` prop. */
  radiusPx: pos.optional(),
}).refine((r) => (r.scope === 'area') === (r.radiusPx !== undefined), {
  message: 'radiusPx is required for scope "area" and only allowed there',
});

const secretRewardSchema = obj({
    /** Flat event bonus (multiplied by Frenzy × Stampede only, GDD §5.3). */
    points: posInt.optional(),
    /** Label for audio/FX; emitted as a worldEvent. */
    event: z.enum(SECRET_EVENT_IDS).optional(),
    /** Prop where the reward happens (area reactions, flushed birds). */
    at: id.optional(),
    reaction: ReactionSchema.optional(),
    /** A flock of this many birds bursts out at `at` in FLUSH. */
    flushBirds: posInt.optional(),
    addTimeSeconds: pos.optional(),
    barkKey: i18nKey.optional(),
    powerup: id.optional(),
  })
  .refine((r) => Object.keys(r).filter((k) => k !== '$comment').length > 0, 'reward needs at least one entry')
  .refine((r) => r.flushBirds === undefined || r.at !== undefined, 'flushBirds needs "at"')
  .refine((r) => r.reaction?.scope !== 'area' || r.at !== undefined, 'an area reaction needs "at"');

/** A shootable part of a secret prop, in the prop's layer px relative to the prop (or rotor). */
const secretPartSchema = obj({ id, shape: occluderSchema });

const secretSchema = z.discriminatedUnion('type', [
  obj({
    type: z.literal('multiHit'),
    parts: z.array(secretPartSchema).min(2),
    /** Parts orbit this point (relative to the prop) at degPerSec; part offsets are relative to it. */
    rotor: obj({ ox: z.number(), oy: z.number(), degPerSec: z.number() }).optional(),
    /** All parts must be hit within this many seconds of the first, or the marks reset. */
    windowSeconds: pos.optional(),
    reward: secretRewardSchema,
  }),
  obj({
    type: z.literal('singleHit'),
    part: secretPartSchema,
    /** Exactly one of these: pays once per hunt, or again after the cooldown. */
    oncePerHunt: z.literal(true).optional(),
    cooldownSeconds: pos.optional(),
    reward: secretRewardSchema,
  }).refine((s) => (s.oncePerHunt === true) !== (s.cooldownSeconds !== undefined), {
    message: 'singleHit secrets need exactly one of oncePerHunt or cooldownSeconds',
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
      /** Where a perching creature sits (kwêvoël) or a boss appears, relative to the prop. */
      perch: obj({ ox: z.number(), oy: z.number() }).optional(),
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
      /** Perching creatures and bosses: how long they stay (ms). */
      stayMs: range(pos).optional(),
      /** Bosses: how far (design px at mid) they roam from their perch point. */
      roamPx: pos.optional(),
      /** Dust devils: the plane they cross, contact radius (design px at mid) and life. */
      plane: PlaneIdSchema.optional(),
      radiusPx: pos.optional(),
      lifeSeconds: range(pos).optional(),
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
    /** Surge rates used during the Stampede (its length comes from scoring.json, Tech §3.6). */
    stampede: obj({
      flyoversPerMin: nonNeg,
      popupsPerMin: nonNeg,
      /** GDD §8 "mass run/flush": live flocks jump to this state when the Stampede starts, and
       *  flocks spawned during it enter in it. */
      flockState: z.enum(['run', 'flush']).optional(),
    }),
    maxBirdsOnScreen: posInt,
    maxFlocks: posInt,
  }),
  spawnTable: z.array(obj({ creature: id, weight: pos })).min(1),
  music: obj({ calm: id, build: id, stampede: id }),
  ambience: id,
});
export type Biome = z.infer<typeof BiomeSchema>;

// ---------------------------------------------------------------------------------------------
// modes.json

const modeSetupSchema = obj({
  huntSeconds: posInt,
  weapon: id,
  biome: id,
  /** Biome weather (omen) on in this mode (D-021: Classic off, Daily on). */
  omen: z.boolean(),
});

export const ModesSchema = obj({
  version,
  /** Classic and Daily setup. Season Run hunts take their length from run.json (huntSeconds). */
  modes: obj({ classic: modeSetupSchema, daily: modeSetupSchema }),
});
export type Modes = z.infer<typeof ModesSchema>;

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
  'modes.json': ModesSchema,
} as const;

export interface ContentBundle {
  readonly scoring: Scoring;
  readonly birds: Birds;
  readonly weapons: Weapons;
  readonly powerups: Powerups;
  readonly charms: Charms;
  readonly run: Run;
  readonly modes: Modes;
  readonly biomes: readonly Biome[];
}

// ---------------------------------------------------------------------------------------------
// client/feel.json — game-feel tuning for the Phaser layer only (input gestures, pan, juice,
// HUD). Nothing here changes a sim outcome, so it is NOT part of the ContentBundle or the
// contentHash (decision D-019). Read by the game at boot; validated by tools/validate-content.ts.

export const FeelSchema = obj({
  version,
  input: obj({
    /** Tap = contact shorter than this and moving less than tapMaxMovePx (GDD §18.2). */
    tapMaxMs: pos,
    tapMaxMovePx: pos,
    /** Flick-down reload: vertical travel ≥ flickMinPx within flickMaxMs, mostly downward. */
    flickMinPx: pos,
    flickMaxMs: pos,
    /** Drag pans the camera so this plane's layer follows the finger (0.6 = mid plane). */
    dragPlaneScrollFactor: pos,
    /** Pan inertia after a drag: exponential decay rate per second, and the speed cap. */
    inertiaDecayPerSec: pos,
    inertiaMaxPxPerSec: pos,
    /** Inertia below this speed stops. */
    inertiaStopPxPerSec: nonNeg,
    /** Desktop: the outer fraction of the screen width pans while the cursor is there. */
    edgePanFraction: fraction,
    edgePanPxPerSec: pos,
    keyPanPxPerSec: pos,
  }),
  juice: obj({
    hitStopMs: nonNeg,
    hitStopTwoFliesMs: nonNeg,
    muzzleFlashMs: pos,
    gunKickPx: nonNeg,
    gunKickMs: pos,
    featherCount: range(nonNegInt),
    featherLifeMs: pos,
    scorePopRisePx: nonNeg,
    scorePopMs: pos,
    poofMs: pos,
    /** Touch: the gun shrinks to this scale and fades to this alpha while a finger is down. */
    gunTouchScale: pos,
    gunTouchAlpha: fraction,
    /** Flock juice (GDD §17): ALERT "KEK!" and the synchronised FLUSH "KEK-KEK-KEK!" bubbles. */
    kekBubbleMs: pos,
    flushBubbleMs: pos,
    /** HUD banners (wing shot, Stampede) and the "DIE HELE SWERM!" stamp. */
    bannerMs: pos,
    stampMs: pos,
    /** M4: secret hint glints (one per ready secret every glintEveryMs, each lasting glintMs). */
    glintEveryMs: pos,
    glintMs: pos,
    /** Wind leaves/dust particles per second at full strength (omen visual flags). */
    windParticlesPerSec: nonNeg,
    /** Voorlaaier smoke cloud scale (its length is weapons.json smokeMs). */
    smokeScale: pos,
    /** "⛔ don't shoot" and boss call-outs. */
    calloutMs: pos,
  }),
  hud: obj({
    marginPx: nonNeg,
    /** Minimum height of the shell-belt tap target on touch screens (art bible §6). */
    beltTapMinPx: pos,
    popStackSize: posInt,
    /** Vuvuzela button (bottom-left), a square tap target ≥ 64 design px (art bible §6). */
    gadgetPx: z.number().min(64),
    /** Power-up / crate-weapon chips under the Frenzy meter. */
    chipW: pos,
    chipH: pos,
  }),
  loop: obj({
    /** Most sim steps per rendered frame (spiral-of-death guard, Tech §3.2). */
    maxStepsPerFrame: posInt,
  }),
  quality: obj({
    /** Particle budget until QualityManager (M9) picks tiers: medium tier = 0.7. */
    particleScale: z.number().min(0).max(1),
  }),
});
export type Feel = z.infer<typeof FeelSchema>;

// ---------------------------------------------------------------------------------------------
// meta/notaboek.json — Oupa se Notaboek challenges (GDD §13.6). Meta progression only: outside
// the sim ContentBundle and its contentHash (like client/feel.json), so editing a challenge
// never invalidates a replay.

/** What a challenge counts. Per-hunt values come from the game's hunt log (src/meta/huntLog.ts). */
export const NotaboekMetricSchema = z.enum([
  'hunts',
  'bagged',
  'baggedFar',
  'wingShots',
  'wholeFlocks',
  'secrets',
  'crates',
  'score',
  /** Different secrets found in `biome` (a full Bird Book page). */
  'distinctSecrets',
]);
export type NotaboekMetric = z.infer<typeof NotaboekMetricSchema>;

const notaboekRewardSchema = z.discriminatedUnion('type', [
  /** Unlocks a primary weapon (weapons.json unlock {type: challenge} must point back here). */
  obj({ type: z.literal('weapon'), id }),
  /** Completes a biome's Bird Book page (a badge on the page). */
  obj({ type: z.literal('birdBookPage'), biome: id }),
  /** A tick in the Notaboek only. */
  obj({ type: z.literal('none') }),
]);

export const NotaboekSchema = obj({
  version,
  challenges: z
    .array(
      obj({
        id,
        metric: NotaboekMetricSchema,
        /** `total`: summed over every hunt; `hunt`: reached within one hunt. */
        scope: z.enum(['total', 'hunt']),
        target: posInt,
        /** Required by distinctSecrets; otherwise counts any biome. */
        biome: id.optional(),
        /** Only hunts in these modes count (default: every mode). */
        modes: z.array(z.enum(['classic', 'daily', 'seasonHunt', 'ftue'])).optional(),
        reward: notaboekRewardSchema,
      }),
    )
    .min(1),
});
export type Notaboek = z.infer<typeof NotaboekSchema>;
export type NotaboekChallenge = Notaboek['challenges'][number];
