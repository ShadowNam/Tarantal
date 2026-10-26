// v1.7c (D-047): which shots reach a fruit. Pure. A pellet lands on a fruit's layer at the plane
// point its screen position maps to (planeX = (cx − 960) × scrollFactor + 960 + dx); it hits the
// fruit inside the fruit's frame (grown by hitPadPx) and is a near miss within nearMissPx more.
// A pellet the sim stopped on something in front of the fruit's layer (a bird on that layer or a
// nearer one, or a nearer prop) never reaches it. The sim's own hit test is untouched: fruit only
// react, they never take a pellet from a bird.
import { tapToPlane } from '../../../sim/camera';
import type { FruitTuning, ShotOnFruit } from './fruitMotion';

/** A fruit's box on its layer (layer px). */
export interface FruitBox {
  readonly left: number;
  readonly top: number;
  readonly w: number;
  readonly h: number;
}

/** One pellet of a shot, already mapped to a layer. */
export interface LayerPellet {
  readonly x: number;
  readonly y: number;
}

/** Where a pellet stopped, as far as fruit care: the scroll factor of the thing, and whether it
 *  was a creature (drawn above the layers of its plane). Null: it flew on. */
export interface PelletStop {
  readonly factor: number;
  readonly creature: boolean;
}

/** True when the pellet stopped in front of a fruit on a layer with `factor`. */
export function blocked(stop: PelletStop | null, factor: number): boolean {
  if (stop === null) return false;
  return stop.factor > factor + 1e-6 || (stop.creature && Math.abs(stop.factor - factor) <= 1e-6);
}

/** A pellet's point on a layer: screen (dx from the centre, sy) with the camera at cx. */
export function pelletOnLayer(cx: number, factor: number, dx: number, sy: number): LayerPellet {
  return tapToPlane(cx, factor, dx, sy);
}

/** How a shot's pellets on a layer reach one fruit. */
export function shotOnFruit(
  box: FruitBox,
  pellets: readonly LayerPellet[],
  tick: number,
  t: FruitTuning,
): ShotOnFruit {
  let hits = 0;
  let near = 0;
  let sumX = 0;
  for (const p of pellets) {
    const ox = Math.max(box.left - p.x, 0, p.x - (box.left + box.w));
    const oy = Math.max(box.top - p.y, 0, p.y - (box.top + box.h));
    const d = Math.hypot(ox, oy);
    if (d <= t.hitPadPx) hits++;
    else if (d <= t.hitPadPx + t.nearMissPx) near++;
    else continue;
    sumX += p.x;
  }
  const n = hits + near;
  const centre = box.left + box.w / 2;
  const push = n === 0 || sumX / n <= centre ? 1 : -1;
  return { tick, pellets: hits, nearMisses: near, push };
}
