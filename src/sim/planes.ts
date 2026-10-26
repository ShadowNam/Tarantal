// D-049 (perspective): birds get smaller with distance. A plane's scale sizes everything on it
// (art, hitboxes, flock spacing, speeds); px tunings written "at the mid plane" are converted
// with the plane's scale / tuningRefScale. Hit areas may shrink less than the picture: a
// bird's body hit radii are at least the plane's minHitRadiusPx.

/** Multiplier for a px tuning written at `refScale` (scoring.tuningRefScale) on a plane of `scale`. */
export const tuningRatio = (scale: number, refScale: number): number => scale / refScale;

/** A hitbox radius (sprite units at scale 1) on a plane: scaled, but never below `minPx`. */
export const hitRadius = (radius: number, scale: number, minPx: number): number =>
  Math.max(radius * scale, minPx);
