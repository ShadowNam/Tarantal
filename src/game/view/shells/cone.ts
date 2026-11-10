// v1.19 (D-084): the Dragon's Breath cone's shape on screen (pure, design px). From the muzzle
// toward the aim point; a big cone reaches about to the aim (at most BIG_MAX px) and fans out
// to HALF_ANGLE; a small one (refused by the flash budget, or "reduce flashes") is shorter and
// narrower. Never a full-screen flash: the cone's area stays a fraction of the screen.

export interface ConeShape {
  /** Muzzle. */
  readonly x: number;
  readonly y: number;
  /** The far end on the axis. */
  readonly tipX: number;
  readonly tipY: number;
  readonly len: number;
  /** Half the width at the far end. */
  readonly half: number;
  /** Half the width at the muzzle. */
  readonly root: number;
  /** Unit normal to the axis. */
  readonly nx: number;
  readonly ny: number;
}

export const BIG_MAX = 760;
export const BIG_MIN = 320;
export const SMALL_MUL = 0.55;
const HALF_ANGLE = 0.32;

export function coneShape(
  muzzle: { readonly x: number; readonly y: number },
  aim: { readonly x: number; readonly y: number },
  big: boolean,
): ConeShape {
  let dx = aim.x - muzzle.x;
  let dy = aim.y - muzzle.y;
  let d = Math.hypot(dx, dy);
  if (d < 1) {
    dx = 0;
    dy = -1;
    d = 1;
  }
  const ux = dx / d;
  const uy = dy / d;
  const full = Math.min(BIG_MAX, Math.max(BIG_MIN, d * 0.95));
  const len = big ? full : full * SMALL_MUL;
  const half = len * Math.tan(big ? HALF_ANGLE : HALF_ANGLE * 0.7);
  return {
    x: muzzle.x,
    y: muzzle.y,
    tipX: muzzle.x + ux * len,
    tipY: muzzle.y + uy * len,
    len,
    half,
    root: big ? 10 : 6,
    nx: -uy,
    ny: ux,
  };
}

/** The cone's area (design px²): the tests keep it a small share of the 1920 × 1080 screen. */
export function coneArea(c: ConeShape): number {
  return c.len * (c.half + c.root);
}
