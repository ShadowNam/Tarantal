// v1.10 (D-067): the Reënbui sheet's key, group and size only, for the placeholder and the asset
// audit (the first download): the frame table (reenbuiSheet.ts) stays with the lazy ReenbuiView.
// reenbuiSheet.test.ts checks these against the table.

/** The sheet's texture key (listed only by the maps that can have a Reënbui). */
export const REENBUI_SHEET = 'reenbui/sheet';
/** Sheet size (sheet px at 1×; reenbuiSheet.ts packs the cropped, partly half-size frames into
 *  it). Standard in HD (no HD twin): 0.5 MiB on the GPU, inside the Okavango's HD headroom. */
export const REENBUI_SHEET_W = 512;
export const REENBUI_SHEET_H = 256;
