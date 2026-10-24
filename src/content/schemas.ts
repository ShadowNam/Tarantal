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

/** v1.3 (D-036): `ver` is the distant band behind the far plane (rifles only). */
export const PlaneIdSchema = z.enum(['near', 'mid', 'far', 'ver']);
/** v1.3x (D-037): `range` is the admin-only Skietbaan (training ground), never a hunt. */
export const ModeIdSchema = z.enum(['classic', 'daily', 'seasonHunt', 'ftue', 'range']);
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
  // M8: the Okavango fish eagle fly-over and the kuifkop hopping between reeds.
  'fishEagle',
  'kuifkopHop',
]);
export type WorldEventId = z.infer<typeof WorldEventIdSchema>;

/** The three bands every gun reaches (near, mid, far): Kettie flight times and drops. */
function perPlane<T extends z.ZodType>(item: T) {
  return obj({ near: item, mid: item, far: item });
}
/** Every plane including Ver (v1.3). */
function allPlanes<T extends z.ZodType>(item: T) {
  return obj({ near: item, mid: item, far: item, ver: item });
}
function somePlanes<T extends z.ZodType>(item: T) {
  return obj({
    near: item.optional(),
    mid: item.optional(),
    far: item.optional(),
    ver: item.optional(),
  });
}

const shakeSchema = obj({ px: nonNeg, ms: nonNegInt });

/** Score multipliers by plane; `all` applies to every plane. */
const scoreMulSchema = obj({ all: pos.optional(), near: pos.optional(), mid: pos.optional(), far: pos.optional(), ver: pos.optional() })
  .refine((m) => Object.keys(m).length > 0, 'scoreMul needs at least one entry');

// ---------------------------------------------------------------------------------------------
// scoring.json

export const ScoringSchema = obj({
  version,
  planes: allPlanes(
    obj({
      base: posInt,
      scale: pos,
      scrollFactor: pos,
      aimAssistPx: nonNeg,
      lineWeightPx: pos,
    }),
  ).refine(
    (p) => p.ver.scrollFactor < p.far.scrollFactor && p.ver.scale < p.far.scale,
    'the ver plane sits behind the far plane (smaller scroll factor and scale)',
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
  /** Settings → aim assist: multiplier on the touch aimAssistPx radii (GDD §18.2–18.3). */
  aimAssistLevels: obj({ off: z.literal(0), low: fraction, standard: z.literal(1) }),
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
    planeWeights: obj({ mid: nonNeg, far: nonNeg, ver: nonNeg.optional() }).refine(
      (w) => w.mid + w.far + (w.ver ?? 0) > 0,
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
  /** Delayed hitscan (Kettie, Tech §3.4): the stone reaches near → mid → far in that order. */
  projectile: obj({ travelMs: perPlane(posInt), dropPx: perPlane(nonNeg) })
    .refine(
      (p) => p.travelMs.near <= p.travelMs.mid && p.travelMs.mid <= p.travelMs.far,
      'projectile travelMs must not decrease from near to far',
    )
    .nullable(),
  scoreMul: scoreMulSchema,
  shake: shakeSchema,
  /** v1.3: the shot reaches the Ver plane (rifles). Absent = it falls short (shotguns, air
   *  rifle, Kettie stones). */
  reachesVer: z.boolean().optional(),
  /** v1.4 (D-038): very loud — every shot threatens every flock (Die Langloop). */
  alertsAllFlocks: z.boolean().optional(),
  /** v1.3 rifles: hold to raise the sight and zoom, release to fire (GDD §10.6). */
  aim: obj({
    /** Sights that fit this gun (weapons.json sights), in upgrade order. */
    sights: z.array(id).min(1),
    /** Fitted when the player has chosen none. */
    defaultSight: id,
    /** A release before the sight is up fires from the hip: a disc of this radius (design px). */
    hipSpreadPx: nonNeg,
  })
    .refine((a) => a.sights.includes(a.defaultSight), 'aim.defaultSight must be in aim.sights')
    .optional(),
});

/** v1.3 (D-036): a sight the rifles can fit. Sway is design px of the unzoomed screen. */
export const SightSchema = obj({
  id,
  nameKey: i18nKey,
  /** How the sight is earned (the Skiet-Skuur fits it): start, a Notaboek challenge or a rank. */
  unlock: unlockSchema,
  /** Zoom steps (×). A fixed sight has one; a variable scope picks one with the zoom command. */
  zoom: z
    .array(z.number().min(1).max(12))
    .min(1)
    .refine((z2) => z2.every((v, i) => i === 0 || v > (z2[i - 1] ?? 0)), 'zoom steps ascend'),
  /** Time from the press until the sight is up (a release before it is a hip shot). */
  raiseMs: posInt,
  /** Figure-eight sway: amplitude at the first zoom step, period of one loop. */
  swayPx: nonNeg,
  swayPeriodMs: posInt,
  /** Each raise draws its loop pace (× the loop rate) from this range (rng.stream('sway')). */
  swayPace: range(pos),
  /** Height of the figure-eight as a fraction of its width. */
  swayHeight: fraction,
  /** Extra sway per zoom step above the first (variable scopes: more sway at 9×). */
  swayPerStep: nonNeg,
  /** Breath hold: after holdAfterMs of holding the sway eases to holdMul for holdMs, then
   *  grows to tiredMul over tireMs (you can't camp on a bird). */
  breath: obj({
    holdAfterMs: nonNegInt,
    easeMs: posInt,
    holdMs: posInt,
    holdMul: fraction,
    tireMs: posInt,
    tiredMul: z.number().min(1),
  }),
  /** How the sight picture is drawn (client only). */
  picture: z.enum(['iron', 'peep', 'scope', 'scope_range']),
});
export type Sight = z.infer<typeof SightSchema>;

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
  /** v1.3: rifle sights (absent in content before v1.3). */
  sights: z.array(SightSchema).default([]),
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
      /** darkExceptLightning: seconds between lightning flashes, and how long one lights up. */
      flashEverySeconds: range(pos).optional(),
      flashMs: posInt.optional(),
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
  for (const [ruleId, rule] of Object.entries(run.bossRules)) {
    const every = rule.flashEverySeconds;
    if (ruleId === 'darkExceptLightning' && (every === undefined || rule.flashMs === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['bossRules', ruleId],
        message: 'darkExceptLightning needs flashEverySeconds and flashMs',
      });
    }
    if (every === undefined) continue;
    const max = rule.maxFlashesPerSecond ?? 3;
    if (every[0] < 1 / max) {
      ctx.addIssue({
        code: 'custom',
        path: ['bossRules', ruleId, 'flashEverySeconds'],
        message: `flashes closer than 1/${max} s break maxFlashesPerSecond`,
      });
    }
  }
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
  /** Padstal: how likely each rarity is to be offered (relative weights). */
  offerWeights: obj({ common: nonNeg, uncommon: nonNeg, rare: nonNeg, legendary: nonNeg }),
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
    /** M8 "don't shoot it" props (the Kalahari weaver nest): this many points off. Not a secret
     *  found: no secret count, chain or charm trigger. */
    penalty: posInt.optional(),
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
    /** M8: hits (over any number of shots) before it pays, e.g. the Bushveld boulder crack. */
    hitsRequired: z.number().int().min(2).optional(),
    reward: secretRewardSchema,
  }).refine((s) => (s.oncePerHunt === true) !== (s.cooldownSeconds !== undefined), {
    message: 'singleHit secrets need exactly one of oncePerHunt or cooldownSeconds',
  }),
  /** M8: shoot *near* the part, not at it (the Bushveld dassie): a pellet landing within
   *  `radiusPx` (layer px) of the part's centre but outside its shape pays. The part is not a
   *  target: pellets pass it. */
  obj({
    type: z.literal('nearMiss'),
    part: secretPartSchema,
    radiusPx: pos,
    oncePerHunt: z.literal(true).optional(),
    cooldownSeconds: pos.optional(),
    reward: secretRewardSchema,
  }).refine((s) => (s.oncePerHunt === true) !== (s.cooldownSeconds !== undefined), {
    message: 'nearMiss secrets need exactly one of oncePerHunt or cooldownSeconds',
  }),
]);

const laneSchema = obj({
  groundY: range(nonNeg).optional(),
  skyY: range(nonNeg).optional(),
  popupY: range(nonNeg).optional(),
});

// v1.2 (D-033): day-of-week maps and bonus maps. A map is the biome with overrides applied
// (src/sim/maps.ts): the layout of the UTC weekday, then a bonus map (Verder) on top.

/** Layout ids, Monday first (ISO weekday 1..7 → index 0..6). */
export const WEEKDAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayId = (typeof WEEKDAY_IDS)[number];
export const WeekdayIdSchema = z.enum(WEEKDAY_IDS);
/** Bonus maps in unlock order (v1.3 adds nogVerder and dieVerste, D-036). */
export const BONUS_MAP_IDS = ['verder', 'nogVerder', 'dieVerste'] as const;
export type BonusMapId = (typeof BONUS_MAP_IDS)[number];
export const BonusMapIdSchema = z.enum(BONUS_MAP_IDS);

/** Where flocks of a plane prefer to forage: u range (0..1 of the plane layer's core width). */
const feedingSpotSchema = obj({
  plane: z.enum(['mid', 'far', 'ver']),
  u: range(fraction),
});

/** Fly-over routes: which sky lane groups take (weights) and which way they all fly. */
const flyoverRouteSchema = obj({
  planeWeights: obj({ mid: nonNeg, far: nonNeg, ver: nonNeg.optional() })
    .refine(
      (w) => w.mid + w.far + (w.ver ?? 0) > 0,
      'planeWeights need at least one positive weight',
    )
    .optional(),
  /** 1 = every group flies left → right, −1 = right → left; absent = either way. */
  dir: z.union([z.literal(1), z.literal(-1)]).optional(),
});

/** What a layout or bonus map changes. Everything optional: absent = the biome's own. */
const mapOverrideShape = {
  /** Light preset (client/feel.json lights): tints and haze, drawn only. */
  light: id.optional(),
  /** Moved props (with their occluders, secrets and perches). The layer stays the prop's own. */
  props: z.array(obj({ id, u: fraction, y: z.number().optional() })).optional(),
  /** Lane bands merged over the biome's, per plane and key. */
  lanes: somePlanes(
    obj({
      groundY: range(nonNeg).optional(),
      skyY: range(nonNeg).optional(),
      popupY: range(nonNeg).optional(),
    }),
  ).optional(),
  feedingSpots: z.array(feedingSpotSchema).min(1).optional(),
  flyovers: flyoverRouteSchema.optional(),
  /** Where the hunt opens along the pan (0 = west end, 1 = east end; absent = the middle). */
  cameraStartU: fraction.optional(),
  /** calm = no biome weather in any mode; omen = weather on in Classic and Daily; default = the
   *  mode's (D-021: Classic off, Daily on). Season Run and FTUE hunts play no layout. */
  weather: z.enum(['calm', 'default', 'omen']).optional(),
  /** Multiplies the omen's wind strength (biomes with wind only). */
  windMul: pos.optional(),
  pacing: obj({
    flyoversMul: pos.optional(),
    popupsMul: pos.optional(),
    /** Replaces every keyframe's flock targets. */
    flocks: somePlanes(nonNegInt).optional(),
  }).optional(),
  /** Overrides the biome twist's share of flocks that run instead of flying. */
  flushAsRunChance: fraction.optional(),
  /** Multiplies every bird's base points (rounded), e.g. dusk: fewer birds, worth more. */
  pointsMul: pos.optional(),
  /** v1.3 (D-036): this map opens the Ver plane (the biome's `ver` layer and lanes). Maps
   *  without it play as before: the Ver layer is left out of the map entirely. */
  ver: z.boolean().optional(),
};

export const LayoutSchema = obj({
  id: WeekdayIdSchema,
  ...mapOverrideShape,
  light: id,
  weather: z.enum(['calm', 'default', 'omen']),
});
export type Layout = z.infer<typeof LayoutSchema>;

export const BonusMapSchema = obj({
  id: BonusMapIdSchema,
  nameKey: i18nKey,
  ...mapOverrideShape,
  /** v1.3 (D-036): the map starts only with a rifle that has a scope fitted (a sight whose
   *  picture is `scope`); the title's button says why otherwise. */
  needsScope: z.boolean().optional(),
});
export type BonusMap = z.infer<typeof BonusMapSchema>;

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
      /** M8 peekFromCover bosses (Ou Grys): how long a peek and a hide between covers last. */
      peekMs: range(pos).optional(),
      hideMs: range(pos).optional(),
      /** M8 hopping birds (kuifkop, Kuifkop Koning): a visible hop to the next cover takes hopMs
       *  and rises hopPx (design px at mid) at its top. */
      hopMs: range(pos).optional(),
      hopPx: pos.optional(),
      /** Hop speed (design px/s at mid): a hop to the next cover lasts distance / speed, at least
       *  hopMs. */
      hopPxPerSec: pos.optional(),
      /** M8 lightningOnly bosses (Die Stormvoël): which plane each pass across the sky is on. */
      passes: z.array(PlaneIdSchema).min(1).optional(),
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
    /** M8 Okavango sun-showers: a shower every `everySeconds` (gap) for `lastSeconds`, drawn from
     *  the omen stream at hunt start; while it rains a shot's alert radius is × alertRadiusMul. */
    showers: obj({ everySeconds: range(pos), lastSeconds: range(pos), alertRadiusMul: pos }).optional(),
    /** M8 Kalahari heat → storm: heat haze wobbles far-plane birds (hitboxes too) by hazePx
     *  until `stormAt` (fraction of the hunt), then a thunderstorm: rain (flocks run, never fly)
     *  and lightning every lightningEverySeconds for flashMs, never above maxFlashesPerSecond. */
    storm: obj({
      stormAt: fraction,
      hazePx: nonNeg,
      hazePeriodSeconds: pos,
      lightningEverySeconds: range(pos),
      flashMs: posInt,
      maxFlashesPerSecond: z.number().positive().max(3),
    })
      .refine((s) => s.lightningEverySeconds[0] >= 1 / s.maxFlashesPerSecond, {
        message: 'storm flashes closer than 1/maxFlashesPerSecond s',
      })
      .optional(),
    /** M8 Bushveld low sun: a glare band this wide (design px of the screen) on one side of the
     *  view, the side drawn from the omen stream at hunt start. Drawn only; no sim rule. */
    glare: obj({ widthPx: pos, alpha: fraction }).optional(),
    /** Renderer-only flags. New omens add their flags here (strict, so typos fail). */
    visual: obj({
      windSock: z.boolean().optional(),
      leaves: z.boolean().optional(),
      dust: z.boolean().optional(),
      frost: z.boolean().optional(),
      rain: z.boolean().optional(),
      rainbow: z.boolean().optional(),
    }).optional(),
  }),
  /** M8 biome twist (GDD §11 "Gameplay twist"): on in every mode, unlike the omen. */
  twist: obj({
    /** Share of flocks that run instead of taking wing when a threat would flush them. */
    flushAsRunChance: fraction.optional(),
    /** Okavango: water on a layer. A pellet that stops on nothing over water splashes — one
     *  threat to every flock within alertRadiusPx (design px at mid) of it, even from a silent
     *  gun (not your gun's noise, so Stil Loop doesn't silence it). */
    splash: obj({
      zones: z.array(obj({ layer: id, u: fraction, y: z.number(), shape: occluderSchema })).min(1),
      alertRadiusPx: pos,
    }).optional(),
  }).optional(),
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
  /** v1.2: flock feeding spots and fly-over routes (absent = anywhere, either way). Layouts set
   *  them; the biome's own apply to Season Run and FTUE hunts. */
  feedingSpots: z.array(feedingSpotSchema).min(1).optional(),
  flyovers: flyoverRouteSchema.optional(),
  cameraStartU: fraction.optional(),
  /** v1.2: one layout per UTC weekday, Monday first. */
  layouts: z
    .array(LayoutSchema)
    .length(WEEKDAY_IDS.length)
    .refine((l) => l.every((x, i) => x.id === WEEKDAY_IDS[i]), 'layouts must be mon..sun in order'),
  /** v1.2: bonus maps (Verder), each at most once. */
  bonusMaps: z
    .array(BonusMapSchema)
    .min(1)
    .refine((b) => new Set(b.map((x) => x.id)).size === b.length, 'a bonus map is listed twice'),
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

/** FTUE "Oupa se Les" (GDD §16): a gentler Karoo hunt with scripted beats. */
const tutorialSchema = obj({
  /** Multiplies the biome's fly-over and pop-up rates (slower pacing). */
  spawnRateMul: z.number().positive().max(1),
  /** Extra hit radius (design px, every plane and input kind) until the first bag. */
  firstHitAssistPx: nonNeg,
  /** Scripted flock beats at fractions of the hunt: `spook` = Bles makes a visible flock RUN
   *  (skipped if the player already made one run); `flush` = a visible flock FLUSHES. */
  beats: z.array(
    obj({
      at: fraction,
      action: z.enum(['spook', 'flush']),
      skipIfFlockRan: z.boolean().optional(),
    }),
  ),
});

/** A spot on a range plane: dx design px from the screen centre at the range's camera start,
 *  y design px from the top. */
const rangeSpotSchema = obj({ dx: z.number(), y: nonNeg });

/** v1.3x (D-037) Skietbaan: where one plane's targets stand. */
const rangePlaneSchema = obj({
  /** Paper targets (fixed; centre of each circle). */
  paper: z.array(rangeSpotSchema).min(1),
  /** Steel plates (24 Oct update): a round gong on a post; the centre of each plate. */
  plate: z.array(rangeSpotSchema).min(1),
  /** The standing bird (it stands still and respawns when bagged). */
  stand: rangeSpotSchema,
  /** The small flock's home x (dx from the screen centre); it forages on the plane's lane. */
  flockDx: z.number(),
  /** Fly-over height (one bird across the view, back and forth). */
  flyY: nonNeg,
  /** The range's half-width (plane px either side of the screen centre): a fly-over enters and
   *  leaves there, and any bird beyond it has left the range (a flushed flock flying off). */
  flyHalfPx: pos,
  /** A flock lane for a plane the biomes give none (near: pop-ups only). */
  lane: obj({ groundY: range(nonNeg), skyY: range(nonNeg) }).optional(),
});

/** v1.3x (D-037) the Skietbaan: no timer, score, Frenzy or penalties; unranked; endless. */
const rangeSchema = modeSetupSchema.omit({ huntSeconds: true }).extend({
  /** The range never has weather (wind would move every group). */
  omen: z.literal(false),
  /** The creature of the bird targets (and whose body width the group is compared with). */
  creature: id,
  /** Camera start along the pan (0..1); the spots are placed from it. */
  cameraU: fraction,
  /** A bird target that was bagged or left comes back after this long. */
  respawnMs: posInt,
  /** Paper target radius at plane scale 1 (scaled by each plane's scale). */
  paperRadiusPx: pos,
  /** Steel plate radius at plane scale 1 (scaled like the paper). */
  plateRadiusPx: pos,
  /** Birds in the small flock (at least the 3 a flock needs). */
  flockSize: z.number().int().min(3),
  spots: allPlanes(rangePlaneSchema),
  /** 24 Oct update (D-037): the mixed course — targets on every distance at once. */
  mixed: obj({
    /** Per plane: how many static targets, and the dx spots (from the screen centre at the
     *  camera start) they are drawn from. */
    planes: allPlanes(
      obj({ count: z.number().int().min(1), dx: z.array(z.number()).min(1) }).refine(
        (p) => p.count <= p.dx.length,
        'mixed count must not exceed its dx spots',
      ),
    ),
    /** Kinds a static target is drawn from; each one is on the course at least once. */
    statics: z.array(z.enum(['paper', 'plate', 'stand'])).min(1),
    /** The planes the one fly-over and the one small flock are drawn from. */
    movers: obj({
      flyover: z.array(z.enum(['near', 'mid', 'far', 'ver'])).min(1),
      flock: z.array(z.enum(['near', 'mid', 'far', 'ver'])).min(1),
    }),
  }),
});

export const ModesSchema = obj({
  version,
  /** Classic, Daily and FTUE setup. Season Run hunts take their length from run.json. */
  modes: obj({
    classic: modeSetupSchema,
    daily: modeSetupSchema,
    ftue: modeSetupSchema.extend({ tutorial: tutorialSchema }),
    range: rangeSchema,
  }),
});
export type RangeSetup = z.infer<typeof rangeSchema>;
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

const qualityTier = obj({
  /** Particle budget multiplier (feathers, wind leaves). Tiers never hide information. */
  particleScale: fraction,
  /** M9: canvas px per design px (Tech §5: low 0.67, medium 0.83, high 1). */
  renderScale: z.number().min(0.5).max(1),
  /** M9: WebGL antialiasing (set when the game boots, from the tier the last benchmark chose). */
  antialias: z.boolean(),
  /** M9: camera vignette (screen space) or null; radius and strength 0..1. */
  vignette: obj({ radius: fraction, strength: fraction }).nullable(),
  /** M9: bloom (bright parts blurred and added back) or null. */
  bloom: obj({ threshold: fraction, amount: fraction, blur: posInt }).nullable(),
  /** M9: parallax layers drawn on another layer's plane: [from, into] layer ids (decoration only). */
  mergeLayers: z.array(z.tuple([z.string(), z.string()])).max(4),
});

/**
 * v1.0.1 (D-028 §3): what makes Oupa bark. Hunt triggers come from sim events (and the run's
 * quota, the save's last hunt day); tally triggers from the tally and the run tally.
 */
export const BARK_TRIGGERS = [
  'firstToday',
  'boss',
  'stampede',
  'wholeFlock',
  'twoFlies',
  'quotaMet',
  'kwevoel',
  'nonTarget',
  'lastSeconds',
  'frenzyTop',
  'bagStreak',
  'missStreak',
  'emptyClick',
  'rain',
  'crate',
  'idle',
  'flush',
  'newBest',
  'legend',
  'badHunt',
  'quotaMissed',
  'runWon',
] as const;
export type BarkTrigger = (typeof BARK_TRIGGERS)[number];

// ASCII only: the key is also the voice file name (audio/voice/<key>.wav), and a non-ASCII name
// changes under macOS NFD or zip normalisation, so the recording would never match.
const barkKey = z.string().regex(/^bark\.[a-z][a-z0-9_]*$/, 'bark lines are ASCII bark.* i18n keys');
const BarkTriggerSchema = obj({
  /** Highest priority wins when several triggers fire in one frame. */
  priority: nonNegInt,
  /** This trigger speaks at most once per cooldownMs (on top of the global gap). */
  cooldownMs: nonNeg,
  /** Lines said in turn: i18n keys, also the voice keys (voice/<line>). */
  lines: z.array(barkKey).min(1),
});

// v1.1 (D-032): what each gun shows on screen — its ammo on the HUD and its crosshair. Screen
// only: none of this reaches the sim. Adding a gun's look (the .22, the Langloop) is data here
// plus one interim drawing in tools/art; the HUD and the crosshair code read only this.
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** One kind of round. Textures `ui/ammo/<type>` (full) and `ui/ammo/<type>_spent`. */
const AmmoTypeSchema = obj({
  /** HUD texture size in design px (1 texture px per design px, origin at the centre). */
  width: posInt,
  height: posInt,
  /** Step between rounds in a belt or pile row (design px). */
  pitch: pos,
  /** What a fired round leaves: its own spent texture, or nothing (the slot empties). */
  spent: z.enum(['sprite', 'gone']),
  /** Runtime placeholder colours until the interim/final art loads: body and base. */
  body: hexColor,
  base: hexColor,
  /** Hopper: the band of the texture (fractions of its height, top and bottom) that holds the
   *  ammo and empties; the rest (the hopper's frame) always shows. */
  fillBand: range(fraction).optional(),
});
export type AmmoType = z.infer<typeof AmmoTypeSchema>;

const AmmoDisplaySchema = z.discriminatedUnion('layout', [
  /** A row of rounds, one per shell in the magazine (or crate shot), newest on the left. */
  obj({ layout: z.literal('belt'), type: id }),
  /** Unlimited ammo (Kettie): a small pile of `count` rounds; the top one goes while drawing. */
  obj({ layout: z.literal('pile'), type: id, count: posInt }),
  /** One container that empties with the time left (Mielie-Masjien): the full texture is
   *  cropped down over the spent (empty) one. */
  obj({ layout: z.literal('hopper'), type: id }),
]);
export type AmmoDisplay = z.infer<typeof AmmoDisplaySchema>;

/** Radius: design px, or "spread" × `scale` (the weapon's spreadPx: where its pellets land). */
const radiusSchema = z.union([pos, z.literal('spread')]);
const CrosshairPartSchema = z.discriminatedUnion('shape', [
  /** A ring; `rough` > 0 makes it hand-cut and uneven (Voorlaaier), `gaps` breaks it. */
  obj({
    shape: z.literal('ring'),
    r: radiusSchema,
    scale: pos.default(1),
    rough: fraction.default(0),
    gaps: nonNegInt.default(0),
    width: pos.default(1),
  }),
  /** A filled centre dot. */
  obj({ shape: z.literal('dot'), r: pos }),
  /** `count` short marks around the centre from `inner` to `outer` (px past the radius `at`). */
  obj({
    shape: z.literal('ticks'),
    at: radiusSchema,
    inner: z.number(),
    outer: z.number(),
    count: posInt,
    width: pos.default(1),
  }),
  /** A thin cross with a gap in the middle. */
  obj({ shape: z.literal('cross'), gap: nonNeg, len: pos, width: pos.default(1) }),
  /** A small V (slingshot fork) with its point on the aim point. */
  obj({ shape: z.literal('vee'), size: pos, width: pos.default(1) }),
  /** Kettie: a line down from the aim point with a mark at each plane's projectile drop. */
  obj({ shape: z.literal('drop'), mark: pos, width: pos.default(1) }),
]);
export type CrosshairPart = z.infer<typeof CrosshairPartSchema>;

const CrosshairSchema = obj({
  parts: z.array(CrosshairPartSchema).min(1),
  /** The whole crosshair shakes by up to this many px every frame (Mielie-Masjien). */
  jitterPx: nonNeg.default(0),
});
export type Crosshair = z.infer<typeof CrosshairSchema>;

/** Colours and line weight of every crosshair (the Skiet-Skuur's crosshair styles pick one). */
const CrosshairStyleSchema = obj({
  color: hexColor,
  /** The dark keyline under every line, so it reads on sky and veld alike. */
  keyline: hexColor,
  /** Line width (× each part's width) and the keyline's extra width on each side. */
  lineWidth: pos,
  keylinePx: nonNeg,
  alpha: fraction,
});
export type CrosshairStyle = z.infer<typeof CrosshairStyleSchema>;

export const GunLookSchema = obj({
  ammo: z.record(id, AmmoTypeSchema),
  crosshairStyles: z.record(id, CrosshairStyleSchema),
  /** The style used until the Skiet-Skuur lets the player pick one. */
  crosshairStyle: id,
  /** Weapon id (content/weapons.json) → its ammo display and crosshair. */
  weapons: z.record(
    id,
    obj({
      ammo: AmmoDisplaySchema,
      crosshair: CrosshairSchema,
      /** v1.1: the gun's sounds (sfx ids): its shot, and on reload start, each shell loaded and
       *  reload end (absent = silent). */
      sfx: obj({
        shot: id,
        reloadStarted: id.optional(),
        shellLoaded: id.optional(),
        reloadFinished: id.optional(),
        /** Played `afterShotMs` after a shot that leaves rounds (a crate gun's reload has no
         *  reload events: the Voorlaaier's ramrod). */
        afterShot: id.optional(),
        afterShotMs: nonNeg.optional(),
      }),
    }),
  ),
  /** GDD §18.2: Settings → offset crosshair (touch) puts it this far above the finger. */
  offsetCrosshairPx: pos,
});
export type GunLook = z.infer<typeof GunLookSchema>;

/** A light preset (v1.2): multiply tints per layer id and haze bands over a layer's art. */
export const LightSchema = obj({
  /** Multiply tint of a layer's art and props, by layer id (absent = untinted). */
  tint: z.record(id, hexColor).optional(),
  /** A flat colour band over a layer's art and props, below its birds (mist, haze, dusk). `top`
   *  and `bottom` are design px (default: the whole height). */
  haze: z
    .array(
      obj({
        layer: id,
        color: hexColor,
        alpha: fraction,
        top: nonNeg.optional(),
        bottom: nonNeg.optional(),
      }),
    )
    .optional(),
  /** Clouds on the sky layer: `count` soft ellipse clusters (Phaser shapes, no textures), each
   *  `w` wide, centred between `y` (design px), spread evenly along the sky with a fixed jitter. */
  clouds: z
    .array(
      obj({
        color: hexColor,
        alpha: fraction,
        count: posInt,
        y: range(nonNeg),
        w: range(pos),
      }),
    )
    .optional(),
  /** Secrets' shootable parts glow softly (dusk). */
  secretGlow: z.boolean().optional(),
});
export type Light = z.infer<typeof LightSchema>;

export const FeelSchema = obj({
  version,
  input: obj({
    /** Tap = contact shorter than this and moving less than tapMaxMovePx (GDD §18.2). */
    tapMaxMs: pos,
    tapMaxMovePx: pos,
    /** M9 Settings → hold to fire on touch: a finger still (< tapMaxMovePx) this long starts the
     *  repeat; moving first keeps it a drag or flick (D-026). */
    touchHoldMs: pos,
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
    /** M8: rain streaks per second while it rains (sun-showers, storm), before the quality tier. */
    rainParticlesPerSec: nonNeg,
    /** Voorlaaier smoke cloud scale (its length is weapons.json smokeMs). */
    smokeScale: pos,
    /** "⛔ don't shoot" and boss call-outs. */
    calloutMs: pos,
    /** M10 delivered bird clips: render ticks per foraging walk/peck spell (every third pecks). */
    forageSpellTicks: posInt,
    /** M10 juice pass: multiplier on every weapon's screen shake (weapons.json stays sim content). */
    shakeScale: nonNeg,
    /** Frenzy tier up: the meter label punches from this scale back to 1 over frenzyPunchMs. */
    frenzyPunchScale: z.number().min(1).max(3),
    frenzyPunchMs: pos,
    /** GDD §17 Stampede: a warm sky tint fades in (steady, never pulsing) and the ground rumbles
     *  (a small camera shake every rumbleEveryMs, off with Settings → screen shake). */
    stampede: obj({
      tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      tintAlpha: fraction,
      tintFadeMs: pos,
      rumblePx: nonNeg,
      rumbleMs: pos,
      rumbleEveryMs: pos,
    }),
  }),
  /** M10 Bakkie Tally pacing (GDD §17): score count-up with ticks, rows fading in one by one,
   *  then the rank stamp thud and the news line. */
  tally: obj({
    countUpMs: pos,
    tickEveryMs: pos,
    rowDelayMs: nonNeg,
    rowStaggerMs: nonNeg,
    rowFadeMs: pos,
    stampMs: pos,
    newsDelayMs: nonNeg,
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
  /** v1.1 (D-032): per-gun ammo display and crosshair. */
  guns: GunLookSchema,
  loop: obj({
    /** Most sim steps per rendered frame (spiral-of-death guard, Tech §3.2). */
    maxStepsPerFrame: posInt,
  }),
  quality: obj({
    /** Tier used by Settings → quality "auto" on capable devices. */
    auto: z.enum(['low', 'medium', 'high']),
    /** Coarse-pointer devices with this many logical cores or fewer start on the low tier. */
    lowTierMaxCores: posInt,
    /** M9: the title-screen frame benchmark behind "auto" (Tech §5). */
    benchmark: obj({
      /** Frames measured, after `warmupFrames` (texture uploads, shader compiles) are skipped. */
      frames: posInt,
      warmupFrames: nonNegInt,
      /** Average frame time above this → low. */
      lowAboveMs: pos,
      /** At or below this, on a fine pointer with enough cores and memory → high. */
      highBelowMs: pos,
      highMinCores: posInt,
      /** navigator.deviceMemory (GB); unknown counts as enough. */
      highMinMemoryGb: pos,
    }),
    tiers: obj({ low: qualityTier, medium: qualityTier, high: qualityTier }),
  }),
  ftue: obj({
    /** Fraction of the FTUE hunt when "Hmm, Oupa's windpomp…" shows. */
    secretHintAt: fraction,
    bannerMs: pos,
    /** Longest FTUE prompt in characters (GDD §16: never more than one line). */
    maxPromptChars: posInt,
  }),
  accessibility: obj({
    /** Reduce flashes: alpha of the muzzle flash and the secret hint glints. */
    reducedFlashAlpha: fraction,
    /** M9 text size "large": font scale for menus, tally, captions, prompts and call-outs. */
    largeTextScale: z.number().min(1).max(1.6),
    /** M9 high contrast: outline width as a fraction of the font size. */
    contrastStroke: fraction,
    /** M9 captions: how long one shows, how many at once, and the gap before the same one repeats. */
    captionMs: pos,
    captionMax: posInt,
    captionRepeatMs: nonNeg,
    /** M10: large-area flashes (lightning light, lit darkness) allowed to start in any second,
     *  across all sources (WCAG 2.3.1: never more than 3). */
    maxLargeFlashesPerSec: z.number().int().min(1).max(3),
    /** Flash starts this close together (ms) are one flash: one strike lighting both the storm
     *  light and the Stormvoël's darkness counts once. */
    flashMergeMs: nonNeg,
  }),
  /** v1.2 (D-033): light presets of the weekday layouts and bonus maps, drawn with tints and
   *  flat haze rectangles over the existing art (no new textures). Keyed by preset id. */
  lights: z.record(id, LightSchema),
  audio: obj({
    /** Master gain at full volume (headroom so the synth and recordings never clip). */
    masterLevel: fraction,
    /** M10 music (art bible §10): stem crossfade, biome fade, how long a stem holds before
     *  the music falls back to a calmer one, and the Frenzy multiplier that brings in "build". */
    crossfadeMs: pos,
    biomeFadeMs: pos,
    stemHoldMs: nonNeg,
    buildAtFrenzy: pos,
    /** Music ducks by duckDb under an Oupa bark (bible: −6 dB), with attack and release. */
    duckDb: z.number().max(0),
    duckAttackMs: pos,
    duckReleaseMs: pos,
    /** At most one bark per barkGapMs (bible: 6 s; the BarkDirector keeps it, D-028), never while
     *  the tally counts up. */
    barkGapMs: nonNeg,
  }),
  barks: obj({
    /** Speech bubble: shown bubbleMs, faded in and out over fadeMs; text size (design px). */
    bubbleMs: pos,
    fadeMs: nonNeg,
    fontPx: pos,
    /** Shots in a row that bagged (bagStreak) or missed (missStreak). */
    bagStreak: posInt,
    missStreak: posInt,
    /** Seconds without a shot (idle), and seconds left on the clock (lastSeconds). */
    idleSeconds: pos,
    lastSeconds: pos,
    /** One entry per trigger (an enum-keyed record: every trigger is required). */
    triggers: z.record(z.enum(BARK_TRIGGERS), BarkTriggerSchema),
  }),
  capture: obj({
    /** M10 marketing capture mode (?capture=1): seed when no ?seed= is given, the slow-motion
     *  steps S cycles through, and how far before each end the auto-pan (C) turns around. */
    seed: nonNegInt,
    speeds: z.array(z.number().positive().max(1)).min(1).max(6),
    panTurnPx: nonNeg,
    /** v1.0.1 (D-028 §5): the "S slow · F freeze · C pan" hint: shown hintMs, faded over hintFadeMs. */
    hintMs: nonNeg,
    hintFadeMs: pos,
    /** Most a single frame advances the hint (ms): a long stall doesn't skip it. */
    hintMaxStepMs: pos,
    /** Its font size (design px). */
    hintPx: pos,
  }),
  assets: obj({
    /** M10: longest wait for assets/asset-index.json at boot; after it every key is a placeholder. */
    indexTimeoutMs: pos,
    /** M10: longest wait for one final file (image, atlas, sound); after it that key falls back. */
    fileTimeoutMs: pos,
    /** M10: longest wait at boot for the self-hosted fonts; after it text uses the system font. */
    fontTimeoutMs: pos,
  }),
  platform: obj({
    /** Longest wait for a portal SDK script + init; after it the game runs without the SDK. */
    sdkTimeoutMs: pos,
    /** An ad the SDK hasn't started after this long (visible time) counts as none (D-026). */
    adTimeoutMs: pos,
    /** Error reports kept or sent per page load (the rest are counted, not reported). */
    maxErrorReports: posInt,
    /** Stack frames kept per error report. */
    errorStackFrames: posInt,
    /** Longest error message kept, in characters. */
    errorMessageChars: posInt,
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
  /** v1.3: birds bagged on the Ver plane. */
  'baggedVer',
  /** v1.3: the hunt unlocked the challenge's `bonus` map for today (any bonus map if absent). */
  'bonusUnlocks',
]);
export type NotaboekMetric = z.infer<typeof NotaboekMetricSchema>;

const notaboekRewardSchema = z.discriminatedUnion('type', [
  /** Unlocks a primary weapon (weapons.json unlock {type: challenge} must point back here). */
  obj({ type: z.literal('weapon'), id }),
  /** Completes a biome's Bird Book page (a badge on the page). */
  obj({ type: z.literal('birdBookPage'), biome: id }),
  /** A tick in the Notaboek only. */
  obj({ type: z.literal('none') }),
  /** v1.3: unlocks a rifle sight (weapons.json sights unlock {type: challenge} points back here). */
  obj({ type: z.literal('sight'), id }),
  /** Adds a charm to the Season Run pool (GDD §13.6: unlocks widen the pool, never add power). */
  obj({ type: z.literal('charm'), id }),
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
        /** v1.3, bonusUnlocks only: the bonus map whose unlock counts. */
        bonus: BonusMapIdSchema.optional(),
        /** Only hunts in these modes count (default: every mode). */
        modes: z.array(z.enum(['classic', 'daily', 'seasonHunt', 'ftue'])).optional(),
        reward: notaboekRewardSchema,
      }),
    )
    .min(1),
});
export type Notaboek = z.infer<typeof NotaboekSchema>;
export type NotaboekChallenge = Notaboek['challenges'][number];

// ---------------------------------------------------------------------------------------------
// meta/daily.json — Daily Hunt meta (GDD §12, §15; Tech §12). Outside the sim ContentBundle and
// its contentHash (like notaboek.json): it never changes a hunt or a daily seed.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dates look like YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    if (y === undefined || m === undefined || d === undefined) return false;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return days !== undefined && d >= 1 && d <= days;
  }, 'not a calendar date');

export const DailyMetaSchema = obj({
  version,
  /** UTC day of Daily #1 — the only copy (content:validate checks src/ and tools/, D-028). */
  epoch: isoDate,
  /** True until a person sets the real launch date: `npm run release` warns, `--strict` fails. */
  epochPlaceholder: z.boolean(),
  /** Pre-launch check: a placeholder epoch more than this many days before the build date. */
  epochMaxAgeDays: posInt,
  /** Day n plays rotation[n mod length] (filtered to playable biomes; Tech §12). */
  biomeRotation: z.array(id).min(1),
  /** Recent days kept in the save. */
  historyDays: posInt.max(400), // ≤ the save's history cap (saveSchema)
  /** ISO weeks whose freeze use is remembered (older weeks can't matter any more). */
  freezeWeeksKept: posInt.max(60), // ≤ the save's freezesUsed cap (saveSchema)
  /** Streak lengths that award a cosmetic (GDD §15: cosmetics only). */
  streakMilestones: z.array(obj({ days: posInt, cosmetic: id })),
  /** Share-card emoji grid: hunt cut into `segments`; accuracy ≥ green → 🟩, ≥ yellow → 🟨. */
  grid: obj({ segments: posInt.max(10), green: fraction, yellow: fraction }).refine(
    (g) => g.yellow <= g.green,
    'grid.yellow must be <= grid.green',
  ),
  /** Challenge links (Tech §12): longest `c` parameter decoded, longest `by` name kept. */
  challenge: obj({ maxLinkChars: posInt, maxByChars: posInt.max(64) }),
});
export type DailyMeta = z.infer<typeof DailyMetaSchema>;
