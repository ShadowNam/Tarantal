// v1.8c (D-063): the Harvest sheet's key, group and size only, for the placeholder and the asset
// audit: the frame table (harvestSheet.ts) stays with the lazy HarvestView.
// harvestSheet.test.ts checks these against the table.

/** The sheet's texture key (only the Harvest map's manifest lists it). */
export const HARVEST_SHEET = 'oes/harvest';
/** Its asset group: the Harvest map's own lazy area group (HD twin `oes-hd`). */
export const HARVEST_GROUP = 'oes';
/** Sheet size, design px at 1× (harvestSheet.ts packs the frames into it). */
export const HARVEST_SHEET_W = 1536;
export const HARVEST_SHEET_H = 918;
