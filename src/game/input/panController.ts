// Camera panning for the Phaser layer (Tech §6): drag, inertia, desktop edge pan and keys.
// Advanced once per sim tick so the result doesn't depend on the frame rate; produces the
// camera centre the InputMapper sends as a `cameraTarget` command. Pure; unit-tested.
import { clampCameraX } from '../../sim/camera';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../sim/world';
import { TICKS_PER_SECOND } from '../../sim/clock';
import type { Feel } from '../../content/schemas';

export type PanTuning = Pick<
  Feel['input'],
  | 'dragPlaneScrollFactor'
  | 'inertiaDecayPerSec'
  | 'inertiaMaxPxPerSec'
  | 'inertiaStopPxPerSec'
  | 'edgePanPxPerSec'
  | 'keyPanPxPerSec'
>;

const DT = 1 / TICKS_PER_SECOND;

export class PanController {
  private readonly tuning: PanTuning;
  private cx: number;
  private lastSent: number | null = null;
  private dragAccum = 0;
  /** Inertia velocity in camera units per second. */
  private velocity = 0;
  /** −1 / 0 / +1 from keys and the desktop screen edges. */
  private keyDir = 0;
  private edgeDir = 0;

  constructor(tuning: PanTuning, startCx: number) {
    this.tuning = tuning;
    this.cx = clampCameraX(startCx);
    this.lastSent = this.cx;
  }

  /** The camera centre as sent to the sim (quantised to 0.5). */
  get cameraX(): number {
    return clampCameraX(this.cx);
  }

  /** Finger moved by dx screen px: the drag plane's layer follows the finger. */
  drag(dxScreen: number): void {
    this.velocity = 0;
    this.dragAccum -= dxScreen / this.tuning.dragPlaneScrollFactor;
  }

  /** Finger released while dragging at vx screen px/s. */
  release(vxScreen: number): void {
    const v = -vxScreen / this.tuning.dragPlaneScrollFactor;
    const max = this.tuning.inertiaMaxPxPerSec;
    this.velocity = Math.max(-max, Math.min(max, v));
  }

  /** Stops inertia (a new touch grabs the panorama). */
  hold(): void {
    this.velocity = 0;
  }

  setKeyDirection(dir: number): void {
    this.keyDir = Math.sign(dir);
  }

  setEdgeDirection(dir: number): void {
    this.edgeDir = Math.sign(dir);
  }

  /** Advances one tick; returns the camera centre to send, or null if it didn't change. */
  tick(): number | null {
    let next = this.cx + this.dragAccum;
    this.dragAccum = 0;
    if (this.velocity !== 0) {
      next += this.velocity * DT;
      this.velocity *= Math.exp(-this.tuning.inertiaDecayPerSec * DT);
      if (Math.abs(this.velocity) < this.tuning.inertiaStopPxPerSec) this.velocity = 0;
    }
    if (this.keyDir !== 0) next += this.keyDir * this.tuning.keyPanPxPerSec * DT;
    else if (this.edgeDir !== 0) next += this.edgeDir * this.tuning.edgePanPxPerSec * DT;
    // Kept unquantised so slow pans don't lose speed to rounding; only the output is quantised.
    const inRange = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, next));
    // Stop inertia at the ends instead of pushing against the clamp.
    if (inRange !== next) this.velocity = 0;
    this.cx = inRange;
    const out = clampCameraX(inRange);
    if (this.lastSent === out) return null;
    this.lastSent = out;
    return out;
  }
}

/** Desktop edge-pan direction for a cursor at x on a screen `width` wide (GDD §18.1). */
export function edgeDirection(x: number, width: number, fraction: number): number {
  const edge = width * fraction;
  if (x < edge) return -1;
  if (x > width - edge) return 1;
  return 0;
}
