// The far animals (D-054, replacing faunaSprites.ts; v1.6 D-042, D-049). Each herd is one texture: a sheet of its animals'
// parts (tail, body, head with neck, an elephant's ear), drawn by tools/art/faunaSheets.ts at 2×
// to the target heights of docs/balance/perspective.md. The sheet's frame table (design px) comes
// with it in the asset index. FaunaView places every animal from the tables below and moves its
// head, tail and ears a little on sim time (faunaIdle), so a held frame holds still. Decor only:
// the sim never sees them.

export type FaunaSpecies =
  'giraffe' | 'springbok' | 'gemsbok' | 'elephant' | 'zebra' | 'wildebeest' | 'lechwe' | 'ostrich';

/** graze: head down (the giraffe browses, head up to the leaves); drink: a giraffe's splay. */
export type FaunaPose = 'graze' | 'alert' | 'walk' | 'drink';

/** m: adult (a bull, or a male ostrich); f: a cow (paler giraffe, hornless lechwe, small tusks,
 *  a grey-brown hen ostrich); y: a young one. */
export type FaunaVariant = 'm' | 'f' | 'y';

/** Parts in drawing order (back to front). */
export const FAUNA_PARTS = ['tail', 'body', 'head', 'ear'] as const;
export type FaunaPart = (typeof FAUNA_PARTS)[number];

/** One animal of a herd: design px from the herd's anchor (feet on y + dy; dy < 0 = further). */
export interface HerdAnimal {
  readonly species: FaunaSpecies;
  readonly pose: FaunaPose;
  readonly variant: FaunaVariant;
  readonly x: number;
  readonly dy: number;
  /** 1 = facing right. */
  readonly facing: 1 | -1;
  /** Display scale (≤ 1: never upscales the art); a little size spread within a herd. */
  readonly s: number;
}

export interface FaunaHerd {
  /** Texture key of the herd's sheet (one biome's group, the late group or the Ver group). */
  readonly key: string;
  readonly layer: 'far_veld' | 'ver_veld';
  readonly u: number;
  /** Design y of the herd's ground line. */
  readonly y: number;
  readonly animals: readonly HerdAnimal[];
  /** Lechwe wading: legs end in shallow water, with a soft reflection. */
  readonly wading?: boolean;
}

/** Texture px per design px of the fauna masters (Standard packs them at 1×, HD at 2×). */
export const FAUNA_MASTER = 2;
/** Standard resolution of the far animals (texture px per design px). */
export const FAUNA_RES = 1;

/** One frame of a sheet, design px: its box in the sheet, the pivot inside that box, and where
 *  the pivot sits relative to the animal's feet (facing right). */
export type FaunaFrame = readonly [
  x: number,
  y: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
  px: number,
  py: number,
];

/** A sheet's frames by name (`frameName`). */
export type FaunaFrames = Readonly<Record<string, FaunaFrame>>;

/** The frames of one look (species, pose, variant) share this stem. */
export const lookOf = (a: Pick<HerdAnimal, 'species' | 'pose' | 'variant'>): string =>
  `${a.species}.${a.pose}.${a.variant}`;

export const frameName = (look: string, part: FaunaPart): string => `${look}.${part}`;

/** Real heights (m): the shoulder for the quadrupeds, the top of the head for giraffe and
 *  ostrich (D-049: docs/balance/perspective.md draws them to these). */
export const FAUNA_M: Readonly<Record<FaunaSpecies, number>> = {
  elephant: 3.2,
  giraffe: 5.0,
  zebra: 1.35,
  wildebeest: 1.4,
  gemsbok: 1.2,
  springbok: 0.8,
  ostrich: 2.5,
  lechwe: 1.0,
};

/** A young one's height as a share of the adult's (a few months old: the herd's calves). */
export const YOUNG_SHARE: Readonly<Record<FaunaSpecies, number>> = {
  elephant: 0.42,
  giraffe: 0.45,
  zebra: 0.62,
  wildebeest: 0.58,
  gemsbok: 0.6,
  springbok: 0.62,
  ostrich: 0.55,
  lechwe: 0.6,
};

/** A hen is this share of the cock's height (ostrich), a cow of the bull's (elephant, giraffe). */
export const FEMALE_SHARE: Readonly<Record<FaunaSpecies, number>> = {
  elephant: 0.86,
  giraffe: 0.88,
  zebra: 1,
  wildebeest: 0.96,
  gemsbok: 1,
  springbok: 0.96,
  ostrich: 0.84,
  lechwe: 0.94,
};

/** Drawn height (design px) of a look on a plane where a metre is `pxPerMetre` px. */
export function lookHeight(
  species: FaunaSpecies,
  variant: FaunaVariant,
  pxPerMetre: number,
): number {
  const share =
    variant === 'y' ? YOUNG_SHARE[species] : variant === 'f' ? FEMALE_SHARE[species] : 1;
  return FAUNA_M[species] * pxPerMetre * share;
}

type Row = readonly [FaunaSpecies, FaunaPose, FaunaVariant, number, number, 1 | -1, number?];

const herd = (
  key: string,
  layer: FaunaHerd['layer'],
  u: number,
  y: number,
  rows: readonly Row[],
  extra: Partial<Pick<FaunaHerd, 'wading'>> = {},
): FaunaHerd => ({
  key,
  layer,
  u,
  y,
  ...extra,
  animals: rows.map(([species, pose, variant, x, dy, facing, s]) => ({
    species,
    pose,
    variant,
    x,
    dy,
    facing,
    s: s ?? 1,
  })),
});

const FAR = 'far_veld';

/**
 * The herds per biome (positions as in v1.6; loose groups, both facings, young ones). Feet on
 * y + dy: dy runs −8 … +8, so every animal stands on its layer's ground band.
 */
export const FAUNA_HERDS: Readonly<Record<string, readonly FaunaHerd[]>> = {
  'karoo-autumn': [
    herd('fauna/karoo_springbok_a', FAR, 0.5, 590, [
      ['springbok', 'graze', 'm', -360, 2, 1],
      ['springbok', 'alert', 'm', -250, -6, 1, 0.96],
      ['springbok', 'graze', 'f', -150, 4, -1],
      ['springbok', 'graze', 'y', -70, 6, 1],
      ['springbok', 'walk', 'm', 30, -4, 1, 0.97],
      ['springbok', 'graze', 'f', 150, 2, -1, 0.98],
      ['springbok', 'alert', 'm', 260, -8, -1, 0.94],
      ['springbok', 'alert', 'y', 345, 5, 1],
    ]),
    herd('fauna/karoo_springbok_b', FAR, 0.56, 596, [
      ['springbok', 'walk', 'm', 150, -3, 1, 0.97],
      ['springbok', 'graze', 'f', 260, 2, 1],
      ['springbok', 'alert', 'y', 330, 5, -1],
      ['springbok', 'graze', 'm', 430, -1, -1, 0.98],
    ]),
    herd('fauna/karoo_ostrich', FAR, 0.3, 588, [
      ['ostrich', 'alert', 'm', -90, -2, 1],
      ['ostrich', 'graze', 'f', 30, 4, 1],
      ['ostrich', 'walk', 'f', 140, -5, -1, 0.96],
    ]),
  ],
  'bushveld-winter': [
    herd('fauna/bushveld_giraffes_a', FAR, 0.19, 581, [
      ['giraffe', 'alert', 'm', -150, -2, 1],
      ['giraffe', 'graze', 'f', 30, 2, 1],
      ['giraffe', 'walk', 'y', 175, 5, -1],
    ]),
    herd('fauna/bushveld_giraffes_b', FAR, 0.712, 581, [
      ['giraffe', 'walk', 'f', -60, 0, 1],
      ['giraffe', 'alert', 'y', 105, 4, -1],
    ]),
    herd('fauna/bushveld_zebra', FAR, 0.5, 588, [
      ['zebra', 'graze', 'm', -300, 2, 1],
      ['zebra', 'alert', 'm', -175, -6, 1, 0.96],
      ['zebra', 'graze', 'f', -50, 5, -1],
      ['zebra', 'alert', 'y', 70, 7, 1],
      ['zebra', 'walk', 'f', 190, -3, -1, 0.97],
    ]),
    herd('fauna/bushveld_wildebeest', FAR, 0.42, 592, [
      ['wildebeest', 'graze', 'm', -340, 1, 1],
      ['wildebeest', 'alert', 'm', -215, -6, 1, 0.96],
      ['wildebeest', 'graze', 'y', -110, 5, -1],
      ['wildebeest', 'walk', 'f', -10, -2, 1, 0.97],
    ]),
    herd('fauna/bushveld_elephants', FAR, 0.86, 588, [
      ['elephant', 'graze', 'f', -140, 0, 1],
      ['elephant', 'walk', 'y', 60, 6, -1],
      ['elephant', 'alert', 'm', 250, -8, -1, 0.95],
    ]),
  ],
  'okavango-spring': [
    herd('fauna/okavango_elephants', FAR, 0.5, 592, [
      ['elephant', 'graze', 'f', -260, 0, 1],
      ['elephant', 'walk', 'y', -60, 6, 1],
      ['elephant', 'alert', 'm', 170, -6, -1, 0.95],
    ]),
    herd(
      'fauna/okavango_lechwe',
      FAR,
      0.62,
      590,
      [
        ['lechwe', 'graze', 'f', -170, 2, 1],
        ['lechwe', 'alert', 'm', -60, -5, 1, 0.96],
        ['lechwe', 'graze', 'y', 30, 6, -1],
        ['lechwe', 'walk', 'f', 120, -2, 1, 0.97],
        ['lechwe', 'alert', 'f', 220, 3, -1],
        ['lechwe', 'graze', 'm', 330, -6, -1, 0.95],
        ['lechwe', 'alert', 'y', 410, 5, 1],
        ['lechwe', 'graze', 'f', 500, 0, -1, 0.98],
      ],
      { wading: true },
    ),
    herd('fauna/okavango_zebra', FAR, 0.3, 588, [
      ['zebra', 'graze', 'm', -200, 1, 1],
      ['zebra', 'alert', 'f', -80, -5, 1, 0.96],
      ['zebra', 'graze', 'y', 30, 6, -1],
      ['zebra', 'walk', 'm', 150, -2, -1, 0.97],
    ]),
    herd('fauna/okavango_wildebeest', FAR, 0.84, 588, [
      ['wildebeest', 'alert', 'm', -130, -4, 1],
      ['wildebeest', 'graze', 'y', -10, 5, 1],
      ['wildebeest', 'graze', 'f', 110, 1, -1, 0.97],
    ]),
  ],
  'kalahari-summer': [
    herd('fauna/kalahari_springbok', FAR, 0.5, 588, [
      ['springbok', 'graze', 'm', -330, 1, 1],
      ['springbok', 'alert', 'f', -220, -6, 1, 0.96],
      ['springbok', 'graze', 'y', -130, 5, -1],
      ['springbok', 'walk', 'm', -20, -2, 1, 0.98],
      ['springbok', 'graze', 'f', 100, 3, -1],
      ['springbok', 'alert', 'm', 220, -7, -1, 0.95],
      ['springbok', 'graze', 'f', 330, 2, 1],
    ]),
    herd('fauna/kalahari_ostrich', FAR, 0.62, 586, [
      ['ostrich', 'alert', 'm', -50, -2, 1],
      ['ostrich', 'graze', 'f', 60, 3, -1],
    ]),
    herd('fauna/kalahari_wildebeest', FAR, 0.8, 590, [
      ['wildebeest', 'graze', 'm', -200, 1, 1],
      ['wildebeest', 'alert', 'm', -80, -6, 1, 0.96],
      ['wildebeest', 'graze', 'y', 30, 5, -1],
      ['wildebeest', 'walk', 'f', 150, -2, -1, 0.97],
    ]),
  ],
  namibie: [
    // The waterhole on the Ver strip: its water is in the layer (u 0.5, about ±120 px); the
    // drinkers stand at its near edge, the others round it, at the Ver plane's target heights.
    herd('fauna/namibie_waterhole', 'ver_veld', 0.5, 561, [
      ['giraffe', 'alert', 'm', -250, -3, 1],
      ['springbok', 'alert', 'm', -190, 3, 1],
      ['giraffe', 'drink', 'f', -140, 0, 1],
      ['zebra', 'graze', 'm', -75, 4, 1],
      ['springbok', 'graze', 'y', -35, 6, 1],
      ['gemsbok', 'graze', 'm', 55, 4, -1],
      ['zebra', 'alert', 'f', 120, -2, -1, 0.97],
      ['gemsbok', 'alert', 'm', 170, 1, -1],
      ['springbok', 'walk', 'f', 220, 3, -1],
      ['ostrich', 'walk', 'm', 268, -3, -1],
      ['ostrich', 'alert', 'f', 305, 1, -1],
    ]),
    herd('fauna/namibie_gemsbok', FAR, 0.62, 604, [
      ['gemsbok', 'graze', 'm', -220, 1, 1],
      ['gemsbok', 'alert', 'm', -95, -5, 1, 0.96],
      ['gemsbok', 'graze', 'y', 25, 5, -1],
      ['gemsbok', 'walk', 'm', 150, -2, -1, 0.97],
    ]),
    herd('fauna/namibie_ostrich', FAR, 0.24, 600, [
      ['ostrich', 'alert', 'm', -50, -2, 1],
      ['ostrich', 'graze', 'f', 60, 3, -1],
    ]),
    herd('fauna/namibie_zebra', FAR, 0.86, 606, [
      ['zebra', 'graze', 'm', -200, 1, 1],
      ['zebra', 'alert', 'f', -80, -5, 1, 0.96],
      ['zebra', 'graze', 'y', 30, 6, -1],
      ['zebra', 'walk', 'm', 150, -2, -1, 0.97],
    ]),
  ],
};

/** The distinct looks of a herd (one set of frames each in its sheet), in first-seen order. */
export function herdLooks(h: FaunaHerd): string[] {
  return [...new Set(h.animals.map(lookOf))];
}

/** Where an animal's part goes, design px relative to the herd anchor, and its scale/flip. */
export interface PartPlace {
  readonly x: number;
  readonly y: number;
  /** Signed x scale (−s when facing left: mirrored about the pivot). */
  readonly sx: number;
  readonly sy: number;
}

/** A part's pivot placed for an animal (pure): mirrored with its facing, scaled by s. */
export function placePart(a: HerdAnimal, f: FaunaFrame): PartPlace {
  const [, , , , , , px, py] = f;
  return { x: a.x + a.facing * a.s * px, y: a.dy + a.s * py, sx: a.facing * a.s, sy: a.s };
}

/** Animals back to front (further first; ties left to right): the order FaunaView draws them. */
export function drawOrder(animals: readonly HerdAnimal[]): HerdAnimal[] {
  return [...animals].sort((a, b) => a.dy - b.dy || a.x - b.x);
}

/** Idle motion tunables (content/client/feel.json → fauna.idle). */
export interface FaunaIdleTuning {
  /** Grazing: a bite (head dips and comes back) every few seconds, degrees. */
  readonly grazeDeg: number;
  readonly grazeEverySec: number;
  readonly grazeSec: number;
  /** Head up: a small ear flick / head turn every few seconds, degrees. */
  readonly alertDeg: number;
  readonly alertEverySec: number;
  readonly alertSec: number;
  /** Walking in place is still; a slight nod, degrees and period. */
  readonly walkDeg: number;
  readonly walkSec: number;
  /** A tail swish every few seconds, degrees and length. */
  readonly tailDeg: number;
  readonly tailEverySec: number;
  readonly tailSec: number;
  /** An elephant's ear fan: how far it folds in (share of its width) and its period. */
  readonly earFold: number;
  readonly earSec: number;
  /** An elephant's trunk and a giraffe's browsing head: a slow sway, degrees and period. */
  readonly swayDeg: number;
  readonly swaySec: number;
  /** Reduce motion: every amplitude × this (calmer, never off: the herd still lives). */
  readonly calm: number;
}

export interface FaunaIdle {
  /** Head rotation about the neck pivot, degrees (+ = head down for an animal facing right). */
  readonly head: number;
  /** Tail rotation about its root, degrees (+ = swung back and out). */
  readonly tail: number;
  /** Ear width as a share (1 = spread). */
  readonly ear: number;
}

/** A smooth 0 → 1 → 0 bump over [0, 1] (0 outside). */
function bump(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  const s = Math.sin(Math.PI * t);
  return s * s;
}

/** A small deterministic hash of an animal (its own rhythm in a herd). */
export function animalSeed(a: Pick<HerdAnimal, 'x' | 'dy' | 'species'>): number {
  let h = 2166136261;
  const s = `${a.species}:${Math.round(a.x)}:${Math.round(a.dy)}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** Position in an every-`every`-seconds cycle with this animal's offset (0 … 1 while active). */
function event(sec: number, every: number, length: number, seed: number): number {
  const period = every * (0.75 + 0.5 * seed);
  const t = (((sec + seed * 97) % period) + period) % period;
  return t < length ? t / length : -1;
}

/**
 * The idle motion of one animal at sim tick `tick` (pure: a held frame draws the same pose, a
 * replay the same motion). `calm` (reduce motion) scales every amplitude by tuning.calm.
 */
export function faunaIdle(
  tick: number,
  a: Pick<HerdAnimal, 'species' | 'pose' | 'x' | 'dy'>,
  t: FaunaIdleTuning,
  calm: boolean,
  ticksPerSecond: number,
): FaunaIdle {
  const k = calm ? t.calm : 1;
  const seed = animalSeed(a);
  const sec = tick / ticksPerSecond;
  let head: number;
  if (a.species === 'elephant') {
    head = Math.sin(((sec + seed * 13) / t.swaySec) * Math.PI * 2) * t.swayDeg;
  } else if (a.species === 'giraffe' && a.pose === 'graze') {
    head = Math.sin(((sec + seed * 11) / t.swaySec) * Math.PI * 2) * t.swayDeg;
  } else if (a.pose === 'graze' || a.pose === 'drink') {
    const e = event(sec, t.grazeEverySec, t.grazeSec, seed);
    // A bite: down and back, with a second, smaller dip (chewing a mouthful).
    head = e < 0 ? 0 : t.grazeDeg * (bump(e * 1.6) + 0.45 * bump((e - 0.55) * 2.2));
  } else if (a.pose === 'alert') {
    const e = event(sec, t.alertEverySec, t.alertSec, seed);
    head = e < 0 ? 0 : -t.alertDeg * Math.sin(e * Math.PI * 2) * bump(e);
  } else {
    head = Math.sin(((sec + seed * 7) / t.walkSec) * Math.PI * 2) * t.walkDeg;
  }
  const te = event(sec, t.tailEverySec, t.tailSec, (seed * 7.3) % 1);
  const tail = te < 0 ? 0 : t.tailDeg * Math.sin(te * Math.PI * 4) * bump(te);
  const ear =
    a.species === 'elephant'
      ? 1 - t.earFold * k * (0.5 + 0.5 * Math.sin(((sec + seed * 5) / t.earSec) * Math.PI * 2))
      : 1;
  return { head: head * k, tail: tail * k, ear };
}

/** e2e/dev only (`?fauna=before`): the v1.9.0 herds, one image each (3× art shown at 1×). */
export interface FaunaBefore {
  readonly key: string;
  readonly w: number;
  readonly h: number;
}

/** The v1.9.0 herd boxes (drawn px; shown 3× at a 3× master, the feet 6 px above the bottom). */
export const FAUNA_BEFORE: Readonly<Record<string, FaunaBefore>> = Object.fromEntries(
  (
    [
      ['fauna/karoo_springbok_a', 230, 40],
      ['fauna/karoo_springbok_b', 130, 40],
      ['fauna/karoo_ostrich', 120, 50],
      ['fauna/bushveld_giraffes_a', 150, 84],
      ['fauna/bushveld_giraffes_b', 110, 84],
      ['fauna/bushveld_zebra', 180, 40],
      ['fauna/bushveld_wildebeest', 140, 40],
      ['fauna/bushveld_elephants', 170, 48],
      ['fauna/okavango_elephants', 190, 50],
      ['fauna/okavango_lechwe', 220, 34],
      ['fauna/okavango_zebra', 150, 40],
      ['fauna/okavango_wildebeest', 130, 40],
      ['fauna/kalahari_springbok', 200, 36],
      ['fauna/kalahari_ostrich', 90, 50],
      ['fauna/kalahari_wildebeest', 160, 40],
      ['fauna/namibie_waterhole', 440, 84],
      ['fauna/namibie_gemsbok', 160, 40],
      ['fauna/namibie_ostrich', 90, 50],
      ['fauna/namibie_zebra', 150, 40],
    ] as const
  ).map(([key, w, h]) => [key, { key, w, h }]),
);
