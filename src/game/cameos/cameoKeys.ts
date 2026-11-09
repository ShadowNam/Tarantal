// v1.13 (D-075): the veld cameos' keys, groups and sheet sizes only — what the first download needs
// (a hunt asks for its area's lazy group; the asset audit and the pack tool read the keys). The
// frame tables (cameoSheet.ts) stay with the lazy view; cameoSheet.test.ts checks these against it.

/** The areas with a cameo group (the Okavango's holds only the elephants' trumpet: no sheet). */
export const CAMEO_AREAS = ['bushveld', 'karoo', 'kalahari', 'namibie', 'okavango'] as const;
export type CameoArea = (typeof CAMEO_AREAS)[number];

/** The areas with a sheet. */
export const CAMEO_SHEET_AREAS = ['bushveld', 'karoo', 'kalahari', 'namibie'] as const;
export type CameoSheetArea = (typeof CAMEO_SHEET_AREAS)[number];

/** Each biome's cameo area. */
export const CAMEO_AREA_OF: Readonly<Record<string, CameoArea>> = {
  'bushveld-winter': 'bushveld',
  'karoo-autumn': 'karoo',
  'kalahari-summer': 'kalahari',
  namibie: 'namibie',
  'okavango-spring': 'okavango',
};

/** An area's asset group (lazy: its own chunk in tools/size-check; the HD twin `<group>-hd`). */
export function cameoGroup(area: CameoArea): string {
  return `cameos-${area}`;
}

/** An area's sheet (texture key). */
export function cameoSheetKey(area: CameoSheetArea): string {
  return `cameos/${area}`;
}

/** Every sheet key, literally (the asset audit reads these). */
export const CAMEO_SHEETS: Readonly<Record<CameoSheetArea, string>> = {
  bushveld: 'cameos/bushveld',
  karoo: 'cameos/karoo',
  kalahari: 'cameos/kalahari',
  namibie: 'cameos/namibie',
};

/** Sheet size at 1× (sheet px; every frame at half its drawn size, drawn ×2; the HD twin is 2×,
 *  1:1). D-080: the true-size frames (v1.13: bushveld 256 × 128, karoo 512 × 256, kalahari
 *  256 × 128, namibie 512 × 256). */
export const CAMEO_SHEET_SIZE: Readonly<Record<CameoSheetArea, { w: number; h: number }>> = {
  bushveld: { w: 528, h: 257 },
  karoo: { w: 608, h: 751 },
  kalahari: { w: 560, h: 332 },
  namibie: { w: 928, h: 605 },
};

/** Sounds through the AudioDirector (recordings from the area's lazy group; silent until in). */
export const CAMEO_SOUNDS = {
  /** Bushveld: the sow's grunts as the family trots (and the bolt's squeal-grunt). */
  grunt: 'sfx/cameo_warthog_grunt',
  /** Bushveld: the dung beetle's tiny "plop" as it tumbles off its ball. */
  plop: 'sfx/cameo_beetle_plop',
  /** Karoo: the tortoise's shell "tok" as it pulls in. */
  tok: 'sfx/cameo_tortoise_tok',
  /** Karoo: the ostrich's deep boom. */
  boom: 'sfx/cameo_ostrich_boom',
  /** Kalahari: the springbok's alarm whistle-snort. */
  whistle: 'sfx/cameo_springbok_whistle',
  /** Namibië: the gemsbok's snort as it trots off. */
  snort: 'sfx/cameo_gemsbok_snort',
  /** Okavango: an elephant's trumpet. */
  trumpet: 'sfx/cameo_elephant_trumpet',
} as const;
export type CameoSound = keyof typeof CAMEO_SOUNDS;

/** Each area's sounds (in its group). */
export const CAMEO_AREA_SOUNDS: Readonly<Record<CameoArea, readonly CameoSound[]>> = {
  bushveld: ['grunt', 'plop'],
  karoo: ['tok', 'boom'],
  kalahari: ['whistle'],
  namibie: ['snort'],
  okavango: ['trumpet'],
};
