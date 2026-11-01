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
/** v1.8c (D-063): `harvest` is Die Oes, the 30-s farm-field mode on its own map. */
export const ModeIdSchema = z.enum(['classic', 'daily', 'seasonHunt', 'ftue', 'range', 'harvest']);
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
  // v1.7d (D-059): hot-air balloons drifting over the Namibië sky.
  'balloons',
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
      /** D-049: the smallest hit radius (design px) of a bird body ellipse on this plane,
       *  for every input, so a bird drawn small with distance stays shootable. */
      minHitRadiusPx: nonNeg,
      lineWeightPx: pos,
    }),
  )
    .refine(
      (p) => p.ver.scrollFactor < p.far.scrollFactor && p.ver.scale < p.far.scale,
      'the ver plane sits behind the far plane (smaller scroll factor and scale)',
    )
    .refine(
      (p) => p.near.scale > p.mid.scale && p.mid.scale > p.far.scale,
      'D-049: birds get smaller with every plane back (near > mid > far > ver scale)',
    ),
  /** D-049: the plane scale that px tunings "at the mid plane" (flock spacing, speeds, radii)
   *  are written for; a plane's tunings are multiplied by its scale / this. */
  tuningRefScale: pos,
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
  /** v1.8 (D-050, GDD §11.3): Blikkies — tin cans on the fence posts. Event bonuses (× Frenzy ×
   *  Stampede), never a bag. An air hit n (1, 2, …) pays airHit + airHitStep × (min(n,
   *  chainCap) − 1); everything × the can's plane factor, rounded. */
  cans: obj({
    knockOff: posInt,
    airHit: posInt,
    airHitStep: nonNegInt,
    chainCap: posInt,
    /** "Weg!": the can left the top of the view. */
    weg: posInt,
    planeMul: allPlanes(pos),
    /** The Blikkiesdans secret: a chain this long (once a hunt), a secret found. */
    secretChain: posInt,
    secretBonus: posInt,
  }),
  /** 1.9.3 (D-056): makalani nuts, event bonuses like the cans (× Stampede only). An air hit n
   *  pays airHit + airHitStep × (min(n, chainCap) − 1); `pop` a burst nut; `weg` one juggled
   *  out of the top; all × the nut's plane factor, rounded. The secret: secretCount nuts popped
   *  or juggled out in one hunt. */
  nuts: obj({
    knockOff: posInt,
    airHit: posInt,
    airHitStep: nonNegInt,
    chainCap: posInt,
    weg: posInt,
    pop: posInt,
    planeMul: allPlanes(pos),
    secretCount: posInt,
    secretBonus: posInt,
  }),
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
  /** v1.7d (D-059): drifts instead of flying over (hot-air balloons): 1–3 of them, high in the
   *  sky (skyY: design y of the hitbox centre, above the birds' lanes), entering offViewPx
   *  beside the view on the upwind side (the layout's wind if it has one) and barely bobbing. */
  drift: obj({
    skyY: range(nonNeg),
    group: range(posInt),
    spacingPx: range(pos),
    bobPx: nonNeg,
    offViewPx: pos,
    /** A hit costs the penalty at most once per this many seconds (it never comes down). */
    hitCooldownSeconds: pos,
    /** Pellets of one shot it takes to count as a hit (a stray pellet from a shot at the birds
     *  below doesn't; a gun with fewer pellets needs them all). */
    pelletsToHit: posInt,
    barkKey: i18nKey,
  }).optional(),
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

/**
 * v1.7 (D-044): the meerkat colonies of the desert maps (GDD §11, Tech §3.12). Tuning only: where
 * the colonies sit is in the biome files. Sizes and speeds are design px at plane scale 1 (the
 * near plane), scaled by the colony's plane like a bird's hitbox; times in seconds.
 */
const meerkatActivity = obj({
  sit: nonNeg,
  sentinel: nonNeg,
  forage: nonNeg,
  sunbathe: nonNeg,
  dash: nonNeg,
  dive: nonNeg,
});
/** v1.8 (D-050): the kinds of tin can (art and size). */
export const CanTypeSchema = z.enum(['food', 'paint', 'bully', 'cooldrink']);
export type CanType = z.infer<typeof CanTypeSchema>;

/** v1.8 (D-050): the juggle body's flight (src/sim/juggle/body.ts), px at the tuning reference. */
const juggleShape = {
  gravityPxPerSec2: pos,
  /** The knock-off: upward speed; sideways speed at a hit on the can's edge (at least
   *  minSideShare of it at a hit on the centre line); spin. */
  kickUpPxPerSec: pos,
  kickSidePxPerSec: nonNeg,
  minSideShare: fraction,
  spinDegPerSec: nonNeg,
  /** Per chain step n (capped at growthCapHits): up × (1 + upGrowth × n), spin + spinGrowth × n,
   *  sideways jitter ±(jitterPxPerSec + jitterGrowth × n). */
  upGrowth: nonNeg,
  spinGrowthDegPerSec: nonNeg,
  jitterPxPerSec: nonNeg,
  jitterGrowthPxPerSec: nonNeg,
  growthCapHits: posInt,
  /** Several pellets on one can: one kick × min(1 + pelletBonus × (pellets − 1), pelletCap). */
  pelletBonus: nonNeg,
  pelletCap: z.number().min(1),
  /** Back on the ground: one bounce (vertical speed × restitution, sideways and spin ×
   *  keep), then it lies there. */
  bounce: obj({ restitution: fraction, keep: fraction }),
  /** Gone ("Weg!") once the can's top is this far above the top of the view. */
  goneMarginPx: nonNeg,
  /** From this air hit on the kick is sized to clear the top of the view: every chain ends in
   *  Weg! by this length at the latest. */
  wegChain: posInt,
};
const juggleSchema = obj(juggleShape);

/**
 * v1.8 (D-050, GDD §11.3): Blikkies. Sizes are design px at plane scale 1 (× the plane's scale,
 * the radius floored by the plane's minHitRadiusPx: cans are targets). Speeds, gravity and post
 * spacing are px at the tuning reference (× tuningRatio, D-049), so a far can flies a smaller arc
 * in the same time. The flight is the generic juggle body (src/sim/juggle/body.ts).
 */
export const CansSchema = obj({
  /** The hit capsule of each kind upright: radius and half the length of its axis. */
  types: z.record(CanTypeSchema, obj({ r: pos, half: nonNeg })),
  /** In the air a can's hit radius is × this (a tumbling can sweeps more than its outline, and a
   *  shot pattern must be able to find it: GDD §11.3); on its post and lying it is as drawn. */
  airHitMul: z.number().min(1),
  juggle: juggleSchema,
});
export type Cans = z.infer<typeof CansSchema>;

/** 1.9.3 (D-056): makalani nut colours (most ripe and glossy brown). */
export const NutColourSchema = z.enum(['brown', 'orange', 'green']);
export type NutColour = z.infer<typeof NutColourSchema>;
/** 1.9.3 (D-056): the palm groups drawn as sprites (art per plane in `planes`). */
export const PalmKindSchema = z.enum(['single', 'pair', 'trio']);
export type PalmKind = z.infer<typeof PalmKindSchema>;

/**
 * 1.9.3 (D-056, GDD §11.3b): makalani palms (Hyphaene petersiana) and their nuts. Palm shapes and
 * the nut size are design px at plane scale 1 (× the plane's scale; the nut's hit radius floored
 * by the plane's minHitRadiusPx, like every target); flight numbers are px at the tuning reference
 * (× tuningRatio). A nut is the v1.8 juggle body: it cracks off and falls (knockUpMul), is kicked
 * higher by every air hit, bounces hard once and rolls to a stop.
 */
export const MakalaniSchema = obj({
  /** A nut's radius at plane scale 1. */
  nutR: pos,
  /** In the air a nut's hit radius is × this (as the cans' airHitMul). */
  airHitMul: z.number().min(1),
  /** Nuts in a cluster (inclusive), rolled from the 'nuts' stream. */
  perCluster: range(z.number().int().min(1).max(8)),
  /** Weights of a nut's colour. */
  colours: z.record(NutColourSchema, nonNeg),
  /** This many pellets on a nut in one shot pop it (burst), as does any hit by popWeapons. */
  popPellets: z.number().int().min(2),
  popWeapons: z.array(id),
  juggle: obj({
    ...juggleShape,
    /** The crack-off: the upward kick × this (it drops off its stalk; air hits are full). */
    knockUpMul: fraction,
    /** On the ground after its bounce it rolls on: sideways speed × keep, slowing by decel. */
    roll: obj({ keep: fraction, decelPxPerSec2: pos }),
  }),
  /** Each palm group: trunks (foot dx, top dx and height from the foot) and nut clusters (from
   *  a trunk's top), in design px at plane scale 1; `planes` that have its art. */
  palms: z.record(
    PalmKindSchema,
    obj({
      planes: z.array(z.enum(['near', 'mid'])).min(1),
      trunks: z.array(obj({ dx: z.number(), topDx: z.number(), h: pos })).min(1).max(3),
      clusters: z
        .array(obj({ trunk: nonNegInt, dx: z.number(), dy: z.number() }))
        .min(1)
        .max(4),
      /** Half the group's drawn width and its height above the foot (the checks' bounds). */
      halfW: pos,
      top: pos,
    }),
  ),
});
export type Makalani = z.infer<typeof MakalaniSchema>;

export const MeerkatsSchema = obj({
  /** Hit shapes from the feet (sim position): standing tall, low (sit, dig, run) and a peeking
   *  head; mirrored by facing like a bird's. */
  hitboxes: obj({ tall: hitboxSchema, low: hitboxSchema, peek: hitboxSchema }),
  /** A pup's size against an adult's. */
  pupScale: z.number().gt(0).max(1),
  /** Chance a colony has a pup trailing its mother. */
  pupChance: fraction,
  /** Distance a pup keeps behind its mother (more than pup.minGapBodyMul body widths). */
  pupGapPx: pos,
  /** A pup: how long after its mother it comes up (hunt start; after she emerges), and how far
   *  past pupGapPx she may get before it runs after her (a share of the gap). */
  pup: obj({
    startDelaySeconds: nonNeg,
    emergeDelaySeconds: nonNeg,
    followSlack: pos,
    /** Closest a pup may be to its mother (in her body widths): outside her outline. */
    minGapBodyMul: pos,
  }),
  /** Running for a hole (a dive) is this much faster than a dash. */
  diveRunMul: z.number().min(1),
  /** Share of the family above ground when the hunt starts. */
  startOutShare: fraction,
  hiddenSeconds: range(pos),
  peekSeconds: range(pos),
  /** A peek that ends with the meerkat coming out (else it ducks again). */
  emergeChance: fraction,
  emergeSeconds: pos,
  diveSeconds: pos,
  /** Weights of what an adult does next once it is out. */
  activities: meerkatActivity,
  activitySeconds: obj({
    sit: range(pos),
    sentinel: range(pos),
    forage: range(pos),
    sunbathe: range(pos),
  }),
  /** How long the sentinel holds each head turn. */
  lookSeconds: pos,
  /** Foraging spots lie within this distance of the meerkat's burrow. */
  forageRadiusPx: pos,
  /** An adult's body width at plane scale 1 (on all fours, the sheet's art); the spacing below
   *  is in these. */
  bodyWidthPx: pos,
  /** Out of the burrow (sitting, standing, foraging, sunbathing) adults keep at least this many
   *  body widths between them. */
  spacingBodyMul: pos,
  runPxPerSec: pos,
  /** A dash: 1–4 run in a line to another burrow, stopping halfway to stand and look. */
  dash: obj({
    group: range(z.number().int().min(1).max(4)),
    /** The file's spacing, in body widths (one: nose to tail). */
    gapBodyMul: pos,
    pauseSeconds: range(pos),
  }),
  /** Layout lights (feel.json lights) early enough for sunbathing (belly to the sun). */
  sunbatheLights: z.array(id),
  /** No shot for this long: the colony is calm (the hidden come out sooner, every peek emerges). */
  calmSeconds: pos,
  /** A shot whose impact lands within radiusPx (plane px) of the colony on its plane sends it
   *  down; it comes back after returnSeconds, one head first, then the rest. */
  shotDive: obj({
    radiusPx: pos,
    returnSeconds: range(pos),
    staggerSeconds: range(nonNeg),
  }),
  /** A raptor or the crop sprayer over a colony (within radiusU of the pan): the sentinel barks
   *  and everyone dives; the nearest guineafowl flock hears it and is alerted. */
  alarm: obj({
    creatures: z.array(id).min(1),
    radiusU: z.number().gt(0).max(0.5),
    alertsNearestFlock: z.boolean(),
  }),
  /** Shooting a meerkat: never hurt; it tumbles into the nearest hole, then pops out and
   *  scolds. Points off, at most once per cooldown per colony (like the weaver nest). */
  hit: obj({
    penalty: posInt,
    cooldownSeconds: pos,
    tumbleSeconds: pos,
    scoldDelaySeconds: pos,
    scoldSeconds: pos,
    barkKey: i18nKey,
  }),
  /** The Familiefoto secret: once per hunt, the whole family out and no shot for holdSeconds
   *  while the colony is within onScreenHalfPx of the screen centre (fits a 4:3 screen). */
  familiefoto: obj({
    holdSeconds: pos,
    bonus: posInt,
    onScreenHalfPx: z.number().positive().max(720),
    rowGapPx: pos,
    lineUpSeconds: pos,
    poseSeconds: pos,
    barkKey: i18nKey,
  }),
});
export type MeerkatTuning = z.infer<typeof MeerkatsSchema>;

/** v1.7d (D-059): an ellipse hit shape (design px at plane scale 1; oy up from the feet < 0). */
const ellipseBox = obj({ rx: pos, ry: pos, ox: z.number(), oy: z.number() });

/**
 * v1.7e (D-061, GDD §11.1c): the secrets' tell animals. Sizes are the secret prop's layer px (the
 * prop is drawn 1:1 on its layer); times in seconds. Each rests, does its small action (an
 * agama's push-ups, a kingfisher's bob) every actEverySeconds for actSeconds, and after a hit
 * is gone for goneSeconds. While its secret is spent (done) it stays away.
 */
export const TellsSchema = obj({
  actEverySeconds: range(pos),
  actSeconds: pos,
  goneSeconds: range(pos),
  species: z
    .array(
      obj({
        /** Its name is the guide table's `guide.tell.<id>` (en/af/de/nl). */
        id,
        /** The hit shape round the animal's feet (oy up < 0), at scale 1. */
        hit: ellipseBox,
        /** Review R9: drawn (and hit) this many times its sheet size, so a small animal still
         *  reads at play distance (≥ ~14 screen px at 1280 px wide on the mid plane). Absent = 1. */
        scale: pos.optional(),
      }),
    )
    .min(1),
});
export type TellTuning = z.infer<typeof TellsSchema>;

/**
 * v1.7d (D-059): Namibië's ostriches (GDD §11.3c, Tech §3.12b). Non-targets like the meerkats:
 * never hurt. Sizes and speeds are design px at plane scale 1 (scaled by the family's plane);
 * times in seconds. Where the families stand is in the biome file (ostriches, per layout).
 */
export const OstrichesSchema = obj({
  /** Standing height to the top of the head (plane scale 1): the view draws to it. */
  heightPx: pos,
  hitboxes: obj({
    stand: obj({ body: ellipseBox, neck: ellipseBox }),
    sit: obj({ body: ellipseBox, neck: ellipseBox }),
    nest: ellipseBox,
  }),
  eggs: range(z.number().int().min(1).max(20)),
  walkPxPerSec: pos,
  runPxPerSec: pos,
  /** A guard's activity weights (display: the male only). */
  activities: obj({ walk: nonNeg, peck: nonNeg, look: nonNeg, stand: nonNeg, display: nonNeg }),
  activitySeconds: obj({
    peck: range(pos),
    look: range(pos),
    stand: range(pos),
    display: range(pos),
  }),
  /** How long the sitter keeps its head still before turning it. */
  sitLookSeconds: range(pos),
  /** Time between the pair's swaps on the nest. */
  swapSeconds: range(pos),
  /** How far the guard wanders from the nest (plane scale 1). */
  guardRadiusPx: pos,
  scare: obj({
    /** A pellet within radiusPx (on the family's plane, from its range) sends it running. */
    radiusPx: pos,
    runSeconds: range(pos),
    watchSeconds: range(pos),
  }),
  hit: obj({
    penalty: posInt,
    cooldownSeconds: pos,
    hissSeconds: pos,
    barkKey: i18nKey,
  }),
});
export type OstrichTuning = z.infer<typeof OstrichesSchema>;

/** v1.7d (D-059): an ostrich pair (and maybe its nest) on one layer of a map. */
export const OstrichFamilySchema = obj({
  id,
  layer: id,
  u: fraction,
  /** The ground line under their feet (design px). */
  y: z.number(),
  nest: z.boolean(),
  /** How far either side of u they roam (plane scale 1). */
  rangePx: pos,
});
export type OstrichFamily = z.infer<typeof OstrichFamilySchema>;

/** v1.8b (D-062): what a raiding baboon does at its spot (GDD §11.3d). */
export const RaidActionSchema = z.enum(['hat', 'fruit', 'tap', 'mielie', 'throw', 'moon', 'chase']);
export type RaidAction = z.infer<typeof RaidActionSchema>;

/** v1.8b (D-062): a baboon's hit shapes in one stance (design px at plane scale 1, feet at 0). */
const baboonBox = obj({ body: ellipseBox, head: ellipseBox });

/**
 * v1.8b (D-062, GDD §11.3d, Tech §3.12d): chacma baboon troops. A troop of 5–10 sits on a far
 * ridge (never a target: a hit on a mother carrying her baby costs points, any hit sends the troop
 * over the ridge); now and then the lookout barks and one or two males come down to raid a spot
 * on the mid or near plane. A raider is a target: hitsToBag shots bag it (bagged like a
 * guineafowl: the tumble and the puff). Sizes and speeds are design px at plane scale 1 (× the
 * plane's scale); times in seconds. Where troops sit and raid is in the biome file (`baboons`).
 */
export const BaboonsSchema = obj({
  /** A sitting adult male's height to the top of the head (plane scale 1): the view draws to it. */
  heightPx: pos,
  /** Mothers (with the baby on the back) and youngsters, as a share of the male's size. */
  motherScale: pos,
  juvenileScale: pos,
  hitboxes: obj({ sit: baboonBox, walk: baboonBox, stand: baboonBox }),
  troop: obj({
    /** Members, the lookout included (capped by the troop's seats). */
    size: range(z.number().int().min(5).max(10)),
    mothers: range(nonNegInt),
    juveniles: range(nonNegInt),
    /** Idle activity weights on the ridge (play: youngsters only; walk: to a free seat). */
    activities: obj({ sit: nonNeg, groom: nonNeg, look: nonNeg, play: nonNeg, walk: nonNeg }),
    activitySeconds: range(pos),
    walkPxPerSec: pos,
    /** Running over the ridge (or climbing back), and how long it stays out of sight. */
    climbSeconds: pos,
    awaySeconds: range(pos),
  }),
  raids: obj({
    /** Raids per minute on a map with a troop (× the map's raidsMul and pacing.raidsMul). */
    perMinute: nonNeg,
    firstAfterSeconds: range(pos),
    /** Each gap is 60 / rate × (1 ± gapJitter). */
    gapJitter: fraction,
    /** Chance a second raider comes along. */
    pairChance: fraction,
    /** The build-up: the lookout barks, the raider climbs down, then is on its way. */
    warnSeconds: pos,
    climbSeconds: pos,
    travelSeconds: range(pos),
    /** A raider walks in from this far beside its spot (the second one pairGapPx behind). */
    approachPx: pos,
    pairGapPx: pos,
    walkPxPerSec: pos,
    runPxPerSec: pos,
    /** How long each action takes before the raid is done. */
    actSeconds: z.record(RaidActionSchema, pos),
    /** After leaving, before it climbs back onto the ridge. */
    backSeconds: range(pos),
    /** A finished throw or chase threatens the flocks on the spot's plane within this share of
     *  the panorama. */
    alertRadiusU: fraction,
  }),
  hit: obj({
    hitsToBag: posInt,
    /** A bagged raider pays this many times a guineafowl's base on its plane (an event bonus:
     *  × Frenzy × Stampede). */
    pointsMul: pos,
    /** Bagged before its raid was done: this bonus on top. */
    stopBonus: posInt,
    tumbleSeconds: pos,
    /** A shot aimed at a mother (and her baby) that strikes her: points off, then a cooldown. */
    penalty: posInt,
    cooldownSeconds: pos,
  }),
});
export type BaboonTuning = z.infer<typeof BaboonsSchema>;

/** v1.8b (D-062): a troop on a ridge: its seats are where members sit (layer px; dx from u). */
export const TroopSchema = obj({
  id,
  layer: id,
  /** The plane whose scale sizes the troop (the ridge itself is a backdrop layer). */
  plane: PlaneIdSchema,
  u: fraction,
  seats: z.array(obj({ dx: z.number(), y: z.number() })).min(5).max(10),
  /** The lookout's seat (index into seats). */
  lookout: nonNegInt,
  /** Chance the troop is there on a hunt (absent = always; the Kalahari keeps them rare). */
  chance: fraction.optional(),
  /** A rock outcrop drawn under the troop, its base at this y (layer px), for a ridge with no high
   *  ground where the troop sits: the seats are on the rock's top (troopRock.ts). */
  rock: obj({ y: z.number() }).optional(),
});
export type Troop = z.infer<typeof TroopSchema>;

/** v1.8b (D-062): where a raid happens. With `prop`, x and y follow the prop (layouts move it). */
export const RaidSpotSchema = obj({
  id,
  action: RaidActionSchema,
  layer: id,
  prop: id.optional(),
  /** Without a prop: where along the layer (0…1). */
  u: fraction.optional(),
  ox: z.number(),
  /** The raider's ground line (design px); with a prop, relative to the prop's y. */
  y: z.number(),
  /** The side it comes in from (and leaves to). */
  from: z.union([z.literal(1), z.literal(-1)]),
});
export type RaidSpot = z.infer<typeof RaidSpotSchema>;

/**
 * v1.8c (D-063, GDD §12.2): the Harvest map's geometry. The fence with the gap stands on one
 * layer (its ground line `y`); animals come in through the gap and spread into the field rows;
 * the workers stand beside the gap (dx from the gap's centre) and never in the line of fire.
 * Layer px (the layer is drawn 1:1).
 */
export const HarvestMapSchema = obj({
  gap: obj({
    layer: id,
    plane: z.enum(['mid', 'far']),
    u: fraction,
    /** Half the opening's width (layer px). */
    halfWidthPx: pos,
    /** The fence's ground line (layer px). */
    y: z.number(),
  }),
  /** Where the workers stand while they mend the fence (dx from the gap's centre, the feet's y);
   *  `from`: the side they run in from. */
  workers: z
    .array(obj({ dx: z.number(), y: z.number(), from: z.union([z.literal(1), z.literal(-1)]) }))
    .min(2)
    .max(3),
  /** The warthogs' dig spots in the rows per plane (u along the layer, y = feet). A near spot's
   *  warthog trots in from the nearer panorama end; a mid one comes through the gap. */
  digSpots: z
    .array(obj({ plane: z.enum(['near', 'mid']), layer: id, u: fraction, y: z.number() }))
    .min(2),
  /** Feeding spots in the field for the flocks that come in through the gap (u along the plane). */
  flockSpots: z.array(obj({ plane: z.enum(['mid', 'far']), u: fraction })).min(1),
});
export type HarvestMap = z.infer<typeof HarvestMapSchema>;

export const BaboonMapSchema = obj({
  troops: z.array(TroopSchema).min(1).max(2),
  spots: z.array(RaidSpotSchema).min(1),
  /** Multiplies baboons.raids.perMinute on this map (absent = 1). */
  raidsMul: pos.optional(),
  /** v1.8c (D-063): when the first raid comes (seconds; absent = baboons.raids.firstAfterSeconds).
   *  The Harvest's 30-s rush needs its raiders early. */
  firstAfterSeconds: range(nonNeg).optional(),
});
export type BaboonMap = z.infer<typeof BaboonMapSchema>;

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
  /** v1.7 (D-044): the desert maps' meerkat colonies (behaviour and rules). */
  meerkats: MeerkatsSchema,
  /** v1.8 (D-050): the tin cans on the fence posts (shape and flight). */
  cans: CansSchema,
  /** 1.9.3 (D-056): makalani palms and their nuts (the Okavango). */
  makalani: MakalaniSchema,
  /** v1.7d (D-059): Namibië's ostriches (behaviour and rules). */
  ostriches: OstrichesSchema,
  /** v1.7e (D-061): the secrets' tell animals. */
  tells: TellsSchema,
  /** v1.8b (D-062): chacma baboon troops and their raids. */
  baboons: BaboonsSchema,
});
export type Birds = z.infer<typeof BirdsSchema>;

// ---------------------------------------------------------------------------------------------
// weapons.json

const unlockSchema = z.discriminatedUnion('type', [
  obj({ type: z.literal('start') }),
  obj({ type: z.literal('challenge'), id }),
  obj({ type: z.literal('rank'), id }),
]);

/** D-040: how big a hit mark this gun leaves on a Skietbaan plate or paper (rendering only).
 *  Unset: "pellet" for a multi-pellet gun, else "rifle" (src/game/range/rangeMarks.ts). */
export const MarkSizeSchema = z.enum(['pellet', 'rifle', 'heavy']);

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
  /** D-040: the Skietbaan hit-mark size (unset: from the pellet count). */
  markSize: MarkSizeSchema.optional(),
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
    /** D-040: the Skietbaan hit-mark size (unset: from the pellet count). */
    markSize: MarkSizeSchema.optional(),
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
              /** v1.6b Blitslaai: every reload takes this share of its time (floored, see
               *  reloadFloorMs). */
              reloadTimeMul: z.number().gt(0).max(1).optional(),
              /** v1.6b Oupa Laai: an empty gun starts its reload by itself. */
              autoReload: z.boolean().optional(),
              /** v1.6b Oupa Laai: per-shell guns top up after this long without a shot. */
              idleTopUpMs: posInt.optional(),
              /** 1.9.2 (D-055) Rooikol: a rifle aims through a red dot instead of its sight: up
               *  at once (no raise), no magnification (the view only), the sway of the sight's
               *  first step × redDotSwayMul. */
              redDot: z.boolean().optional(),
              redDotSwayMul: z.number().min(0).max(1).optional(),
              /** 1.9.2 (D-055) Rooikol: a rifle's time between shots × this (multiplies). */
              fireCooldownMul: z.number().gt(0).max(1).optional(),
            })
            .refine((e) => Object.keys(e).length > 0, 'effect needs at least one entry'),
          durationMs: posInt.optional(),
          durationShells: posInt.optional(),
          /** Season Run Padstal price; absent = never offered there. */
          padstalPrice: posInt.optional(),
          /** 1.9.2 (D-055): only for a rifle (a gun with a sight): crates hold it only when the
           *  hunt's gun has one, and the Padstal never offers it (a run's gun can change). */
          needsSight: z.boolean().optional(),
        })
        .refine((p) => p.durationMs !== undefined || p.durationShells !== undefined, {
          message: 'power-ups need durationMs or durationShells',
        })
        .refine((p) => p.padstalPrice !== undefined || p.needsSight === true, {
          message: 'power-ups need a padstalPrice unless they need a sight (D-055)',
        }),
    )
    .min(1),
  /** v1.6b: no reload (or Kettie draw) shortened by a power-up goes below this (Snelhand included). */
  reloadFloorMs: posInt,
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

/**
 * v1.7e (D-061): the secret's tell animal (the cue that replaced the hint glint): a small, unique
 * creature that always lives at the secret and does a small action every few seconds. Its feet
 * in the prop's layer px relative to the prop; `species` names one of birds.json `tells.species`.
 * A non-target: a hit costs nothing, it flees and comes back. Its hit shape never covers the
 * secret's part (tools/validate-content.ts).
 */
const secretTellSchema = obj({
  species: id,
  ox: z.number(),
  oy: z.number(),
  /** 1 = faces right (the art's way), −1 = mirrored. */
  facing: z.union([z.literal(1), z.literal(-1)]).optional(),
});

const secretSchema = z.discriminatedUnion('type', [
  obj({
    type: z.literal('multiHit'),
    parts: z.array(secretPartSchema).min(2),
    /** Parts orbit this point (relative to the prop) at degPerSec; part offsets are relative to it. */
    rotor: obj({ ox: z.number(), oy: z.number(), degPerSec: z.number() }).optional(),
    /** All parts must be hit within this many seconds of the first, or the marks reset. */
    windowSeconds: pos.optional(),
    reward: secretRewardSchema,
    tell: secretTellSchema.optional(),
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
    tell: secretTellSchema.optional(),
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
    tell: secretTellSchema.optional(),
  }).refine((s) => (s.oncePerHunt === true) !== (s.cooldownSeconds !== undefined), {
    message: 'nearMiss secrets need exactly one of oncePerHunt or cooldownSeconds',
  }),
]);

/**
 * v1.7 (D-044): a meerkat colony on a near or mid plane layer: 3–5 burrows on low sand mounds
 * (dx from the colony's u, mound height, layer px) and a family of 4–8.
 */
export const ColonySchema = obj({
  id,
  layer: id,
  u: fraction,
  /** The ground line of the mounds (design px). */
  y: z.number(),
  burrows: z.array(obj({ dx: z.number(), mound: pos })).min(3).max(5),
  family: range(z.number().int().min(4).max(8)),
});
export type Colony = z.infer<typeof ColonySchema>;

/**
 * v1.8 (D-050): a fence stretch with tin cans on its posts, on one plane of a weekday layout.
 * Posts: dx from the fence's u and height, px at the tuning reference (× tuningRatio). Each can
 * stands on a post (`post` indexes `posts`), at most one per post.
 */
export const FenceSchema = obj({
  plane: PlaneIdSchema,
  u: fraction,
  kind: z.enum(['wood', 'dropper', 'kraal']),
  posts: z.array(obj({ dx: z.number(), h: pos })).min(3).max(6),
  cans: z.array(obj({ post: nonNegInt, type: CanTypeSchema })).min(1).max(6),
});
export type Fence = z.infer<typeof FenceSchema>;

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
    /** v1.8b (D-062): multiplies the baboon raids' rate. */
    raidsMul: pos.optional(),
    /** Replaces every keyframe's flock targets. */
    flocks: somePlanes(nonNegInt).optional(),
  }).optional(),
  /** Overrides the biome twist's share of flocks that run instead of flying. */
  flushAsRunChance: fraction.optional(),
  /** Multiplies every bird's base points (rounded), e.g. dusk: fewer birds, worth more. */
  pointsMul: pos.optional(),
  /** v1.4 B (D-039): multiplies the base points of birds on these planes, on top of pointsMul
   *  (Namibië's weekday waterhole: Ver birds are plentiful there, so each is worth less). */
  planePointsMul: somePlanes(pos).optional(),
  /** v1.3 (D-036): this map opens the Ver plane (the biome's `ver` layer and lanes). Maps
   *  without it play as before: the Ver layer is left out of the map entirely. */
  ver: z.boolean().optional(),
  /** v1.7 (D-044): the map's meerkat colonies, replacing the biome's (1–2 on the desert maps). */
  colonies: z.array(ColonySchema).max(2).optional(),
  /** v1.7d (D-059): the map's ostrich pairs, replacing the biome's. */
  ostriches: z.array(OstrichFamilySchema).max(2).optional(),
  /** v1.8b (D-062): the map's baboon troops and raid spots, replacing the biome's. */
  baboons: BaboonMapSchema.optional(),
};

export const LayoutSchema = obj({
  id: WeekdayIdSchema,
  ...mapOverrideShape,
  /** v1.8 (D-050): the day's fence with its tin cans (absent = none). */
  fence: FenceSchema.optional(),
  /** 1.9.3 (D-056): a second fence further back with 1–2 cans (the Karoo's mid fence line). */
  farFence: FenceSchema.optional(),
  /** 1.9.3 (D-056): makalani palm groups (u across the plane's core; flip mirrors the group;
   *  water: it stands by water and is reflected). */
  palms: z
    .array(
      obj({
        kind: PalmKindSchema,
        plane: z.enum(['near', 'mid']),
        u: fraction,
        flip: z.boolean().optional(),
        water: z.boolean().optional(),
      }),
    )
    .max(3)
    .optional(),
  light: id,
  weather: z.enum(['calm', 'default', 'omen']),
  /** v1.10 (D-067): Reënbui always (`force`) or never (`none`) on this day; absent = the area's
   *  chance. A `calm` day never has it. */
  reenbui: z.enum(['force', 'none']).optional(),
});
export type Layout = z.infer<typeof LayoutSchema>;

export const BonusMapSchema = obj({
  id: BonusMapIdSchema,
  nameKey: i18nKey,
  ...mapOverrideShape,
  /** v1.3 (D-036): the map starts only with a rifle that has a scope fitted (a sight whose
   *  picture is `scope`); the title's button says why otherwise. */
  needsScope: z.boolean().optional(),
  /** v1.8 (D-050): where the day's fence stands on this map, by the layout's plane (absent
   *  plane = it stays where it is). */
  fencePlane: somePlanes(PlaneIdSchema).optional(),
});
export type BonusMap = z.infer<typeof BonusMapSchema>;

export const BiomeSchema = obj({
  version,
  id,
  season: id,
  nameKey: i18nKey,
  /** v1.4 B (D-039): an area pack outside the Season Run (Namibië), played in Classic from the
   *  title's area picker. It unlocks once `unlockBonus` is reached in any area; `quota` is its
   *  maps' quota (the bonus-map unlock), as a season's plain-hunt quota is for the others. */
  area: obj({ unlockBonus: BonusMapIdSchema, quota: posInt }).optional(),
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
      /** v1.7d (D-059): only on maps under these lights (layout presets). */
      lights: z.array(id).min(1).optional(),
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
    /** v1.4 B (D-039) Namibië mirage: all hunt, far and Ver birds shimmer sideways in the heat
     *  (hitboxes too, like the Kalahari haze) by hazePx × the plane's share (far 1, Ver verPx);
     *  the renderer draws the shimmering pan. No flashes. */
    mirage: obj({ hazePx: pos, verPx: nonNeg, hazePeriodSeconds: pos }).optional(),
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
  /** v1.7 (D-044): meerkat colonies (layouts may replace them; absent = none). */
  colonies: z.array(ColonySchema).max(2).optional(),
  /** v1.7d (D-059): ostrich pairs (layouts may replace them; absent = none). */
  ostriches: z.array(OstrichFamilySchema).max(2).optional(),
  /** v1.8b (D-062): baboon troops and raid spots (layouts may replace them; absent = none). */
  baboons: BaboonMapSchema.optional(),
  /** v1.8c (D-063): the Harvest map's gap, workers and dig spots (only the Harvest's biome). */
  harvest: HarvestMapSchema.optional(),
  /** v1.8 (D-050): a fence's ground line per plane (design px), for the layouts' fences. */
  fenceY: somePlanes(z.number()).optional(),
  /** 1.9.3 (D-056): the ground line makalani palms stand on, per plane (design px). */
  palmY: somePlanes(z.number()).optional(),
  /** 1.9.3 (D-056): the water line a palm by water is mirrored at, per plane (design px). */
  waterY: somePlanes(z.number()).optional(),
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
  /** v1.8 (D-050): the Blikkies target — a short fence in the screen centre at the chosen
   *  distance (posts as in a layout's fence), its ground line per plane; fresh cans stand on it
   *  respawnMs after the last one landed or left. */
  cans: obj({
    kind: z.enum(['wood', 'dropper', 'kraal']),
    posts: z.array(obj({ dx: z.number(), h: pos })).min(3).max(6),
    cans: z.array(obj({ post: nonNegInt, type: CanTypeSchema })).min(1).max(6),
    groundY: allPlanes(z.number()),
  }),
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

/**
 * v1.8c (D-063, GDD §12.2) Die Oes: the Harvest's rules. Sizes are design px at plane scale 1
 * (the view draws to them; tuningRatio converts speeds per plane); times in seconds; rates per
 * minute; crop in percent.
 */
const harvestBox = obj({ body: ellipseBox, head: ellipseBox });
const harvestSchema = modeSetupSchema.extend({
  /** The intro before the 30-s clock (the warthog family barges through the fence). A tap skips. */
  intro: obj({
    seconds: pos,
    /** When the fence breaks (fraction of the intro). */
    breakAt: fraction,
    /** Piglets in the family that barges in. */
    piglets: nonNegInt,
  }),
  /** After the clock: the gap closes, the animals still in run off (no shooting). */
  outroSeconds: pos,
  /** Warthog arrivals per minute over the 30 s (fractions of the rush, like pacing). */
  rush: obj({
    keyframes: z
      .array(
        obj({
          t: fraction,
          warthogsPerMin: nonNeg,
          /** v1.8c review: guineafowl flocks that come in through the gap per minute. */
          gapFlocksPerMin: nonNeg,
        }),
      )
      .min(2)
      .refine((k) => k.every((x, i) => i === 0 || x.t > (k[i - 1]?.t ?? -1)), 'keyframes in t order'),
    /** At most this many warthogs (adults) in the field at once. */
    maxWarthogs: posInt,
    /** A flock through the gap: its size, and no new one while this many flocks forage on the
     *  gap's plane (the biome's maxFlocks caps them all). It runs in from the gap, away from the
     *  workers' side, and settles to forage in the rows. */
    gapFlockSize: range(z.number().int().min(3)),
    maxGapFlocks: posInt,
    /** Share of the warthogs that come in on the near plane (round the fence's end). */
    nearShare: fraction,
  }),
  warthogs: obj({
    /** An adult's height (feet to the top of the back/head, plane scale 1). */
    heightPx: pos,
    hitboxes: obj({ trot: harvestBox, dig: harvestBox }),
    trotPxPerSec: pos,
    runPxPerSec: pos,
    digSeconds: range(pos),
    hitsToBag: posInt,
    /** × a guineafowl's base on its plane (an event bonus × Frenzy). */
    pointsMul: pos,
    tumbleSeconds: pos,
    /** Chance an arriving adult is a sow with piglets. */
    sowChance: fraction,
    piglets: range(nonNegInt),
    pigletScale: z.number().gt(0).max(1),
    /** Distance a piglet keeps behind the one before it (plane scale 1). */
    pigletGapPx: pos,
    /** A piglet costs this only when a shot was aimed at it (never a target). */
    pigletPenalty: posInt,
    /** Where an arrival enters, off the edge of the view (plane scale 1 px beyond the gap). */
    entryPx: pos,
  }),
  crop: obj({
    /** Drain per second per eating animal: a foraging guineafowl in the field, a digging
     *  warthog, a raider at its mielies. */
    drainPerSecond: obj({ guineafowl: nonNeg, warthog: nonNeg, baboon: nonNeg }),
    /** The HUD warns (bar flashes, a sound) below this (percent). */
    warnBelow: z.number().min(0).max(100),
    /** The crop bonus at the end: this × crop saved (percent). */
    bonusPerPercent: nonNeg,
  }),
  workers: obj({
    /** A worker's height (feet to the hat's top, plane scale 1). */
    heightPx: pos,
    hitboxes: obj({ work: harvestBox, duck: harvestBox }),
    runPxPerSec: pos,
    /** A shot aimed at a worker costs this (once per cooldown per worker). */
    penalty: posInt,
    cooldownSeconds: pos,
    duckSeconds: pos,
  }),
});
export type HarvestSetup = z.infer<typeof harvestSchema>;

export const ModesSchema = obj({
  version,
  /** Classic, Daily and FTUE setup. Season Run hunts take their length from run.json. */
  modes: obj({
    classic: modeSetupSchema,
    daily: modeSetupSchema,
    ftue: modeSetupSchema.extend({ tutorial: tutorialSchema }),
    range: rangeSchema,
    harvest: harvestSchema,
  }),
});
export type RangeSetup = z.infer<typeof rangeSchema>;
export type Modes = z.infer<typeof ModesSchema>;

// ---------------------------------------------------------------------------------------------
// feesdae.json — the special days (Feesdae, GDD §15 Feesdae, Tech §12 Feesdae, D-048). On a special's UTC
// day the Daily Hunt becomes that special: the same seed rule, its look and one twist rule. The
// date rule is an input of the mode (the game reads the clock, never the sim); the twist's
// numbers are here, so they are in the contentHash like every other rule.

const monthDay = {
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
};
/** A fixed UTC month/day, or (D-065) a list of them (New Year: 31 Dec and 1 Jan). */
const feesdagDateSchema = z.discriminatedUnion('type', [
  obj({ type: z.literal('fixed'), ...monthDay }),
  obj({ type: z.literal('days'), days: z.array(obj(monthDay)).min(1) }),
]);

/** A flyer of the Spookjag (bats, owls), in design px at plane scale 1 (scaled by its plane). */
const spookFlyerSchema = obj({
  /** Sky lanes it may cross (their skyY from the day's map, unless `skyY` sets its own band:
   *  design px, between the HUD and the horizon). */
  planes: z.array(z.enum(['mid', 'far'])).min(1),
  skyY: range(nonNeg).optional(),
  /** How many cross per hunt, and when (fractions of the hunt). */
  perHunt: range(nonNegInt),
  window: windowFraction,
  /** Flight speed (px/s at the mid plane, like birds.json speeds). */
  speed: pos,
  /** Erratic flight: up-and-down swerves of up to `swerve` px, a new one every `swerveMs`. */
  swerve: nonNeg,
  swerveMs: range(pos),
  /** Hit ellipse half-sizes. */
  rx: pos,
  ry: pos,
  /** Points when shot: positive for a bonus target, negative for a protected one. */
  points: z.number().int(),
});

const spookjagSchema = obj({
  rule: z.literal('spookjag'),
  bats: spookFlyerSchema,
  owls: spookFlyerSchema,
  /** Pumpkin lanterns stand on the ground line (groundY[0]) of their plane at a spot's u. */
  lanterns: obj({
    count: range(posInt),
    /**
     * Where lanterns may stand: on top of a prop of the day's map (its occluder's top at dx from
     * its centre; a bare pumpkin), or on their own fence post or rock at u across a plane, just
     * in front of the flock band (`front` px below groundY[1]). Prop spots are used first; spots
     * whose prop or ground line the map lacks are skipped.
     */
    spots: z
      .array(
        z.union([
          obj({ prop: id, dx: z.number(), base: z.literal('bare') }),
          obj({ plane: z.enum(['mid', 'far']), u: fraction, base: z.enum(['rock', 'post']) }),
        ]),
      )
      .min(1),
    front: nonNeg,
    /** The pumpkin's centre above its ground line (on a post or rock, and bare on a prop) and
     *  its hit ellipse (px at plane scale 1; the sheet's frames, feesdaeAssets.ts). */
    lift: nonNeg,
    liftBare: nonNeg,
    rx: pos,
    ry: pos,
    /** Paid once, when the day's last lantern goes dark. */
    allOutBonus: posInt,
  }),
});

/**
 * Christmas's twist rule, "Christmas in the sun" (D-064): wrapped presents hidden as secrets,
 * tucked in behind the day's props (under the big tree, behind a rock, at the windpomp or the
 * bakkie): partly covered, never wholly. Each opens when shot; finding them all pays once.
 */
const kersfeesSchema = obj({
  rule: z.literal('kersfees'),
  presents: obj({
    count: range(posInt),
    /**
     * Where a present may stand: at a prop of the day's map, `dx` px from its centre, its foot
     * `dy` px below the prop's position (on the line the prop's art stands on: a unit test reads
     * the art). Design px; spots whose prop the map lacks are skipped.
     */
    spots: z.array(obj({ prop: id, dx: z.number(), dy: z.number() })).min(1),
    /** The present's centre above its foot and its hit ellipse (px at plane scale 1; the
     *  sheet's frames, src/game/feesdae/christmasAssets.ts). */
    lift: nonNeg,
    rx: pos,
    ry: pos,
    /** Paid once, when the day's last present is opened ("Presents found!"). */
    allFoundBonus: posInt,
  }),
});

/**
 * D-065 New Year's twist rule, the countdown: in the hunt's last `lastSeconds` every award (bags
 * and event bonuses, never a penalty) is multiplied by `mult` ("Countdown ×2"), a system
 * multiplier after the Stampede's (they stack: GDD §5.3).
 */
const nuwejaarSchema = obj({
  rule: z.literal('nuwejaar'),
  countdown: obj({
    lastSeconds: pos,
    mult: z.number().min(1),
  }),
});

/** Bark lines are ASCII `bark.*` keys: the key is also the voice file name (see barkKey). */
const feesdagBark = z.string().regex(/^bark\.[a-z][a-z0-9_]*$/, 'bark lines are ASCII bark.* keys');

export const FeesdagSchema = obj({
  id,
  nameKey: i18nKey,
  /** The title's badge on the day ("Spookjag tonight!"). */
  badgeKey: i18nKey,
  date: feesdagDateSchema,
  /** "daily" = the day's map (biome rotation + weekday layout), or a fixed biome/layout. */
  map: z.union([z.literal('daily'), obj({ biome: id, layout: WeekdayIdSchema })]),
  /** A light preset of client/feel.json lights (the look only). */
  light: id,
  /** The day's one twist rule: Halloween's Spookjag, Christmas's hidden presents (D-064) or New
   *  Year's countdown (D-065). */
  twist: z.discriminatedUnion('rule', [spookjagSchema, kersfeesSchema, nuwejaarSchema]),
  /** Look pieces the game draws (src/game/feesdae). */
  decorations: z.array(
    z.enum([
      'moon',
      'lanterns',
      'bats',
      'cobwebs',
      'witchHats',
      // D-064 (Christmas in the sun): tinsel on the big tree, Santa hats, the heat shimmer.
      'tinsel',
      'santaHats',
      'heatHaze',
      // D-065 (New Year): stars at blue hour, fireworks on the far horizon, party hats.
      'stars',
      'fireworks',
      'partyHats',
    ]),
  ),
  /** Oupa's lines by moment (i18n keys of bark lines). Start and end on every special; the rest
   *  belong to a twist rule (crossRefs checks that a special has its rule's moments). */
  barks: obj({
    start: feesdagBark,
    bat: feesdagBark.optional(),
    owl: feesdagBark.optional(),
    lanternsOut: feesdagBark.optional(),
    /** D-064: a present opened, all of them found, a near-miss or a long dry spell. */
    present: feesdagBark.optional(),
    presentsFound: feesdagBark.optional(),
    dry: feesdagBark.optional(),
    /** D-065: the countdown started, and a big shot during it. */
    countdown: feesdagBark.optional(),
    countdownShot: feesdagBark.optional(),
    end: feesdagBark,
  }),
  /** The sting at the start (a sound of the special's own lazy group, src/game/feesdae). */
  sting: z.string().regex(/^sfx\/[a-z0-9_]+$/),
  /** The share card's frame (src/game/feesdae: its emoji and the tally's frame art). */
  shareFrame: id,
  /** D-065: the share card's year is that of the play day + this many days (New Year: 1, so 31
   *  Dec 2026 and 1 Jan 2027 both say "New Year 2027"). Default 0. */
  shareYearDays: nonNegInt.optional(),
});
export type Feesdag = z.infer<typeof FeesdagSchema>;
export type SpookjagTwist = z.infer<typeof spookjagSchema>;
export type KersfeesTwist = z.infer<typeof kersfeesSchema>;
export type NuwejaarTwist = z.infer<typeof nuwejaarSchema>;

export const FeesdaeSchema = obj({
  version,
  specials: z.array(FeesdagSchema),
});
export type Feesdae = z.infer<typeof FeesdaeSchema>;

// reenbui.json — v1.10 (D-067, GDD §11.3e): Reënbui, the first summer rain and the flying ants. A
// world event of its own (stream `reenbui`): at most once a hunt, by a chance per area; layouts
// force or forbid it. Px are design px at the mid plane (D-049: tuningRatio converts them).

export const REENBUI_PHASES = ['buildup', 'drops', 'swarm', 'easing'] as const;
export type ReenbuiPhase = (typeof REENBUI_PHASES)[number];

export const ReenbuiSchema = obj({
  version,
  /** Each phase's length (s). */
  phaseSeconds: obj({ buildup: nonNeg, drops: nonNeg, swarm: pos, easing: nonNeg }),
  /** Where the build-up may start, as fractions of the hunt; the event always ends at least
   *  endMarginSeconds before the hunt does (a later start is pulled back). */
  window: windowFraction,
  endMarginSeconds: nonNeg,
  /** The chance a hunt has it, per biome (absent biome = never). */
  areas: z.array(obj({ biome: id, chance: fraction })).min(1),
  /** Modes it can happen in (Season Run: plain and omen hunts only; never on a special day). */
  modes: z.array(ModeIdSchema).min(1),
  /** Build-up: every flock's shot alert radius × this (a little jumpier). */
  buildupAlertRadiusMul: pos,
  /** Every bag in the swarm window: this system multiplier (GDD §5.3, after the Countdown's). */
  scoreMul: pos,
  columns: obj({
    /** How many columns rise (drawn from the stream). */
    count: range(posInt),
    /** Planes they rise on (flocks forage there). */
    planes: z.array(z.enum(['mid', 'far'])).min(1),
    /** Columns stand within this of the view's centre on their plane (mid-plane px). */
    spreadPx: pos,
    /** And at least this far apart on one plane (mid-plane px). */
    minGapPx: nonNeg,
  }),
  feeding: obj({
    /** A forage/settle flock this close to a column (mid-plane px) goes to feed at it. */
    reachPx: pos,
    /** Its feeding goal is drawn this far round the column (mid-plane px). */
    spreadPx: nonNeg,
    /** A feeding flock's shot alert radius × this (calmer while it feasts). */
    alertRadiusMul: pos,
    /** Its foragers farther than this from the column (mid-plane px) hurry there at their run
     *  speed × hurrySpeedMul. */
    hurryBeyondPx: pos,
    hurrySpeedMul: pos,
  }),
  extraFlocks: obj({
    /** At most this many extra flocks run in (inside maxFlocks and maxBirdsOnScreen). */
    max: nonNegInt,
    size: range(posInt),
    /** One tries to come in this often (s) during the swarm, the first right away. */
    everySeconds: pos,
    /** They come in from this far beyond a column, on the side away from the view centre
     *  (mid-plane px). */
    fromPx: pos,
    /** They run in away from a "threat" this far behind them (mid-plane px). */
    runFromPx: pos,
  }),
});
export type Reenbui = z.infer<typeof ReenbuiSchema>;

// brakkie.json — v1.12 (D-069, GDD §11.3f): Brakkie, Oupa's Jack Russell. A sim entity on his own
// stream `dog`; never a target, never hurt. Px are near-plane design px at his scale 1 (the mid
// plane converts by plane scale, D-049), times in seconds.

const dogEllipse = obj({ ox: z.number(), oy: z.number(), rx: pos, ry: pos });
const dogHead = obj({ ox: z.number(), oy: z.number(), r: pos });
const dogHitbox = obj({ body: dogEllipse, head: dogHead });

export const BrakkieSchema = obj({
  version,
  /** Modes he comes along in (the Season Run only in `seasonKinds` hunts). */
  modes: z.array(ModeIdSchema).min(1),
  seasonKinds: z.array(z.enum(['plain', 'omen', 'boss'])),
  /** The maps he comes to, and the side of the panorama the bakkie (his home) is on. */
  areas: z.array(obj({ biome: id, homeSide: z.union([z.literal(-1), z.literal(1)]) })).min(1),
  /** His feet on the near plane (design px from the top); the mid plane: its groundY's front. */
  groundY: pos,
  /** Home: this far past the panorama's end (off every screen, LAYER_BLEED_PX + the widest view). */
  homeOffPx: pos,
  /** Standing (trot, run, sniff, sit, bark, carry, yelp) and lying (lie, dig). */
  hitboxes: obj({ stand: dogHitbox, low: dogHitbox }),
  speeds: obj({ trotPx: pos, runPx: pos, boltPx: pos }),
  /** He trots in from the bakkie this long into the hunt. */
  enterSeconds: range(nonNeg),
  roam: obj({
    /** New spots lie within this of the view's centre on his layer. */
    viewHalfPx: pos,
    /** And this far from where he stands. */
    stepPx: range(pos),
    /** Spots tried before he rests where he is. */
    tries: posInt,
    restSeconds: range(pos),
    restWeights: obj({ sniff: nonNeg, sit: nonNeg, lie: nonNeg }),
  }),
  clear: obj({
    /** Nothing a player aims at on his layer within this of a spot he stands on. */
    aimPx: pos,
    /** How often he checks that where he stands is still clear. */
    checkSeconds: pos,
    /** After a shot he holds still this long (and while a sight or fire is held). */
    holdBackSeconds: nonNeg,
    /** A gun in hand with a pellet spread over this (a crate gun like the Voorlaaier, screen px):
     *  he keeps to the bakkie while it is out. */
    wideSpreadPx: pos,
  }),
  fetch: obj({
    chance: fraction,
    planes: z.array(z.enum(['near', 'mid'])).min(1),
    /** The bird is down after this. */
    delaySeconds: nonNeg,
    /** He goes only when no live bird is within this of the spot (plane px; mid converts). */
    clearPx: pos,
    /** He waits this long for that, else gives up. */
    waitSeconds: nonNeg,
    /** Only for a bag this close to the view's centre (screen px). */
    maxDxPx: pos,
    pickupSeconds: pos,
    /** Crossing between the near and the mid plane. */
    crossSeconds: pos,
    /** At the bakkie with the bird before he comes back. */
    awaySeconds: range(pos),
  }),
  bark: obj({
    everySeconds: range(pos),
    barkSeconds: pos,
    /** The flock hears it this far into the bark. */
    threatAtSeconds: nonNeg,
    /** At a mid flock this close to him on screen (screen px). */
    maxDxPx: pos,
    /** No flock to bark at, or busy: try again after this. */
    retrySeconds: pos,
  }),
  flush: obj({
    firstSeconds: range(pos),
    everySeconds: range(pos),
    chance: fraction,
    digSeconds: pos,
    size: range(posInt),
    /** The flock bursts up within this of the view's centre (screen px). */
    maxDxPx: pos,
    retrySeconds: pos,
  }),
  hit: obj({
    /** Points off for a shot aimed at him. */
    penalty: posInt,
    /** At most once per this (the weaver nest's cooldown). */
    cooldownSeconds: pos,
    yelpSeconds: pos,
    /** Back at the bakkie this long before he comes out again. */
    awaySeconds: range(pos),
  }),
});
export type Brakkie = z.infer<typeof BrakkieSchema>;

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
  'feesdae.json': FeesdaeSchema,
  'reenbui.json': ReenbuiSchema,
  'brakkie.json': BrakkieSchema,
} as const;

export interface ContentBundle {
  readonly scoring: Scoring;
  readonly birds: Birds;
  readonly weapons: Weapons;
  readonly powerups: Powerups;
  readonly charms: Charms;
  readonly run: Run;
  readonly modes: Modes;
  /** D-048: the special days (Feesdae). */
  readonly feesdae: Feesdae;
  /** D-067: Reënbui, the first rain and the flying ants. */
  readonly reenbui: Reenbui;
  /** D-069: Brakkie, the farm dog. */
  readonly brakkie: Brakkie;
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
  // v1.6b (D-043): the first reload Oupa Laai starts by itself after a pickup.
  'oupaLaai',
  'idle',
  'flush',
  'newBest',
  'legend',
  'badHunt',
  'quotaMissed',
  'runWon',
  // v1.8 (D-050): a tin can juggled barks.canChain times in a row.
  'canChain',
  // 1.9.3 (D-056): the "Hard soos 'n makalani" secret.
  'makalani',
  // D-048: a special day's own lines (feesdae.json barks; the tuning here gives no lines).
  'feesdagStart',
  'feesdagBat',
  'feesdagOwl',
  'lanternsOut',
  'feesdagEnd',
  // D-064 (Christmas in the sun): a present opened, all found, a dry spell.
  'feesdagPresent',
  'presentsFound',
  'feesdagDry',
  // D-065 (New Year): the countdown started, a big shot during it.
  'feesdagCountdown',
  'countdownShot',
  // v1.10 (D-067): Reënbui — the first drops, the alates rising, the rain easing.
  'reenbuiRain',
  'alatesSwarm',
  'rainEased',
] as const;
export type BarkTrigger = (typeof BARK_TRIGGERS)[number];
/** D-048: triggers whose lines come from feesdae.json (their feel.json lines are empty). */
const SPECIAL_DAY_TRIGGERS: readonly string[] = [
  'feesdagStart',
  'feesdagBat',
  'feesdagOwl',
  'lanternsOut',
  'feesdagEnd',
  'feesdagPresent',
  'presentsFound',
  'feesdagDry',
  'feesdagCountdown',
  'countdownShot',
];

// ASCII only: the key is also the voice file name (audio/voice/<key>.wav), and a non-ASCII name
// changes under macOS NFD or zip normalisation, so the recording would never match.
const barkKey = z.string().regex(/^bark\.[a-z][a-z0-9_]*$/, 'bark lines are ASCII bark.* i18n keys');
const BarkTriggerSchema = obj({
  /** Highest priority wins when several triggers fire in one frame. */
  priority: nonNegInt,
  /** This trigger speaks at most once per cooldownMs (on top of the global gap). */
  cooldownMs: nonNeg,
  /** Lines said in turn: i18n keys, also the voice keys (voice/<line>). Empty only for the
   *  special-day triggers (D-048), whose lines come from feesdae.json. */
  lines: z.array(barkKey),
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
  /** Clouds on the sky layer: `count` soft clouds, each `w` wide, their base between `y` (design
   *  px), spread evenly along the sky with a fixed jitter, tinted `color`. v1.6 (D-042): drawn
   *  with the cloud sprites (src/game/view/clouds.ts) and drifting on sim time. */
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

/** D-048: how Halloween's Spookjag looks (src/game/feesdae; the look only, never a rule). */
const HALLOWEEN_LOOK = obj({
      /** The low moon on the sky layer: across it (u), its centre (design px) and size. */
      moon: obj({ u: fraction, y: z.number(), scale: pos }),
      /** Little bats flitting round the moon (sky decoration, not targets). */
      skyBats: obj({ count: nonNegInt, radius: range(pos), periodMs: range(pos) }),
      /** Share of guineafowl in witch hats (cosmetic; picked by bird id), the hat's width per
       *  head radius and its tilt back (radians). */
      hatShare: fraction,
      hat: obj({ widthPerHeadR: pos, tilt: z.number().min(-0.6).max(0.6) }),
      /** A lit lantern's warm glow: its alpha and a slow flicker (no flashes). */
      glow: obj({ alpha: fraction, flicker: z.number().min(0).max(0.5), flickerMs: pos, scale: pos }),
      /** A soft vignette over the view: its colour, alpha at the corners and the clear centre
       *  (a fraction of the half-diagonal). Steady: never a flash. */
      vignette: obj({ color: hexColor, alpha: fraction, inner: fraction }),
      /** The owl's drawing is shown this much larger than the sheet's frame (feesdae.json owls
       *  rx/ry match it), and the flight frames per second of the bats and owls. */
      owlScale: pos,
      /** Flight frames per second of the bats and owls. */
      batFps: pos,
      owlFps: pos,
      /** Cobwebs on props: the prop, the corner (fractions of its texture), mirrored, size. */
      cobwebs: z.array(obj({ prop: id, at: z.tuple([fraction, fraction]), flip: z.boolean(), scale: pos })),
      });
export type HalloweenLook = z.infer<typeof HALLOWEEN_LOOK>;

/** D-064: an [dx, dy] point relative to a prop's position (design px, the prop's own size). */
const propPoint = z.tuple([z.number(), z.number()]);

/** D-064: a tree's tinsel — garlands between two points and baubles at points. */
const tinselParts = {
  garlands: z
    .array(obj({ from: propPoint, to: propPoint, colour: z.enum(['silver', 'red']) }))
    .min(1),
  baubles: z.array(obj({ at: propPoint, colour: z.enum(['red', 'gold', 'silver']) })),
};

/** D-064: how Christmas in the sun looks (src/game/feesdae/KersfeesView.ts; the look only). */
const CHRISTMAS_LOOK = obj({
  /** Share of guineafowl in tiny Santa hats (cosmetic; picked by bird id), the hat's width per
   *  head radius and its tilt back (radians): Halloween's witch-hat anchors and sizes. */
  hatShare: fraction,
  hat: obj({ widthPerHeadR: pos, tilt: z.number().min(-0.6).max(0.6) }),
  /** Tinsel on the map's big trees (the camelthorns where the map has them, its main tree
   *  otherwise): every listed tree the day's map has gets its garlands (hung between two points)
   *  and baubles. A tree is a prop (points relative to its position) or a tree painted in a
   *  biome's layer art (`biome`, `layer`, `u` across it and a reference `y`; points relative to
   *  that). Anchors are checked against the art (tools/art/christmasSpots.test.ts). */
  tinsel: z
    .array(
      z.union([
        obj({ prop: id, ...tinselParts }),
        obj({ biome: id, layer: id, u: fraction, y: z.number(), ...tinselParts }),
      ]),
    )
    .min(1),
  /** A small glint that walks the baubles on sim time (no flash: a soft alpha swell, at most
   *  `alpha`; still and off with "reduce flashes"). */
  glint: obj({ periodSeconds: pos, alpha: fraction, scale: pos }),
  /** The heat shimmer along the horizon (the Namibië mirage strips): their strength 0 … 1. */
  heat: fraction,
  /** A present opening: the lid's hop (px at plane scale 1, seconds) and the confetti puff. */
  lidHopPx: pos,
  lidSeconds: pos,
  confettiSeconds: pos,
});
export type ChristmasLook = z.infer<typeof CHRISTMAS_LOOK>;

/** D-065: how the New Year countdown looks (src/game/feesdae/NuwejaarView.ts; the look only). */
const NEWYEAR_LOOK = obj({
  /** Share of guineafowl in small striped party hats (cosmetic; picked by bird id), the hat's
   *  width per head radius and its tilt back: the witch and Santa hats' anchors and sizes. */
  hatShare: fraction,
  hat: obj({ widthPerHeadR: pos, tilt: z.number().min(-0.6).max(0.6) }),
  /** Dusk turning to blue hour over the hunt: a wash over the sky layer (above `bottom`, design
   *  px) that grows from 0 to `alpha` between the hunt fractions `from` and `to` (sim time). */
  blueHour: obj({
    color: hexColor,
    alpha: fraction,
    bottom: pos,
    from: fraction,
    to: fraction,
    /** The rest of the scene goes to blue hour too: each listed layer's art, props and far
     *  animals take an extra tint, from white towards `ground.color` by up to `ground.layers[id]`
     *  (the far planes cooler and darker than the near), on the same ramp as the sky's wash. */
    ground: obj({ color: hexColor, layers: z.record(id, fraction) }),
  }),
  /** Stars on the sky layer, coming out from the hunt fraction `from` (full by `to`), between
   *  `y` (design px), a slow twinkle (sim time). */
  stars: obj({
    count: nonNegInt,
    y: range(nonNeg),
    alpha: fraction,
    from: fraction,
    to: fraction,
    twinkleSeconds: pos,
  }),
  /**
   * Small fireworks low over the far horizon (decoration, never targets): a burst may start in
   * each 1/maxPerSecond s slot (so never more than maxPerSecond a second), with chance perSecond
   * ÷ maxPerSecond (countdownPerSecond in the countdown), × lowTierScale on the low tier; at
   * most `pool` at a time (sprites made once). Each is `sparks` small sparks out to `radius`
   * (design px on the sky layer) over `seconds`, at most `alpha`. Reduce flashes: no bursts,
   * the sparks only twinkle where they hang, at most `twinkleAlpha` (never brighter than the sky).
   */
  fireworks: obj({
    y: range(nonNeg),
    maxPerSecond: z.number().positive().max(3),
    perSecond: pos,
    countdownPerSecond: pos,
    lowTierScale: fraction,
    pool: posInt.max(8),
    sparks: posInt.max(24),
    radius: range(pos),
    seconds: pos,
    rise: nonNeg,
    alpha: fraction,
    twinkleAlpha: fraction,
    colours: z.array(hexColor).min(1),
    /** Each spark is a short streak along its ray, `trail` design px long at its fastest
     *  (shrinking as it slows); sparks run at 55–100 % of the burst's speed. */
    trail: pos,
    /** A small bright core at the burst's centre for its first `core.until` of the burst
     *  (`core.px` across, at most `core.alpha`): local, never a flash. */
    core: obj({ px: pos, alpha: fraction, until: fraction }),
    /** From this share of the burst on, the sparks fall faster and flicker (glitter). */
    glitterFrom: fraction,
    /** Every n-th spark is white (a sparkle in each colour). */
    whiteEvery: posInt,
  }),
  /** The HUD's big countdown ("10 … 1"): its size (design px, × the large-text setting) and a
   *  short pulse on each new second (sim time). */
  countdown: obj({ fontPx: pos, pulse: z.number().min(0).max(0.5), pulseSeconds: pos }),
});
export type NewYearLook = z.infer<typeof NEWYEAR_LOOK>;

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
    /** v1.4 (D-038): mouse-wheel travel (px, lines × 33) for one variable-scope zoom step. */
    wheelZoomStepPx: pos,
  }),
  juice: obj({
    hitStopMs: nonNeg,
    hitStopTwoFliesMs: nonNeg,
    muzzleFlashMs: pos,
    gunKickPx: nonNeg,
    gunKickMs: pos,
    featherCount: range(nonNegInt),
    featherLifeMs: pos,
    /** D-049: the feather burst's size and speed per plane, × that plane's scale (so it shrinks
     *  with the birds; 1.4 / 0.9 / 0.5 at the v1.7 scales 1 / 0.5 / 0.22). */
    featherPerScale: obj({ near: pos, mid: pos, far: pos }),
    /** D-049: alarm bubbles, POOF and score pops per plane × the plane's scale (the v1.7 sizes at
     *  the v1.7 scales), never below textMinScale so far text stays readable. */
    textPerScale: obj({
      bubble: obj({ near: pos, mid: pos, far: pos }),
      poof: obj({ near: pos, mid: pos, far: pos }),
      pop: obj({ near: pos, mid: pos, far: pos }),
    }),
    textMinScale: pos,
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
    /** v1.4 B (D-039): angry sociable weavers burst out of a shot family nest (rendering only,
     *  driven by its secretPenalty event). A nest is any penalty secret with this bark. */
    weavers: obj({
      barkKey: i18nKey,
      /** Birds per burst by the nest's plane. */
      count: obj({
        near: range(posInt),
        mid: range(posInt),
        far: range(posInt),
        ver: range(posInt),
      }),
      /** Out of the holes, swirling, and back in (a hit while they are out restarts the swirl). */
      outMs: pos,
      swirlMs: pos,
      settleMs: pos,
      /** Hard cap on weaver sprites alive at once (pooled). */
      poolCap: posInt,
      /** Wingspan in design px on the near plane (scaled by the plane). */
      sizePx: pos,
      /** Share of near/mid birds that dart toward the camera once. */
      dartChance: fraction,
      /** Sim ticks per wingbeat frame. */
      flapTicks: posInt,
    }),
    /** v1.7c (D-047): fruit, pods and flowers react to shots (rendering only, from the event
     *  stream's pellet impacts; FruitView, fruitMotion.ts). */
    fruit: obj({
      /** A pellet within the fruit's frame grown by this many px hits it. */
      hitPadPx: nonNeg,
      /** A pellet this far outside the frame (px) is a near miss: a smaller swing. */
      nearMissPx: nonNeg,
      nearMissMul: fraction,
      /** Swing amplitude for one pellet (degrees), more per extra pellet, and the cap. */
      swingDeg: pos,
      perPelletDeg: nonNeg,
      maxSwingDeg: pos,
      /** Pendulum frequency, and the time until a swing has died down to 5 %. */
      swingHz: pos,
      swingSeconds: pos,
      /** Hanging and standing fruit snap off on this many pellets in one shot, or on a hit while
       *  the swing is still above this share of a one-pellet swing. */
      dropPellets: posInt,
      dropWhileSwinging: fraction,
      /** The fall: gravity, bounce (velocity kept per bounce) and bounces, sideways drift and the
       *  roll after landing. */
      gravityPxPerS2: pos,
      bounce: fraction,
      bounces: nonNegInt,
      driftPxPerS: nonNeg,
      rollPx: nonNeg,
      rollSeconds: pos,
      /** A dropped fruit rolls on until it lies at least this far (px) clear of its trunk. */
      trunkClearPx: nonNeg,
      /** Fruit on the ground: a rock (degrees) and a small roll (px) per hit. */
      rockDeg: nonNeg,
      nudgePx: nonNeg,
      /** A dropped fruit fades after lying this long (seconds), over fadeSeconds. */
      fadeAfterSeconds: pos,
      fadeSeconds: pos,
      /** The leaf puff on a hit and the dust puff on landing: lifetime and size (design px). */
      puffSeconds: pos,
      puffPx: pos,
      /** Settings → reduce motion: swings times this, and no bounce. */
      reducedMotionMul: fraction,
    }),
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
  /** v1.11 (D-068): Die Braai, the tally's night setting at Oupa's fire (GDD §8). */
  braai: obj({
    /** The top rank, or no miss with at least minBagged birds, is a perfect hunt (the vastrap). */
    perfect: obj({ minBagged: pos }),
    story: obj({
      maxLines: z.number().int().min(2).max(4),
      lineMs: pos,
      gapMs: nonNeg,
      /** The opener's bucket: this many birds or more is a big bag. */
      manyBirds: pos,
      /** Within this fraction of the area's best (and not a new best): a near miss. */
      nearRecordFrac: fraction,
    }),
    danceMs: pos,
    danceFrameMs: pos,
    fire: obj({ flameFrameMs: pos, sparkFrameMs: pos, glowPulseMs: pos, glowPulse: fraction }),
    idle: obj({ idleEveryMs: pos, poseMs: pos }),
    /** The HD sheet only while textures in use + its own ≤ budgetMiB − headroomMiB. */
    hd: obj({ budgetMiB: pos, headroomMiB: nonNeg }),
    /** The dark skyline per area id (`default` for the rest). */
    horizons: z.record(
      z.string(),
      obj({
        style: z.enum(['hills', 'dunes', 'flat', 'ridge']),
        trees: z.enum(['acacia', 'palm', 'baobab', 'none']),
      }),
    ),
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
    /** v1.4 (D-038): the variable scope's on-screen − / + buttons (touch), squares ≥ 64 px. */
    zoomButtonPx: z.number().min(64),
    /** v1.7b (D-046): power-up clarity — the pickup card, the chip's last-seconds blink and the
     *  local looks while a power-up runs. */
    powerups: obj({
      /** The pickup card stays this long (a power-up already met on this save). */
      cardMs: pos,
      /** …and this long the first time (its full explanation). */
      cardFirstMs: pos,
      /** Slide in / out. */
      cardSlideMs: pos,
      /** A chip blinks over this many last ms (steady with "reduce flashes"). */
      blinkMs: pos,
      blinkPeriodMs: pos,
      /** Boeretroos: the warm edge tint's alpha at the screen edge (fades to 0 inward). */
      slowTintAlpha: z.number().min(0).max(1),
      /** Boeretroos: effects and gun sounds play at this rate (slower and lower). */
      slowSoundRate: z.number().min(0.25).max(1),
      /** Chilli Biltong: sparks per shot at the muzzle. */
      chilliSparks: posInt,
    }),
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
    /** v1.5 (D-041): a bark whose voice line is still downloading waits up to this long, then
     *  plays if the line arrived (its caption shows at once either way). */
    barkWaitMs: nonNeg,
  }),
  barks: obj({
    /** Speech bubble: shown bubbleMs, faded in and out over fadeMs; text size (design px). */
    bubbleMs: pos,
    fadeMs: nonNeg,
    fontPx: pos,
    /** Shots in a row that bagged (bagStreak) or missed (missStreak). */
    bagStreak: posInt,
    missStreak: posInt,
    /** v1.8 (D-050): a tin can juggled this many times in a row: Oupa's canChain line. */
    canChain: posInt,
    /** D-065 (New Year): one bag worth at least this many points in the countdown is a big shot
     *  (so is a two-in-one or a whole flock): Oupa's countdownShot line. */
    countdownShotAward: posInt,
    /** Seconds without a shot (idle), and seconds left on the clock (lastSeconds). */
    idleSeconds: pos,
    lastSeconds: pos,
    /** 1.9.2 (D-055): the ten-second call is said within this many seconds of lastSeconds, or
     *  never (it skips the bark gap, so only a frame that comes late can miss it). */
    lastSecondsLateSeconds: z.number().nonnegative().max(2),
    /** One entry per trigger (an enum-keyed record: every trigger is required). */
    triggers: z.record(z.enum(BARK_TRIGGERS), BarkTriggerSchema).refine(
      (t) =>
        Object.entries(t).every(([k, v]) => SPECIAL_DAY_TRIGGERS.includes(k) || v.lines.length > 0),
      'every bark trigger but the special-day ones (D-048) needs a line',
    ),
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
  /** D-054: the far animals (src/game/view/faunaHerds.ts), drawn only. */
  fauna: obj({
    /** Drawn height per species × its true size beside the guineafowl (D-049 target; 1 = true).
     *  The product owner (27 Oct): elephants and giraffes smaller so the distance reads. The art
     *  is drawn at this size (`npm run art:interim -- --only fauna`, then assets:pack). */
    sizeMul: obj({
        elephant: pos.default(1),
        giraffe: pos.default(1),
        zebra: pos.default(1),
        wildebeest: pos.default(1),
        gemsbok: pos.default(1),
        springbok: pos.default(1),
        ostrich: pos.default(1),
        lechwe: pos.default(1),
      }),
    /** Idle motion on sim time (FaunaIdleTuning): degrees, seconds, shares. */
    idle: obj({
      grazeDeg: nonNeg,
      grazeEverySec: pos,
      grazeSec: pos,
      alertDeg: nonNeg,
      alertEverySec: pos,
      alertSec: pos,
      walkDeg: nonNeg,
      walkSec: pos,
      tailDeg: nonNeg,
      tailEverySec: pos,
      tailSec: pos,
      earFold: fraction,
      earSec: pos,
      swayDeg: nonNeg,
      swaySec: pos,
      calm: fraction,
      /** Each animal's rhythm: its period × (1 − spread/2 … 1 + spread/2), by its seed. */
      rhythmSpread: fraction,
      /** A bite's second, smaller dip (share of grazeDeg). */
      secondBite: fraction,
    }),
  }),
  assets: obj({
    /** M10: longest wait for assets/asset-index.json at boot; after it every key is a placeholder. */
    indexTimeoutMs: pos,
    /** M10: longest wait for one final file (image, atlas, sound); after it that key falls back. */
    fileTimeoutMs: pos,
    /** M10: longest wait at boot for the self-hosted fonts; after it text uses the system font. */
    fontTimeoutMs: pos,
    /** v1.6 (D-042): retries (index fetched again) before a biome's missing art is reported. */
    artRetries: z.number().int().min(0).max(10),
    /** D-053: after this long loading an area's HD pack, "Play now in Standard" appears. */
    hdOfferStandardMs: pos,
    /** D-053: longest wait for one HD file. Long: a slow file keeps loading after "Play now in
     *  Standard" and swaps in when it lands (a file that fails stays Standard at once). */
    hdFileTimeoutMs: pos,
  }),
  /** D-053: the Graphics card's recommendation (graphicsChoice.recommendGraphics). */
  graphics: obj({
    /** Below this many Mbit/s (where the browser says), Standard is recommended. */
    minDownlinkMbps: pos,
    /** Below this many GB of device memory (where known), Standard is recommended. */
    minDeviceMemoryGb: pos,
    /** At or below this many GB the HD option says it may be slow (still selectable). */
    weakDeviceMemoryGb: pos,
    /** HD is recommended only when one design px covers more than this many device px. */
    minDevicePxPerDesignPx: pos,
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
  /** D-048: how a special day looks (src/game/feesdae; the look only, never a rule). */
  feesdae: obj({
    looks: obj({
      /** D-048 Halloween's Spookjag. */
      halloween: HALLOWEEN_LOOK,
      /** D-064 Christmas in the sun. */
      christmas: CHRISTMAS_LOOK,
      /** D-065 the New Year countdown. */
      newyear: NEWYEAR_LOOK,
    }),
  }),
  /** v1.8 (D-050): how the tin cans look and sound (src/game/view/cans; the look only). */
  cans: obj({
    /** Above this spin the motion-blurred frame shows. */
    blurDegPerSec: pos,
    /** Dents kept on one can (the oldest go first). */
    maxMarks: posInt,
    /** The ground shadow fades out this far above the ground (design px at plane scale 1). */
    shadowFadePx: pos,
    /** The clink's pitch: × (1 + pitchPerChain × n), at most pitchMax. */
    pitchPerChain: nonNeg,
    pitchMax: pos,
    /** Fence wire strands, as shares of the post height from the ground. */
    wire: z.array(fraction).max(3),
  }),
  /** 1.9.3 (D-056): the makalani palms' and nuts' look and sound (art bible §4.2b). */
  makalani: obj({
    /** Frond sway: a crown turns ± swayDeg around its base, once per swayPeriodSeconds (each
     *  crown in its own phase); reduce motion × reducedSwayMul. On sim time (held frames hold). */
    swayDeg: nonNeg,
    swayPeriodSeconds: pos,
    reducedSwayMul: fraction,
    /** Reflection: alpha, how far down it reaches (a share of the palm's height, squashed into
     *  the channel), and its ripple (px at plane scale 1, period). */
    reflectAlpha: fraction,
    reflectDepth: fraction,
    rippleAmpPx: nonNeg,
    ripplePeriodSeconds: pos,
    /** The reflection's width breathes ± shimmerScale (a share) once per shimmerPeriodSeconds,
     *  about the palm's foot. */
    shimmerScale: fraction,
    shimmerPeriodSeconds: pos,
    /** Above this spin the motion-blurred nut shows. */
    blurDegPerSec: pos,
    /** Fibre bits on a crack-off, husk and ivory bits on a pop, and their flight. */
    fibreBits: posInt,
    popBits: posInt,
    bitSpeedPxPerSec: pos,
    bitGravityPxPerSec2: pos,
    bitSeconds: pos,
    /** The ground shadow fades out this far above the ground (design px at plane scale 1). */
    shadowFadePx: pos,
    /** The tok's pitch: × (1 + pitchPerChain × n), at most pitchMax. */
    pitchPerChain: nonNeg,
    pitchMax: pos,
  }),
  /** 1.9.4 (D-057): the baobab's residents (art bible §4.2c; view only, on sim time). Each one
   *  shows itself at most once per slot of slotSeconds: with probability chance (the bushbaby
   *  duskChance on dawn, dusk and golden light), for outSeconds, at a seeded point in the slot. */
  treeLife: obj({
    residents: obj({
      galago: obj({ slotSeconds: pos, chance: fraction, duskChance: fraction, outSeconds: pos }),
      squirrel: obj({ slotSeconds: pos, chance: fraction, outSeconds: pos }),
      owl: obj({ slotSeconds: pos, chance: fraction, outSeconds: pos }),
      hornbill: obj({ slotSeconds: pos, chance: fraction, outSeconds: pos }),
      buffaloWeaver: obj({ slotSeconds: pos, chance: fraction, outSeconds: pos }),
    }),
    /** A pellet this close to a resident (prop px) makes it duck back (or fly off). */
    duckRadiusPx: pos,
    /** How long ducking back (or the start of flying off) takes. */
    duckSeconds: pos,
    /** The bees at their crack: how many, how far they swirl (prop px), and how long and how
     *  much wider they swirl after a near shot. */
    bees: obj({
      count: posInt,
      radiusPx: z.tuple([pos, pos]),
      swirlHz: pos,
      scatterSeconds: pos,
      scatterMul: pos,
    }),
    /** The sociable weavers' colony life (art bible §4.3b): weavers round a family nest per
     *  plane (reduce motion: × reducedCountMul, cycles × reducedSlowMul slower); each lives
     *  cycles of cycleSeconds (insideShare of them in the nest), flights of flightSeconds. A
     *  pellet within nearShotPx of the nest (× the plane's scale) scatters them for
     *  scatterSeconds; they trickle back over trickleSeconds. */
    colony: obj({
      birds: obj({ near: nonNegInt, mid: nonNegInt, far: nonNegInt, ver: nonNegInt }),
      /** A weaver's drawn wingspan per plane (design px): about 1.3× true size against its tree,
       *  so they read at the tree's plane scale (review R4). The falcon is falconMul × that. */
      wingspanPx: obj({ near: pos, mid: pos, far: pos, ver: pos }),
      falconMul: pos,
      /** Of the cycles that aren't spent inside: perched on the roof and branches, on the ground;
       *  the rest are loops in the open sky under the nest. */
      perchShare: fraction,
      groundShare: fraction,
      reducedCountMul: fraction,
      reducedSlowMul: pos,
      cycleSeconds: z.tuple([pos, pos]),
      insideShare: fraction,
      flightSeconds: z.tuple([pos, pos]),
      nearShotPx: pos,
      scatterSeconds: pos,
      trickleSeconds: pos,
      falcon: obj({ slotSeconds: pos, chance: fraction, outSeconds: pos }),
      lovebirds: obj({ slotSeconds: pos, flySeconds: pos }),
    }),
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
  /** v1.7 (D-044): the meerkats' Familiefoto taken (the secret, on any desert map). */
  'familiefotos',
  /** v1.8 (D-050): the hunt's longest tin-can juggle (air hits in a row; scope hunt). */
  'canChain',
  /** v1.10 (D-067): birds bagged during one Reënbui's swarm (scope hunt). */
  'reenbuiBags',
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

// v1.9 (D-066) client/soundscape.json — the veld soundscape: its schema lives in ./soundscape.ts
// (only the lazy soundscape chunk and the tools load it; here it would split this module's chunk
// and grow the first download). The type is re-exported for everyone else.
export type { Soundscape } from './soundscape';
