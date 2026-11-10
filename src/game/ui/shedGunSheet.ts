// v1.19 (D-084): the Gun Shed's side-view gun pictures, one cell per gun in one small sheet. The
// sheet is in its own asset group (`shed`) that no hunt's manifest loads: ShedScene fetches it on
// demand and crops each card's picture onto its own small canvas, so it is never in the first
// download and never on the GPU during a hunt. tools/art/gunCards.ts draws it.

/** The sheet's texture key (index image key; never installed as a texture). */
export const SHED_GUN_SHEET = 'shed/guns';
/** Its asset group (assetIndex.ts SHED_GROUP). */
export const SHED_GUN_GROUP = 'shed';
/** One cell, design px at 1× (the side view fits it with a margin). */
export const SHED_GUN_CELL = { w: 380, h: 140 } as const;
/** Texture px per design px in the delivered file (one file serves Standard and HD). */
export const SHED_GUN_MASTER = 2;
/** Cells per row. */
export const SHED_GUN_COLS = 2;
/** Every gun with a side view, in sheet order (primary guns, then the crate guns). */
export const SHED_GUN_ORDER = [
  'dubbelloop',
  'windbuks',
  'kettie',
  'pomp',
  'twee_twee',
  'langloop',
  'voorlaaier',
  'mielie_masjien',
] as const;
export type ShedGunId = (typeof SHED_GUN_ORDER)[number];

/** Sheet size in design px at 1×. */
export const SHED_GUN_SHEET_W = SHED_GUN_CELL.w * SHED_GUN_COLS;
export const SHED_GUN_SHEET_H = SHED_GUN_CELL.h * Math.ceil(SHED_GUN_ORDER.length / SHED_GUN_COLS);

export function isShedGun(id: string): id is ShedGunId {
  return (SHED_GUN_ORDER as readonly string[]).includes(id);
}

/** A gun's cell in the delivered file (texture px), or null for a gun without a side view. */
export function shedGunCell(
  id: string,
  master = SHED_GUN_MASTER,
): { x: number; y: number; w: number; h: number } | null {
  const i = (SHED_GUN_ORDER as readonly string[]).indexOf(id);
  if (i < 0) return null;
  return {
    x: (i % SHED_GUN_COLS) * SHED_GUN_CELL.w * master,
    y: Math.floor(i / SHED_GUN_COLS) * SHED_GUN_CELL.h * master,
    w: SHED_GUN_CELL.w * master,
    h: SHED_GUN_CELL.h * master,
  };
}
