// v1.10 (D-067, art bible §5.6) The Reënbui sheet's frame table: the rain strips (two tiles that
// repeat across the screen), the alate column's four rising frames and the mound it pours from,
// the first drops' dust puff (four frames), the wet-ground patch, two storm towers, two small
// lightning forks. Design px at 1× (texture px = design px × the file's texels per px). Pure: the
// game, the art generator and the tests read it.
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
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The origin inside the frame (design px): a column's and a puff's foot, a fork's top. */
  readonly ox: number;
  readonly oy: number;
}

/** The rain tiles repeat with this period (their art wraps at the edges). */
export const RAIN_TILE = { w: 256, h: 192 } as const;
/** The column frame: its foot (the mound's mouth) at (ox, oy). */
export const COLUMN = { w: 96, h: 360, ox: 48, oy: 352 } as const;

/** Laid out by hand (design px): the columns, the rain tiles and the forks along the top, the
 *  storm towers under the rain tiles, the small frames in a row under the columns. */
function layout(): ReenbuiFrameRect[] {
  const at = (
    name: ReenbuiFrame,
    x: number,
    y: number,
    w: number,
    h: number,
    ox: number,
    oy: number,
  ): ReenbuiFrameRect => ({ name, x, y, w, h, ox, oy });
  const out: ReenbuiFrameRect[] = [];
  for (let i = 0; i < COLUMN_FRAMES; i++)
    out.push(at(`col_${i}`, 2 + i * 98, 2, COLUMN.w, COLUMN.h, COLUMN.ox, COLUMN.oy));
  out.push(at('rain_far', 394, 2, RAIN_TILE.w, RAIN_TILE.h, 0, 0));
  out.push(at('rain_near', 652, 2, RAIN_TILE.w, RAIN_TILE.h, 0, 0));
  out.push(at('fork_a', 910, 2, 54, 150, 27, 4));
  out.push(at('fork_b', 966, 2, 54, 150, 27, 4));
  out.push(at('cloud_a', 394, 198, 288, 150, 144, 146));
  out.push(at('cloud_b', 684, 198, 288, 150, 144, 146));
  for (let i = 0; i < PUFF_FRAMES; i++) out.push(at(`puff_${i}`, 2 + i * 74, 364, 72, 44, 36, 40));
  out.push(at('wet', 300, 364, 192, 48, 96, 24));
  out.push(at('mound', 494, 364, 96, 28, 48, 18));
  return out;
}

const FRAMES = layout();

export function reenbuiFrames(): readonly ReenbuiFrameRect[] {
  return FRAMES;
}

/** Height the frames need (reenbuiKeys.ts REENBUI_SHEET_H must be at least this). */
export function reenbuiSheetHeight(): number {
  return Math.max(...FRAMES.map((f) => f.y + f.h));
}

/** Texture px per design px of a sheet file `width` px wide (1 for the 1× art). */
export function reenbuiTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / REENBUI_SHEET_W));
}

export const columnFrame = (i: number): ReenbuiFrame =>
  `col_${((i % COLUMN_FRAMES) + COLUMN_FRAMES) % COLUMN_FRAMES}`;
export const puffFrame = (i: number): ReenbuiFrame =>
  `puff_${Math.min(PUFF_FRAMES - 1, Math.max(0, i))}`;
