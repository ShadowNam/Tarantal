// v1.6 (D-042, product owner 25 Oct): how a windpomp's head and wheel move, on sim time only (a
// held frame holds still). Pure functions, unit-tested; WindpompView applies them.
//
// Heading h in −1 … 1: 0 = the wheel faces the viewer; h > 0 = the wheel faces left (into a wind
// blowing left → right, dir +1) and the vane trails to the right; h < 0 = the opposite.
import type { WindView } from '../../sim/types';

export interface PumpMotion {
  /** Head heading (−1 … 1). */
  readonly heading: number;
  /** Wheel angle (radians). */
  readonly angle: number;
}

/** Calm days: a fixed heading (the vane trails left, over the service plank). */
export const CALM_HEADING = -0.7;
/** How far the head swings into a wind (a 3/4 view, so the wheel still reads). */
export const WIND_HEADING = 0.85;
/** Swing speed: the fraction of the way still to go left after one second is e^−rate. */
export const SWING_RATE = 1.6;
/** Wheel speed (degrees a second): a slow idle on calm days, faster with the wind's strength. */
export const IDLE_DEG_PER_SEC = 4;
export const WIND_DEG_PER_SEC = [90, 360] as const;

/** Where the head points for this wind (null = calm). */
export function targetHeading(wind: WindView | null): number {
  if (wind === null) return CALM_HEADING;
  return wind.dir > 0 ? WIND_HEADING : -WIND_HEADING;
}

/** One step of `dt` seconds of sim time (0 on a held frame: nothing moves). */
export function stepPump(m: PumpMotion, wind: WindView | null, dt: number): PumpMotion {
  if (dt <= 0) return m;
  const target = targetHeading(wind);
  const heading = target + (m.heading - target) * Math.exp(-SWING_RATE * dt);
  const deg =
    wind === null
      ? IDLE_DEG_PER_SEC
      : WIND_DEG_PER_SEC[0] + (WIND_DEG_PER_SEC[1] - WIND_DEG_PER_SEC[0]) * wind.strength;
  // The wheel turns clockwise (seen from in front), whichever way the head faces.
  const angle = (m.angle + ((deg * Math.PI) / 180) * dt) % (Math.PI * 2);
  return { heading, angle };
}

/** The wheel's horizontal squash for a heading (a disc seen from the side). */
export function wheelSquash(heading: number): number {
  return 1 - 0.62 * Math.abs(heading);
}

/** The vane's signed horizontal scale: trails left for h < 0, right for h > 0, short face-on. */
export function vaneScaleX(heading: number): number {
  const len = 0.22 + 0.78 * Math.abs(heading);
  return heading > 0 ? -len : len;
}
