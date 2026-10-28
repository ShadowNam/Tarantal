// v1.7 (D-044) desert assets: the meerkat sheet and the meerkats' sounds. They are shared by the
// two desert biomes (Kalahari, Namibië), so they load in a lazy group of their own ("desert")
// with either map — never in the first download, and not inside either biome's chunk (which have
// no room). Pure constants and a frame table: the game, the pack tool and the interim art
// generator all read them.

/** The desert asset group (lazy: tools/sizeBudget counts it as its own chunk). */
export const DESERT_GROUP = 'desert';

/** One sheet holds every meerkat frame and the burrow mounds (texture key). */
export const MEERKAT_SHEET = 'desert/meerkats';

/** Sounds through the AudioDirector (recording once delivered, else a small synth). */
export const MEERKAT_SOUNDS = {
  chirp: 'sfx/meerkat_chirp',
  alarm: 'sfx/meerkat_alarm',
  dig: 'sfx/meerkat_dig',
  click: 'sfx/camera_click',
} as const;
export type MeerkatSound = keyof typeof MEERKAT_SOUNDS;

/** 1.9.4 (D-057): the weaver colony's sheet (src/game/view/tree/colonySheet.ts COLONY_SHEET). */
export const COLONY_SHEET_KEY = 'desert/colony';

/** A key that belongs to the desert group. */
export function isDesertKey(key: string): boolean {
  return (
    key === MEERKAT_SHEET ||
    key === COLONY_SHEET_KEY ||
    (Object.values(MEERKAT_SOUNDS) as string[]).includes(key)
  );
}

/**
 * The sheet's layout in design px at the near plane (scale 1): a grid of CELL_W × CELL_H cells,
 * eight to a row, each with the meerkat's feet (or, in a hole, the hole's rim) at (FOOT_X,
 * FOOT_Y). Frames face right (the view mirrors them). The last row holds the mounds, two cells
 * wide each, the hole's centre at (MOUND_HOLE_X, MOUND_HOLE_Y) of the mound box. The interim art
 * is drawn at 2× (SHEET_MASTER); a delivery may be any multiple with the same layout.
 */
export const CELL_W = 112;
export const CELL_H = 144;
export const FOOT_X = 56;
export const FOOT_Y = 136;
export const SHEET_COLS = 8;
export const SHEET_MASTER = 2;

/** The frames drawn in the sheet's cells, in cell order. */
export const MEERKAT_FRAMES = [
  'peek_r',
  'stand_c',
  'stand_r',
  'sit',
  'sunbathe',
  'dig_a',
  'dig_b',
  'run_0',
  'run_1',
  'run_2',
  'run_3',
  'dive_a',
  'dive_b',
  'scold',
  'tumble',
  'front',
  'emerge',
  'bark',
  'pup_sit',
  'pup_run_a',
  'pup_run_b',
  'flick',
] as const;
/**
 * Frames that are another frame mirrored (look round 2: the left-looking peek and stand are the
 * right-looking ones flipped, which keeps the sheet inside the download budget). They share the
 * other frame's rect; the view flips them.
 */
export const MIRRORED_FRAMES = { peek_l: 'peek_r', stand_l: 'stand_r' } as const;
export type MeerkatFrame = (typeof MEERKAT_FRAMES)[number] | keyof typeof MIRRORED_FRAMES;

/** Mound variants (two cells wide each) in the sheet's last row. */
export const MOUND_FRAMES = ['mound_a', 'mound_b', 'mound_c'] as const;
export type MoundFrame = (typeof MOUND_FRAMES)[number];
/** The hole on a mound frame (design px from the frame's top left), and the mound's height
 *  there (the content's `mound` is scaled to this). */
export const MOUND_HOLE_X = CELL_W;
export const MOUND_HOLE_Y = 92;
export const MOUND_HEIGHT = 30;

export const SHEET_ROWS = Math.ceil(MEERKAT_FRAMES.length / SHEET_COLS) + 1;
export const SHEET_W = CELL_W * SHEET_COLS;
export const SHEET_H = CELL_H * SHEET_ROWS;

/** Frames that sit at a hole's rim (cut off there: the body below is in the burrow). */
export const RIM_FRAMES: ReadonlySet<MeerkatFrame> = new Set([
  'peek_l',
  'peek_r',
  'dive_a',
  'dive_b',
  'scold',
  'emerge',
]);

export interface SheetRect {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Origin in the frame (design px). */
  readonly ox: number;
  readonly oy: number;
  /** Another frame's rect, shown flipped (MIRRORED_FRAMES). */
  readonly mirror?: boolean;
}

/** Every frame of the sheet in design px (×1). */
export function sheetFrames(): SheetRect[] {
  const out: SheetRect[] = MEERKAT_FRAMES.map((name, i) => ({
    name,
    x: (i % SHEET_COLS) * CELL_W,
    y: Math.floor(i / SHEET_COLS) * CELL_H,
    w: CELL_W,
    h: CELL_H,
    ox: FOOT_X,
    oy: FOOT_Y,
  }));
  for (const [name, of] of Object.entries(MIRRORED_FRAMES)) {
    const r = out.find((f) => f.name === of);
    if (r !== undefined) out.push({ ...r, name, mirror: true });
  }
  const row = (SHEET_ROWS - 1) * CELL_H;
  MOUND_FRAMES.forEach((name, i) => {
    out.push({
      name,
      x: i * CELL_W * 2,
      y: row,
      w: CELL_W * 2,
      h: CELL_H,
      ox: MOUND_HOLE_X,
      oy: MOUND_HOLE_Y,
    });
  });
  return out;
}
