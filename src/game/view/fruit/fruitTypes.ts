// v1.7c (D-047): the hanging and fallen fruit as their own sprites. tools/art draws each fruit,
// pod or flower into a per-biome sheet (`fruit/<biome>`) instead of baking it into the tree art,
// and writes where each one sits (fruitSpots.ts, generated). FruitView swings and drops them when
// shots land near them. View-only: the sim never knows they exist.

/** How a fruit moves when hit: hangs from a stalk, stands on one (flower spikes), lies on the ground. */
export const FRUIT_MOTIONS = ['hang', 'stand', 'ground'] as const;
export type FruitMotion = (typeof FRUIT_MOTIONS)[number];

/** A frame on the sheet: its rect in texture px, its size and pivot in design px. */
export interface FruitFrame {
  readonly fx: number;
  readonly fy: number;
  readonly tw: number;
  readonly th: number;
  readonly fw: number;
  readonly fh: number;
  /** The pivot in the frame (design px from its top left). */
  readonly ox: number;
  readonly oy: number;
}

export interface FruitSpot extends FruitFrame {
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
  /** Texture px per design px of its frames (2 for prop fruit, seen close up; else 1). */
  readonly res: number;
  /** The fruit's own frame (above) hangs from (x + ax, y + ay): the end of its stalk. */
  readonly ax: number;
  readonly ay: number;
  /** The stalk, pivoting at (x, y); it stays on the tree when the fruit snaps off. */
  readonly stalk: FruitFrame | null;
  /** The trunk it hangs over (x and half its width at the foot, same space): a dropped fruit
   *  comes to rest clear of it. */
  readonly trunk: { readonly x: number; readonly half: number } | null;
}

/** Every biome's fruit sheet has this size in texture px (the placeholder's too). */
export const FRUIT_SHEET = { width: 512, height: 512 } as const;

/** The texture key of a biome's fruit sheet. */
export function fruitSheetKey(biome: string): string {
  return `fruit/${biome}`;
}
