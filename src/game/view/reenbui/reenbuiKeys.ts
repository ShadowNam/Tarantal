// v1.10 (D-067): the Reënbui sheet's key, group and size only, for the placeholder and the asset
// audit (the first download): the frame table (reenbuiSheet.ts) stays with the lazy ReenbuiView.
// reenbuiSheet.test.ts checks these against the table.

/** The sheet's texture key (listed only by the maps that can have a Reënbui). */
export const REENBUI_SHEET = 'reenbui/sheet';
/** Sheet size, design px at 1× (reenbuiSheet.ts packs the frames into it). Drawn at 1× and
 *  Standard in HD (no HD twin): ~2 MB on the GPU, inside the Okavango's HD headroom. */
export const REENBUI_SHEET_W = 1024;
export const REENBUI_SHEET_H = 490;
