// v1.4 (#56, D-038): what a zoomed (scoped) view still has to draw. Zoomed in towards the
// horizon, every far layer, the sky and the haze bands cover the whole screen, so each screen
// pixel was drawn many times over. While zoomed, ParallaxView draws only what can show:
//   1. the part of each layer inside the zoomed view (and, with a scope or peep fully up, only
//      inside the ring's square: the sight's opaque fill hides the rest of the screen);
//   2. minus the rows a nearer layer's opaque band hides in that view (art bands are measured by
//      `assets:pack`: `solid` in the asset index, rows that are fully opaque per 256 px bucket).
// Pure geometry in unzoomed design px (layer y = unzoomed screen y; a layer's x is screen x − its
// offset). The open view (zoom 1) never goes through here, so it draws exactly as before.

/** Half-open row interval [y0, y1). */
export interface Band {
  readonly y0: number;
  readonly y1: number;
}

export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A layer art tile's opaque rows per bucket, in layer px (from the asset index). */
export interface SolidProfile {
  /** Layer x of bucket 0's left edge. */
  readonly left: number;
  /** Bucket width in layer px. */
  readonly bucketW: number;
  /** Per bucket: rows fully opaque across the bucket (layer y), or null. */
  readonly rows: readonly (Band | null)[];
}

/**
 * The unzoomed screen rect a zoomed view shows: the screen [0, W] × [0, H] seen at zoom z around
 * the unzoomed centre (cx, cy), intersected with `clip` (zoomed screen px) when given, grown by
 * `margin` zoomed px (camera shake) on each side.
 */
export function zoomedViewRect(
  z: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
  clip: Rect | null,
  margin: number,
): Rect {
  const c = clip ?? { x0: 0, y0: 0, x1: width, y1: height };
  const ux = (x: number): number => cx + (x - width / 2) / z;
  const uy = (y: number): number => cy + (y - height / 2) / z;
  return {
    x0: ux(Math.max(0, c.x0) - margin),
    y0: uy(Math.max(0, c.y0) - margin),
    x1: ux(Math.min(width, c.x1) + margin),
    y1: uy(Math.min(height, c.y1) + margin),
  };
}

/**
 * The bounding span of the rows in [y0, y1) that no band covers, or null if they are all
 * covered. (Only the outer edges are cropped: an uncovered gap in the middle stays drawn.)
 */
export function uncoveredSpan(y0: number, y1: number, covered: readonly Band[]): Band | null {
  if (y1 <= y0) return null;
  let lo = y0;
  for (let moved = true; moved && lo < y1;) {
    moved = false;
    for (const b of covered) {
      if (b.y0 <= lo && b.y1 > lo) {
        lo = b.y1;
        moved = true;
      }
    }
  }
  if (lo >= y1) return null;
  let hi = y1;
  for (let moved = true; moved && hi > lo;) {
    moved = false;
    for (const b of covered) {
      if (b.y0 < hi && b.y1 >= hi) {
        hi = b.y0;
        moved = true;
      }
    }
  }
  return hi > lo ? { y0: lo, y1: hi } : null;
}

/**
 * The rows a layer hides in every column of [x0, x1) (layer px): the intersection of the opaque
 * bands of every bucket that overlaps the range, or null when a bucket has none or the profiled
 * tiles don't span the whole range.
 */
export function coverOver(profiles: readonly SolidProfile[], x0: number, x1: number): Band | null {
  let y0 = -Infinity;
  let y1 = Infinity;
  // Sweep the range left to right through the buckets that cover it.
  let at = x0;
  const sorted = [...profiles].sort((a, b) => a.left - b.left);
  for (const p of sorted) {
    const end = p.left + p.rows.length * p.bucketW;
    if (end <= at || p.left > at) continue;
    let i = Math.floor((at - p.left) / p.bucketW);
    for (; i < p.rows.length && p.left + i * p.bucketW < x1; i++) {
      const r = p.rows[i] ?? null;
      if (r === null) return null;
      y0 = Math.max(y0, r.y0);
      y1 = Math.min(y1, r.y1);
      if (y1 <= y0) return null;
    }
    at = Math.min(end, p.left + i * p.bucketW);
    if (at >= x1) break;
  }
  return at >= x1 && y1 > y0 ? { y0, y1 } : null;
}

/** Intersection of two rects, or null when empty. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const r = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}

/** Converts an asset-index profile (rows relative to the art's top, per texture bucket) for one
 *  tile drawn at layer x `tileLeft`, art top `top`, x scale `sx` (low-tier merged art is
 *  stretched), first bucket `from` and `count` buckets. */
export function tileProfile(
  solid: { readonly bucket: number; readonly rows: readonly (readonly [number, number] | null)[] },
  tileLeft: number,
  top: number,
  sx: number,
  from: number,
  count: number,
): SolidProfile {
  const rows: (Band | null)[] = [];
  for (let i = from; i < from + count; i++) {
    const r = solid.rows[i] ?? null;
    rows.push(r === null ? null : { y0: top + r[0], y1: top + r[1] });
  }
  return { left: tileLeft, bucketW: solid.bucket * sx, rows };
}
