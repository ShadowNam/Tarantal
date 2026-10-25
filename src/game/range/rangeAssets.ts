// 24 Oct update (D-037) Skietbaan assets: the steel plate's art and the range's sounds. Their own
// asset group ("range"), loaded by the range's lazy chunk when a session starts, never with the
// first download; until they arrive (or without an asset index) the plate is drawn in code and
// the sounds are synthesised (rangeSounds.ts). Interim (code-made, D-029) art from
// `npm run art:interim -- --only range` and sounds from `npm run audio:interim -- --only sfx`.
// Pure constants: the asset tools import them.

/** The range's asset group (lazy: tools/sizeBudget counts it outside the first download). */
export const RANGE_GROUP = 'range';

/** The range's sounds: a paper hit, a steel plate's ring, a bird hit. */
export const RANGE_SOUNDS = {
  thwack: 'sfx/range_thwack',
  ding: 'sfx/range_ding',
  hit: 'sfx/range_hit',
} as const;
export type RangeSound = keyof typeof RANGE_SOUNDS;

/** The plate's face (a round gong with its hanger). Skietbaan gongs (D-040): drawn at 2× (a
 *  plateRadiusPx-100 plate is 200 texture px), scaled per plane, so it stays crisp in a scope. */
export const PLATE_TEX = 'range/plate';
/** Texture px; the disc is centred PLATE_HANG_PX + PLATE_DISC_R below the top. */
export const PLATE_DISC_R = 200;
export const PLATE_HANG_PX = 72;
export const PLATE_TEX_SIZE = {
  width: PLATE_DISC_R * 2 + 16,
  height: PLATE_HANG_PX + PLATE_DISC_R * 2 + 12,
} as const;
/** The hang point (the plate swings about it), as fractions of the texture. */
export const PLATE_ORIGIN = { x: 0.5, y: 8 / PLATE_TEX_SIZE.height } as const;
/** Disc centre below the hang point, texture px. */
export const PLATE_CY = PLATE_HANG_PX + PLATE_DISC_R - PLATE_ORIGIN.y * PLATE_TEX_SIZE.height;

/** D-040: the plate's frame (two camelthorn posts and a crossbar) at the same 2× scale. Sizes
 *  are fractions of the disc radius: the posts stand FRAME_HALF either side of the hang point,
 *  FRAME_POST wide, down to FRAME_LEG_BELOW below the disc centre (the ground). */
export const PLATE_FRAME_TEX = 'range/plate_frame';
export const FRAME_HALF = 1.12;
export const FRAME_POST = 0.12;
export const FRAME_LEG_BELOW = 1.5;
const FRAME_PAD = 6;
const POST_PX = PLATE_DISC_R * FRAME_POST;
/** Crossbar top above the hang point (texture px). */
export const FRAME_TOP_PX = POST_PX * 1.6;
export const PLATE_FRAME_TEX_SIZE = {
  width: Math.ceil(PLATE_DISC_R * FRAME_HALF * 2 + POST_PX * 1.6 + FRAME_PAD * 2),
  height: Math.ceil(FRAME_TOP_PX + PLATE_CY + PLATE_DISC_R * FRAME_LEG_BELOW + FRAME_PAD),
} as const;
/** The frame's hang point, as fractions of its texture (it lines up with the plate's). */
export const PLATE_FRAME_ORIGIN = {
  x: 0.5,
  y: (FRAME_TOP_PX + FRAME_PAD) / PLATE_FRAME_TEX_SIZE.height,
} as const;
