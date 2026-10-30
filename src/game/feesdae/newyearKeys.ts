// D-065: the New Year countdown's keys and the few numbers the first download needs (the title's
// badge, the HUD's bark bubble, the tally's tune): no frame table, so the sheet's layout stays in
// the lazy chunk (newyearAssets.ts re-exports these).

/** New Year's asset group (lazy: tools/size-check counts it as its own chunk). */
export const NEWYEAR_GROUP = 'feesdae-newyear';

/** Every New Year frame on one sheet (texture key). */
export const NEWYEAR_SHEET = 'feesdae/newyear';
/** The interim sheet is drawn at 2× as the source; the pack ships it at 1× (Standard in HD). */
export const NY_MASTER = 2;

/** Sounds through the AudioDirector (recording once delivered, else a small synth). */
export const NY_SOUNDS = {
  sting: 'sfx/ny_sting',
  tally: 'sfx/ny_tally',
  pop: 'sfx/firework_pop',
  tick: 'sfx/countdown_tick',
} as const;
export type NySound = keyof typeof NY_SOUNDS;

/** Sheet width in design px (newyearAssets.ts packs the frames into it). */
export const NY_SHEET_W = 400;

/** Texture px per design px of a New Year texture (1: the Standard sheet, which HD shows too;
 *  2: the code-drawn stand-in). */
export function nyMasterOf(width: number): number {
  return Math.max(1, Math.round(width / NY_SHEET_W));
}

/** The best New Year texture in this texture manager (the sheet, else the stand-in), or null. */
export function nyKeyIn(textures: { exists(key: string): boolean }): string | null {
  for (const k of [NEWYEAR_SHEET, `${NEWYEAR_SHEET}#standin`]) if (textures.exists(k)) return k;
  return null;
}

/** Whether the delivered sheet (not the stand-in, which has only the fireworks' sparks) is in. */
export function nySheetIn(textures: { exists(key: string): boolean }): boolean {
  return textures.exists(NEWYEAR_SHEET);
}
