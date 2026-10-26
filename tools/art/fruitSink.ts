// v1.7c (D-047): fruit, pods and flowers that react to shots are drawn as their own sprites. The
// species code hands each one to `fruit()`: outside a collection it returns the drawing (baked
// into the tree, as before: previews, far planes); inside `collectFruit()` it records the
// sprite drawing (`hi`, the detailed look, else the baked one) with its pivot and returns
// nothing, so the layer or prop comes out without it. The random stream is used exactly as
// before either way (the detailed drawings seed their own), so the rest of the art is unchanged.
import type { FruitMotion } from '../../src/game/view/fruit/fruitTypes';

/** The sprite drawing: the fruit, and the stalk it hangs from (which stays on the tree). */
export interface FruitDrawing {
  readonly body: string;
  /** Drawn from the pivot down to `attach`, where the body hangs. */
  readonly stalk?: string;
  readonly attach?: { readonly x: number; readonly y: number };
}

export interface RawFruit {
  readonly species: string;
  readonly motion: FruitMotion;
  /** Pivot in the drawing's coordinates (layer px incl. bleed, or prop px). */
  readonly x: number;
  readonly y: number;
  /** Ground y under it (where a dropped fruit lands). */
  readonly ground: number;
  /** How far the drawing may reach from the pivot (px): the render box before cropping. */
  readonly reach: number;
  /** The baked drawing (as since v1.6). */
  readonly svg: string;
  /** v1.7c review: the sprite's detailed drawing (called only while collecting). */
  readonly hi?: () => FruitDrawing;
  /** The trunk below (x, half width at the foot): a dropped fruit rests clear of it. */
  readonly trunk?: { readonly x: number; readonly half: number };
}

/** What the collector keeps: the sprite drawing resolved and placed. */
export interface CollectedFruit extends Omit<RawFruit, 'hi' | 'svg'> {
  readonly body: string;
  readonly stalk: string | null;
  readonly attach: { readonly x: number; readonly y: number } | null;
}

let sink: CollectedFruit[] | null = null;
/** The drawing's placement while inside `placedFruit` (translate, then scale). */
let frame = { x: 0, y: 0, k: 1 };

/** Records a fruit while collecting (returns ''), else returns its drawing. */
export function fruit(f: RawFruit): string {
  if (sink === null) return f.svg;
  if (f.svg === '') return '';
  const d = f.hi?.() ?? { body: f.svg };
  const { x, y, k } = frame;
  const at = (s: string): string =>
    x === 0 && y === 0 && k === 1 ? s : `<g transform="translate(${x} ${y}) scale(${k})">${s}</g>`;
  sink.push({
    species: f.species,
    motion: f.motion,
    x: x + f.x * k,
    y: y + f.y * k,
    ground: y + f.ground * k,
    reach: f.reach * k,
    body: at(d.body),
    stalk: d.stalk === undefined ? null : at(d.stalk),
    attach: d.attach === undefined ? null : { x: x + d.attach.x * k, y: y + d.attach.y * k },
    ...(f.trunk === undefined ? {} : { trunk: { x: x + f.trunk.x * k, half: f.trunk.half * k } }),
  });
  return '';
}

/**
 * Draws art that the caller places with `translate(x y) scale(k)` (a quiver tree drawn at its
 * prop size and put on a layer): fruit recorded inside get the same placement.
 */
export function placedFruit<T>(x: number, y: number, k: number, draw: () => T): T {
  const prev = frame;
  frame = { x: prev.x + x * prev.k, y: prev.y + y * prev.k, k: prev.k * k };
  try {
    return draw();
  } finally {
    frame = prev;
  }
}

/** Runs `draw` with fruit collected instead of drawn. */
export function collectFruit<T>(draw: () => T): { value: T; fruit: CollectedFruit[] } {
  const prev = sink;
  const out: CollectedFruit[] = [];
  sink = out;
  try {
    return { value: draw(), fruit: out };
  } finally {
    sink = prev;
  }
}

/** A random stream for a detailed drawing, seeded by where it is (never the layer's own). */
export function seedAt(x: number, y: number, salt = 0): () => number {
  let a = (Math.round(x * 16) * 73856093) ^ (Math.round(y * 16) * 19349663) ^ (salt * 83492791);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
