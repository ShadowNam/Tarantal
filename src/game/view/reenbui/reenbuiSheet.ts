// v1.10 (D-067, art bible §5.6) The Reënbui sheet's frame table: the rain strips (two tiles that
// repeat across the screen), the alate column's four rising frames and the mound it pours from,
// the first drops' dust puff (four frames), the wet-ground patch, two storm towers, two small
// lightning forks. Each frame is cropped to its art; the soft or repeating ones (the columns, the
// rain tiles, the towers, the wet patch) are authored at half resolution and drawn ×2 (`res`), so
// the sheet is 512 × 256 (0.5 MiB on the GPU: GPU_BYTES_CAP). Pure: the game, the art generator
// and the tests read it.
import { REENBUI_SHEET_W } from './reenbuiKeys';

export { REENBUI_SHEET, REENBUI_SHEET_H, REENBUI_SHEET_W } from './reenbuiKeys';

/** Frames of the column's rising loop and of the dust puff. */
export const COLUMN_FRAMES = 4;
export const PUFF_FRAMES = 4;

export type ReenbuiFrame =
  | 'rain_far'
  | 'rain_near'
  | `col_${number}`
  | 'mound'
  | `puff_${number}`
  | 'wet'
  | 'cloud_a'
  | 'cloud_b'
  | 'fork_a'
  | 'fork_b';

export interface ReenbuiFrameRect {
  readonly name: ReenbuiFrame;
  /** Its corner on the 1× sheet (sheet px). */
  readonly x: number;
  readonly y: number;
  /** Its size as drawn (design px); on the sheet it takes w × res by h × res. */
  readonly w: number;
  readonly h: number;
  /** The origin inside the frame (design px): a column's and a puff's foot, a fork's top. */
  readonly ox: number;
  readonly oy: number;
  /** Sheet px per design px: 1, or 0.5 for the frames authored at half size and drawn ×2. */
  readonly res: number;
}

/** The sheet's GPU cost cap (bytes, RGBA at 1×): the Okavango's HD hunt has ~1 MiB of headroom
 *  with the event (perf.spec: ≤ 256 MB, 255 targeted). */
export const GPU_BYTES_CAP = 512 * 1024;

/** The rain tiles repeat with this period (their art wraps at the edges). */
export const RAIN_TILE = { w: 256, h: 192 } as const;
/** The column frame: its foot (the mound's mouth) at (ox, oy). */
/** The column frame: its foot (the mound's mouth) at (ox, oy). Art px are mid-plane screen px
 *  (shown 1:1 on the mid plane, scaled by plane for the far one): ~430 px tall there. */
export const COLUMN = { w: 120, h: 440, ox: 60, oy: 432 } as const;
/** The column frame cropped to its art (design px): its foot keeps the art's origin. */
export const COLUMN_CROP = { w: 92, h: 432, ox: 44, oy: 426 } as const;

/** Half size: the soft and repeating art, drawn ×2. */
const HALF = 0.5;

/**
 * Laid out by hand on the 512 × 256 sheet (sheet px; 1 px apart): the four columns down the left
 * (half size), the two rain tiles top right (half size; they still wrap: 128 × 96 on the sheet),
 * the towers (half size) under them, then the forks, the mound, the wet patch (half size) and the
 * puffs. Crops (design px) from the art's opaque bounds: a column 92 × 432 of its 120 × 440 cell,
 * a tower 242 × 130 of 270 × 140, a fork 48 × 148, the mound 88 × 26.
 */
function layout(): ReenbuiFrameRect[] {
  const at = (
    name: ReenbuiFrame,
    x: number,
    y: number,
    w: number,
    h: number,
    ox: number,
    oy: number,
    res = 1,
  ): ReenbuiFrameRect => ({ name, x, y, w, h, ox, oy, res });
  const out: ReenbuiFrameRect[] = [];
  const col = COLUMN_CROP;
  for (let i = 0; i < COLUMN_FRAMES; i++)
    out.push(at(`col_${i}`, i * (col.w * HALF + 1), 0, col.w, col.h, col.ox, col.oy, HALF));
  out.push(at('rain_far', 189, 0, RAIN_TILE.w, RAIN_TILE.h, 0, 0, HALF));
  out.push(at('rain_near', 318, 0, RAIN_TILE.w, RAIN_TILE.h, 0, 0, HALF));
  out.push(at('cloud_a', 189, 98, 242, 130, 121, 127, HALF));
  out.push(at('cloud_b', 189, 165, 242, 130, 121, 127, HALF));
  out.push(at('fork_a', 464, 0, 48, 148, 27, 4));
  out.push(at('fork_b', 312, 98, 48, 148, 27, 4));
  out.push(at('mound', 362, 98, 88, 26, 44, 16));
  out.push(at('wet', 362, 126, 192, 48, 96, 24, HALF));
  for (let i = 0; i < PUFF_FRAMES; i++)
    out.push(at(`puff_${i}`, 362 + (i % 2) * 74, 152 + Math.floor(i / 2) * 46, 72, 44, 36, 40));
  return out;
}

const FRAMES = layout();

export function reenbuiFrames(): readonly ReenbuiFrameRect[] {
  return FRAMES;
}

/** A frame's size on the 1× sheet (sheet px). */
export function sheetRect(f: ReenbuiFrameRect): { x: number; y: number; w: number; h: number } {
  return { x: f.x, y: f.y, w: Math.round(f.w * f.res), h: Math.round(f.h * f.res) };
}

/** Width and height the frames need (reenbuiKeys.ts must be at least these). */
export function reenbuiSheetWidth(): number {
  return Math.max(...FRAMES.map((f) => f.x + sheetRect(f).w));
}
export function reenbuiSheetHeight(): number {
  return Math.max(...FRAMES.map((f) => f.y + sheetRect(f).h));
}

const RES = new Map(FRAMES.map((f) => [f.name, f.res]));
/** Sheet px per design px of a frame (1 or 0.5). */
export function frameRes(name: string): number {
  return RES.get(name as ReenbuiFrame) ?? 1;
}

/** Texture px per design px of a sheet file `width` px wide (1 for the 1× art). */
export function reenbuiTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / REENBUI_SHEET_W));
}

export const columnFrame = (i: number): ReenbuiFrame =>
  `col_${((i % COLUMN_FRAMES) + COLUMN_FRAMES) % COLUMN_FRAMES}`;
export const puffFrame = (i: number): ReenbuiFrame =>
  `puff_${Math.min(PUFF_FRAMES - 1, Math.max(0, i))}`;
