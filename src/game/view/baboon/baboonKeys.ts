// v1.8b (D-062): the baboon sheet's key and size only, for the placeholder and the asset audit
// (the first download): the frame table (baboonSheet.ts) stays in the lazy BaboonView chunk.
// baboonSheet.test.ts checks these against the table.

/** The sheet's texture key (every manifest lists it). */
export const BABOON_SHEET = 'baboons/sheet';
/** Its asset group: in the background after the first download (with the late group), and a
 *  hunt on a map with a troop waits for this one file: the troop is hittable from the first tick,
 *  so it must be drawn then (review of v1.8b). Its HD twin is `baboons-hd`. */
export const BABOON_GROUP = 'baboons';
/** Sheet size, design px at 1× (baboonSheet.ts packs the frames into it). */
export const BABOON_SHEET_W = 756;
export const BABOON_SHEET_H = 910;
