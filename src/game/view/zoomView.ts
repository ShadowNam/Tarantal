// v1.3 (D-036): the rifle's zoom as a view. The sim holds the aim point in design px of the
// UNZOOMED screen (dx from the centre, sy from the top) plus its sway; this module turns that into
// a screen-space zoom: every world layer (and the world's screen effects) is scaled by z around a
// centre c, so an unzoomed screen point p shows at  C + (p − c) × z  (C = the screen centre).
// The world point under the reticle is the same on every screen width (Tech §3.3): the reticle
// sits where the shot's unzoomed point shows, and that point comes from the sim alone.
//
// While the sight comes up the zoom eases in from 1 and the centre slides from the screen centre
// to the aim point (so the bird you pressed on doesn't jump), and the centre is clamped so the
// zoomed view never leaves the unzoomed screen (no empty edges past the layers' bleed).

export interface ZoomState {
  /** View zoom (1 = none). */
  readonly z: number;
  /** Zoom centre in unzoomed screen design px. */
  readonly cx: number;
  readonly cy: number;
  /** Where the shot point (aim + sway) shows on screen now: the sight picture's centre. */
  readonly reticleX: number;
  readonly reticleY: number;
  /** 0..1 eased raise (the sight picture fades in with it). */
  readonly raise: number;
}

export const NO_ZOOM = (width: number, height: number): ZoomState => ({
  z: 1,
  cx: width / 2,
  cy: height / 2,
  reticleX: width / 2,
  reticleY: height / 2,
  raise: 0,
});

/** Smoothstep ease for the raise. */
export function easeRaise(p: number): number {
  const t = Math.min(1, Math.max(0, p));
  return t * t * (3 - 2 * t);
}

export interface AimInput {
  /** Sight zoom when up. */
  readonly zoom: number;
  /** 0..1 raise progress. */
  readonly progress: number;
  /** Aim point + sway: unzoomed screen dx from the centre and sy from the top. */
  readonly dx: number;
  readonly sy: number;
}

/** The zoom view for a raised (or rising) sight on a screen `width` × `height` design px. */
export function zoomFor(aim: AimInput | null, width: number, height: number): ZoomState {
  if (aim === null) return NO_ZOOM(width, height);
  const raise = easeRaise(aim.progress);
  const z = 1 + (Math.max(1, aim.zoom) - 1) * raise;
  const sx = width / 2 + aim.dx;
  const sy = aim.sy;
  const lerp = (a: number, b: number): number => a + (b - a) * raise;
  // Keep the zoomed view [c − C/z, c + C/z] inside [0, size]: c ∈ [C/z, size − C/z].
  const clamp = (v: number, size: number): number => {
    const half = size / 2 / z;
    return Math.min(size - half, Math.max(half, v));
  };
  const cx = clamp(lerp(width / 2, sx), width);
  const cy = clamp(lerp(height / 2, sy), height);
  return {
    z,
    cx,
    cy,
    reticleX: width / 2 + (sx - cx) * z,
    reticleY: height / 2 + (sy - cy) * z,
    raise,
  };
}

/** Zoomed screen position of an unzoomed screen point. */
export function toZoomed(v: ZoomState, x: number, y: number, width: number, height: number) {
  return { x: width / 2 + (x - v.cx) * v.z, y: height / 2 + (y - v.cy) * v.z };
}

/** Unzoomed screen point under a zoomed screen position (the inverse of toZoomed). */
export function fromZoomed(v: ZoomState, x: number, y: number, width: number, height: number) {
  return { x: v.cx + (x - width / 2) / v.z, y: v.cy + (y - height / 2) / v.z };
}

/**
 * Fine aim while the sight is up (GDD §10.6): the aim moves by the pointer's movement divided by
 * the sight's zoom, from where it was when the press started. Positions are unzoomed design px.
 */
export function fineAim(
  anchorAim: { readonly x: number; readonly y: number },
  anchorPointer: { readonly x: number; readonly y: number },
  pointer: { readonly x: number; readonly y: number },
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const z = Math.max(1, zoom);
  return {
    x: Math.min(width, Math.max(0, anchorAim.x + (pointer.x - anchorPointer.x) / z)),
    y: Math.min(height, Math.max(0, anchorAim.y + (pointer.y - anchorPointer.y) / z)),
  };
}
