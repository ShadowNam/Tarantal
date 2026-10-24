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

/** The plate's face (a round gong with its hanger), at plateRadiusPx 1:1 for plane scale 1. */
export const PLATE_TEX = 'range/plate';
/** Texture px; the disc is centred PLATE_HANG_PX + PLATE_DISC_R below the top. */
export const PLATE_DISC_R = 100;
export const PLATE_HANG_PX = 36;
export const PLATE_TEX_SIZE = {
  width: PLATE_DISC_R * 2 + 8,
  height: PLATE_HANG_PX + PLATE_DISC_R * 2 + 6,
} as const;
/** The hang point (the plate swings about it), as fractions of the texture. */
export const PLATE_ORIGIN = { x: 0.5, y: 4 / PLATE_TEX_SIZE.height } as const;
