// v1.7c (D-047): the hanging and fallen fruit as their own sprites. tools/art draws each fruit,
// pod or flower into a per-biome sheet (`fruit/<biome>`) instead of baking it into the tree art,
// and writes where each one sits (fruitSpots.ts, generated). FruitView swings and drops them when
// shots land near them. View-only: the sim never knows they exist.

/** How a fruit moves when hit: hangs from a stalk, stands on one (flower spikes), lies on the ground. */
export const FRUIT_MOTIONS = ['hang', 'stand', 'ground'] as const;
export type FruitMotion = (typeof FRUIT_MOTIONS)[number];

export interface FruitSpot {
  /** Species (e.g. `sausage`, `baobab_pod`, `nara`): hooks and docs only. */
  readonly species: string;
  readonly motion: FruitMotion;
  /** A layer id (art on the layer) or a prop asset key (art on every prop with that asset). */
  readonly on: string;
  readonly prop: boolean;
  /** The pivot (a stalk's top, a spike's foot, a lying fruit's base): layer px, or px from the
   *  prop's position. */
  readonly x: number;
  readonly y: number;
  /** Design y of the ground under it, in the same space (where a dropped fruit lands). */
  readonly ground: number;
  /** The frame in the sheet (texture px = design px) and the pivot inside it. */
  readonly fx: number;
  readonly fy: number;
  readonly fw: number;
  readonly fh: number;
  readonly ox: number;
  readonly oy: number;
}

/** Every biome's fruit sheet has this size (texture px = design px; the placeholder's too). */
export const FRUIT_SHEET = { width: 512, height: 256 } as const;

/** The texture key of a biome's fruit sheet. */
export function fruitSheetKey(biome: string): string {
  return `fruit/${biome}`;
}
