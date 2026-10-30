// D-064: Christmas in the sun's keys and the few numbers the first download needs (the title's
// badge, the HUD's bark bubble, the tally's carol): no frame table, so the sheet's layout stays
// in the lazy chunk (christmasAssets.ts re-exports these).

/** Christmas's asset group (lazy: tools/size-check counts it as its own chunk). */
export const CHRISTMAS_GROUP = 'feesdae-christmas';

/** Every Christmas frame on one sheet (texture key). */
export const CHRISTMAS_SHEET = 'feesdae/christmas';
/** The interim sheet is drawn at 2× (and so is the in-game stand-in): crisp in a scope and in HD. */
export const XMAS_MASTER = 2;

/** Sounds through the AudioDirector (recording once delivered, else a small synth). */
export const XMAS_SOUNDS = {
  sting: 'sfx/xmas_sting',
  tally: 'sfx/xmas_tally',
  present: 'sfx/present_open',
} as const;
export type XmasSound = keyof typeof XMAS_SOUNDS;

/** A present's foot is this far below its centre (the frame's origin), design px at scale 1:
 *  feesdae.json presents.lift must match (content:validate). */
export const PRESENT_GROUND_PX = 50;

/** Oupa is drawn at half size (he is shown small: the title badge, the tally, the bubble), so his
 *  frames are half the art's size; the views scale him up by OUPA_DRAWN. */
export const OUPA_DRAWN = 0.5;

/** Sheet width in design px (christmasAssets.ts packs the frames into it). */
export const XMAS_SHEET_W = 644;

/** D-064 round 2: the HD sheet (2×) has its own key; the Standard pack is 1× under
 *  CHRISTMAS_SHEET. Which one a hunt draws follows the Graphics setting. */
export const CHRISTMAS_SHEET_HD = `${CHRISTMAS_SHEET}@hd`;

/** Texture px per design px of a Christmas texture (1 Standard, 2 HD or the stand-in). */
export function xmasMasterOf(width: number): number {
  return Math.max(1, Math.round(width / XMAS_SHEET_W));
}

/** The best Christmas texture in this texture manager (HD, Standard, the stand-in), or null. */
export function xmasKeyIn(textures: { exists(key: string): boolean }): string | null {
  for (const k of [CHRISTMAS_SHEET_HD, CHRISTMAS_SHEET, `${CHRISTMAS_SHEET}#standin`])
    if (textures.exists(k)) return k;
  return null;
}
