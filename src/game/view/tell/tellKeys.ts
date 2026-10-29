// v1.7e (D-061): the tell animals' sheet key and size only, for the placeholder and the asset
// audit (the first download): the frame table (tellSheet.ts) stays in the lazy TellView chunk.
// tellSheet.test.ts checks these against the table.

/** The sheet's texture key (late group: every manifest lists it). */
export const TELL_SHEET = 'tells/sheet';
/** Sheet size, prop px at 1× (tellSheet.ts packs the frames into it). */
export const TELL_SHEET_W = 340;
export const TELL_SHEET_H = 668;
