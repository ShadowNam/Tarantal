// Karoo wind (GDD §11 omen): a direction (±1) and a strength (0..1 of the biome's effects),
// re-rolled every directionChangeSeconds. Flying birds with the wind go faster (tailwind), against
// it slower (headwind); pellets on the far plane drift downwind by driftPxAtFar × strength ×
// the weapon's windSensitivity (Tech §3.4). Randomness: rng.stream('omen').
import type { Biome } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { WindView } from '../types';

export type WindConfig = NonNullable<Biome['omen']['wind']>;

export interface Wind {
  readonly cfg: WindConfig;
  dir: 1 | -1;
  strength: number;
  ticksToChange: number;
}

function roll(w: Wind, rng: RandomStream): void {
  w.dir = rng.chance(0.5) ? 1 : -1;
  w.strength = rng.range(w.cfg.strength[0], w.cfg.strength[1]);
  w.ticksToChange = Math.max(
    1,
    secondsToTicks(rng.range(w.cfg.directionChangeSeconds[0], w.cfg.directionChangeSeconds[1])),
  );
}

export function createWind(cfg: WindConfig, rng: RandomStream): Wind {
  const w: Wind = { cfg, dir: 1, strength: 0, ticksToChange: 0 };
  roll(w, rng);
  return w;
}

/** Advances one tick; returns true when the wind changed. */
export function tickWind(w: Wind, rng: RandomStream): boolean {
  w.ticksToChange--;
  if (w.ticksToChange > 0) return false;
  roll(w, rng);
  return true;
}

/** Speed multiplier for something flying in direction `sign` (0 = not moving across). */
export function windSpeedMul(w: Wind | null, sign: number): number {
  if (w === null || sign === 0) return 1;
  const mul = Math.sign(sign) === w.dir ? w.cfg.tailwindSpeedMul : w.cfg.headwindSpeedMul;
  return 1 + (mul - 1) * w.strength;
}

/** Screen-px drift of a far-plane pellet for a weapon with this wind sensitivity. */
export function windDriftPx(w: Wind | null, windSensitivity: number): number {
  if (w === null) return 0;
  return w.cfg.driftPxAtFar * w.strength * w.dir * windSensitivity;
}

export function windView(w: Wind | null): WindView | null {
  return w === null ? null : { dir: w.dir, strength: w.strength };
}
