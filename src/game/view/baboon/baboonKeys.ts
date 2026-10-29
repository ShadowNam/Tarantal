// v1.8b (D-062): the baboon sheet's key and size only, for the placeholder and the asset audit
// (the first download): the frame table (baboonSheet.ts) stays in the lazy BaboonView chunk.
// baboonSheet.test.ts checks these against the table.

/** The sheet's texture key (late group: every manifest lists it). */
export const BABOON_SHEET = 'baboons/sheet';
/** Sheet size, design px at 1× (baboonSheet.ts packs the frames into it). */
export const BABOON_SHEET_W = 672;
export const BABOON_SHEET_H = 946;
