// Fixed world geometry from Tech §3.3. These define the coordinate system itself (like the 60 Hz
// tick), so they are constants here rather than tunables in content/.

/** Design height of the visible space. */
export const DESIGN_HEIGHT = 1080;
/** Reference (16:9) visible width; the screen centre sits at REFERENCE_WIDTH / 2. */
export const REFERENCE_WIDTH = 1920;
/** Half the reference width: screen centre x and the camera's minimum centre. */
export const HALF_REFERENCE_WIDTH = REFERENCE_WIDTH / 2;
/** Camera travel range R in reference units: cx ∈ [960, 960 + R]. */
export const CAMERA_RANGE = 3200;
/** Camera centre bounds. */
export const CAMERA_MIN_X = HALF_REFERENCE_WIDTH;
export const CAMERA_MAX_X = HALF_REFERENCE_WIDTH + CAMERA_RANGE;
/** Bleed art on each side of every layer so 21:9 screens never see an empty edge. */
export const LAYER_BLEED_PX = 300;

/** Core width of a layer with scroll factor f: W_f = 1920 + R × f. */
export function coreWidth(scrollFactor: number): number {
  return REFERENCE_WIDTH + CAMERA_RANGE * scrollFactor;
}
