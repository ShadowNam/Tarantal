// v1.7c (D-047): which shots reach a fruit. Pure. A pellet lands on a fruit's layer at the plane
// point its screen position maps to (planeX = (cx − 960) × scrollFactor + 960 + dx); it hits the
// fruit inside the fruit's frame (grown by hitPadPx) and is a near miss within nearMissPx more.
// A pellet the sim stopped on something in front of the fruit's layer (a bird on that layer or a
// nearer one, or a nearer prop) never reaches it. The sim's own hit test is untouched: fruit only
// react, they never take a pellet from a bird.
import { tapToPlane } from '../../../sim/camera';
import type { WindView } from '../../../sim/types';
import type { FruitTuning, ShotOnFruit } from './fruitMotion';
import type { FruitSpot } from './fruitTypes';

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

/** One pellet's impact as the fruit see it (from a pelletImpact event). */
export interface Impact {
  /** Screen position as in the event (a pellet that flew to the far plane carries its drift). */
  readonly dx: number;
  readonly sy: number;
  /** Kettie stones: the camera centre they were fired at. */
  readonly cx?: number;
  readonly stop: PelletStop | null;
}

/** What maps a shot's impacts onto a layer. */
export interface ShotFrame {
  /** The camera centre when the shot resolved (stones carry their own). */
  readonly camX: number;
  /** The shot's wind drift (screen px), added by the sim to pellets that landed far. */
  readonly drift: number;
  /** The far plane's scroll factor: pellets at or behind it drift (Tech §3.4). */
  readonly farFactor: number;
}

/**
 * The sim's wind drift for a shot: driftPxAtFar × strength × dir × the gun's wind sensitivity ×
 * the charms' windDriftMul (src/sim/omen/wind.ts windDriftPx, Sim.ts shotDrift). 0 without wind.
 */
export function shotDriftPx(
  wind: WindView | null,
  driftPxAtFar: number,
  windSensitivity: number,
  windDriftMul: number,
): number {
  if (wind === null) return 0;
  return driftPxAtFar * wind.strength * wind.dir * windSensitivity * windDriftMul;
}

/**
 * A shot's pellets on a layer with scroll factor `factor`: those the sim stopped in front of it
 * are left out; a pellet whose event carries the wind drift (it flew on, or stopped at or behind
 * the far plane) passed a nearer layer before it drifted, so the drift comes off there, as in the
 * sim's own hit test (it drifts only at the far plane and behind).
 */
export function pelletsOnLayer(
  impacts: readonly Impact[],
  factor: number,
  f: ShotFrame,
): LayerPellet[] {
  const out: LayerPellet[] = [];
  for (const e of impacts) {
    if (blocked(e.stop, factor)) continue;
    const drifted = e.stop === null || e.stop.factor <= f.farFactor;
    const dx = drifted && factor > f.farFactor ? e.dx - f.drift : e.dx;
    out.push(pelletOnLayer(e.cx ?? f.camX, factor, dx, e.sy));
  }
  return out;
}

/**
 * How a shot's pellets on its layer reach a fruit posed with its body's pivot at `pivot`, turned
 * by `angle`: the pellets are turned back into the fruit's own frame (a swinging fruit is hit
 * where it is drawn), then matched against the frame grown by hitPadPx.
 */
export function fruitShot(
  frame: { readonly fw: number; readonly fh: number; readonly ox: number; readonly oy: number },
  pivot: LayerPellet,
  angle: number,
  pellets: readonly LayerPellet[],
  tick: number,
  t: FruitTuning,
): ShotOnFruit {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const local = pellets.map((p) => {
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
  });
  const box = { left: pivot.x - frame.ox, top: pivot.y - frame.oy, w: frame.fw, h: frame.fh };
  return shotOnFruit(box, local, tick, t);
}

/**
 * 1.9.4 (review F1): where to aim at a fruit posed with its body's pivot at `pivot`, turned by
 * `angle`: the middle of its drawn frame (low in a hanging frame that holds its own stalk, high on
 * a flower spike), turned with the swing. The same frame is the hit area fruitShot() tests, so the
 * aim point always lies inside it.
 */
export function fruitAim(
  spot: Pick<FruitSpot, 'motion' | 'stalk' | 'fw' | 'fh' | 'ox' | 'oy'>,
  pivot: LayerPellet,
  angle: number,
): LayerPellet {
  const down =
    spot.motion === 'hang' && spot.stalk === null ? 0.72 : spot.motion === 'stand' ? 0.3 : 0.5;
  const x = pivot.x - spot.ox + spot.fw / 2;
  const y = pivot.y - spot.oy + spot.fh * down;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - pivot.x;
  const dy = y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}
