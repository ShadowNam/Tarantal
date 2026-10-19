// Viewport-independent camera and plane geometry (Tech §3.3). This is the ONLY place the tap →
// plane-position formula lives; the Phaser layer and the sim both call it. The device's viewport
// width never enters: a fire command carries dx from the screen centre, not an absolute x.
import { CAMERA_MAX_X, CAMERA_MIN_X, HALF_REFERENCE_WIDTH } from './world';

/** Quantise to 0.5 design px (commands and replays store values at this resolution). */
export function quantiseHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Camera centre after quantising and clamping to [960, 960 + R]. */
export function clampCameraX(cx: number): number {
  return Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, quantiseHalf(cx)));
}

/** Plane x under the screen centre for camera centre cx on a layer with scroll factor f. */
export function planeCentreX(cx: number, scrollFactor: number): number {
  return (cx - HALF_REFERENCE_WIDTH) * scrollFactor + HALF_REFERENCE_WIDTH;
}

export interface PlanePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Tap → plane position: planeX = (cx − 960) × f + 960 + dx, planeY = sy.
 * dx = design px from the screen centre, sy = design px from the top.
 */
export function tapToPlane(cx: number, scrollFactor: number, dx: number, sy: number): PlanePoint {
  return { x: planeCentreX(cx, scrollFactor) + dx, y: sy };
}

/** Inverse of tapToPlane in x: the dx from the screen centre at which planeX appears. */
export function planeToDx(cx: number, scrollFactor: number, planeX: number): number {
  return planeX - planeCentreX(cx, scrollFactor);
}
