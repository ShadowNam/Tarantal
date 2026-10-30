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
