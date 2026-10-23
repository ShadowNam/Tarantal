// v1.3 (D-036): bird art exists for the near, mid and far planes. A Ver-plane bird is drawn from
// another plane's art, scaled down to the Ver scale: the far atlas unzoomed, the mid atlas once a
// sight zooms in far enough that the far frames would be stretched (BirdView).
import type { PlaneId } from '../../sim/types';

/** Planes that have their own bird art (atlases, placeholder frames). */
export type ArtPlaneId = Exclude<PlaneId, 'ver'>;
export const ART_PLANES: readonly ArtPlaneId[] = ['near', 'mid', 'far'];

export const isArtPlane = (p: PlaneId): p is ArtPlaneId => p !== 'ver';

/**
 * The art plane to draw a bird of `plane` with, for an on-screen scale of `screenScale`
 * (plane scale × view zoom): the smallest art at least that large, so it is never stretched.
 */
export function artPlaneFor(
  plane: PlaneId,
  screenScale: number,
  scales: Readonly<Record<ArtPlaneId, number>>,
): ArtPlaneId {
  if (isArtPlane(plane)) return plane;
  if (screenScale <= scales.far) return 'far';
  if (screenScale <= scales.mid) return 'mid';
  return 'near';
}
