// v1.7c (D-047): fruit, pods and flowers that react to shots are drawn as their own sprites. The
// species code hands each one to `fruit()`: outside a collection it returns the drawing (baked
// into the tree, as before: previews, far planes); inside `collectFruit()` it records the
// drawing with its pivot and returns nothing, so the layer or prop comes out without it. The
// random stream is used exactly as before either way, so the rest of the art is unchanged.
import type { FruitMotion } from '../../src/game/view/fruit/fruitTypes';

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
  readonly svg: string;
}

let sink: RawFruit[] | null = null;
/** The drawing's placement while inside `placedFruit` (translate, then scale). */
let frame = { x: 0, y: 0, k: 1 };

/** Records a fruit while collecting (returns ''), else returns its drawing. */
export function fruit(f: RawFruit): string {
  if (sink === null) return f.svg;
  if (f.svg === '') return '';
  const { x, y, k } = frame;
  sink.push(
    x === 0 && y === 0 && k === 1
      ? f
      : {
          ...f,
          x: x + f.x * k,
          y: y + f.y * k,
          ground: y + f.ground * k,
          reach: f.reach * k,
          svg: `<g transform="translate(${x} ${y}) scale(${k})">${f.svg}</g>`,
        },
  );
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
export function collectFruit<T>(draw: () => T): { value: T; fruit: RawFruit[] } {
  const prev = sink;
  const out: RawFruit[] = [];
  sink = out;
  try {
    return { value: draw(), fruit: out };
  } finally {
    sink = prev;
  }
}
