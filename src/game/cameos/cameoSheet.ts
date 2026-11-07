// v1.13 (D-075, art bible §5.7) the veld cameos' frame tables, one sheet per area. Every frame faces
// right with its origin at the animal's feet (the ground point under it; lesson 8), sized as DRAWN
// on its plane (design px: a mid-plane frame is already at the mid plane's scale, D-049). Frames are
// authored at half size and drawn ×2 (`res` 0.5), so each 1× sheet stays inside GPU_BYTES_CAP
// (lessons 29, 38). Packed in a skyline, tallest first, 2 px apart. Pure: the game, the art
// generator and the tests read it.
import { CAMEO_SHEET_SIZE, type CameoSheetArea } from './cameoKeys';

export { CAMEO_SHEETS, CAMEO_SHEET_SIZE, cameoSheetKey } from './cameoKeys';

/** Bushveld: the warthog sow (hog_*) and her piglets (pig_*), the dung beetle and its ball. */
export type BushveldFrame =
  | 'hog_trot_a'
  | 'hog_trot_b'
  | 'hog_feed'
  | 'hog_run_a'
  | 'hog_run_b'
  | 'pig_trot_a'
  | 'pig_trot_b'
  | 'pig_feed'
  | 'pig_run'
  | 'beetle_push_a'
  | 'beetle_push_b'
  | 'beetle_push_c'
  | 'beetle_push_d'
  | 'beetle_tumble'
  | 'beetle_right';
/** Karoo: the ostrich sprinting (and veering, with the dust it kicks up), the leopard tortoise. */
export type KarooFrame =
  | 'ost_run_a'
  | 'ost_run_b'
  | 'ost_run_c'
  | 'ost_veer'
  | 'dust'
  | 'tort_walk_a'
  | 'tort_walk_b'
  | 'tort_hide'
  | 'tort_peek';
/** Kalahari: the springbok (walking, grazing, alert, pronking: bunched in the air, then landing). */
export type KalahariFrame =
  'sb_walk_a' | 'sb_walk_b' | 'sb_graze' | 'sb_alert' | 'sb_pronk_a' | 'sb_pronk_b';
/** Namibië: the gemsbok (walking, grazing, alert, cantering off). */
export type NamibieFrame =
  'gb_walk_a' | 'gb_walk_b' | 'gb_graze' | 'gb_alert' | 'gb_run_a' | 'gb_run_b';

export interface CameoFrames {
  bushveld: BushveldFrame;
  karoo: KarooFrame;
  kalahari: KalahariFrame;
  namibie: NamibieFrame;
}
export type CameoFrame = CameoFrames[CameoSheetArea];

export interface CameoFrameSpec {
  readonly name: CameoFrame;
  /** Size as drawn (design px on its plane); on the sheet w × res by h × res. */
  readonly w: number;
  readonly h: number;
  /** The feet inside the frame (design px): the origin the view places on the ground. */
  readonly ox: number;
  readonly oy: number;
  /** Sheet px per design px. */
  readonly res: number;
}

export interface CameoFrameRect extends CameoFrameSpec {
  /** Its corner on the 1× sheet (sheet px). */
  readonly x: number;
  readonly y: number;
}

const f = (name: CameoFrame, w: number, h: number, ox: number, oy: number): CameoFrameSpec => ({
  name,
  w,
  h,
  ox,
  oy,
  res: 0.5,
});

/** Each frame's box with a 6 px margin round the drawing on every side (lesson 12; the art test
 *  checks the fit). Sizes: the true height × the mid plane's scale (0.42) × the far herds' size
 *  factor (D-054: 0.57; the ostrich at Namibië's mid-plane size), the near ones at the near scale
 *  (the beetle drawn about twice its true size so it reads). */
const SPECS: Readonly<Record<CameoSheetArea, readonly CameoFrameSpec[]>> = {
  bushveld: [
    f('hog_trot_a', 124, 84, 62, 78),
    f('hog_trot_b', 124, 84, 62, 78),
    f('hog_feed', 124, 66, 62, 60),
    f('hog_run_a', 132, 84, 66, 78),
    f('hog_run_b', 132, 84, 66, 78),
    f('pig_trot_a', 60, 44, 30, 38),
    f('pig_trot_b', 60, 44, 30, 38),
    f('pig_feed', 60, 36, 30, 30),
    f('pig_run', 64, 44, 32, 38),
    f('beetle_push_a', 76, 48, 30, 42),
    f('beetle_push_b', 76, 48, 30, 42),
    f('beetle_push_c', 76, 48, 30, 42),
    f('beetle_push_d', 76, 48, 30, 42),
    f('beetle_tumble', 76, 48, 30, 42),
    f('beetle_right', 76, 48, 30, 42),
  ],
  karoo: [
    f('ost_run_a', 216, 214, 104, 206),
    f('ost_run_b', 216, 214, 104, 206),
    f('ost_run_c', 216, 214, 104, 206),
    f('ost_veer', 216, 214, 104, 206),
    f('dust', 124, 62, 62, 56),
    f('tort_walk_a', 104, 64, 52, 58),
    f('tort_walk_b', 104, 64, 52, 58),
    f('tort_hide', 98, 56, 49, 50),
    f('tort_peek', 100, 58, 50, 52),
  ],
  kalahari: [
    f('sb_walk_a', 124, 108, 62, 102),
    f('sb_walk_b', 124, 108, 62, 102),
    f('sb_graze', 124, 84, 62, 78),
    f('sb_alert', 114, 112, 57, 106),
    f('sb_pronk_a', 124, 112, 62, 106),
    f('sb_pronk_b', 124, 112, 62, 106),
  ],
  namibie: [
    f('gb_walk_a', 172, 178, 86, 172),
    f('gb_walk_b', 172, 178, 86, 172),
    f('gb_graze', 172, 134, 86, 128),
    f('gb_alert', 162, 180, 81, 174),
    f('gb_run_a', 182, 172, 91, 166),
    f('gb_run_b', 182, 172, 91, 166),
  ],
};

/** Sheet px a frame takes (rounded up). */
export function cellSize(s: Pick<CameoFrameSpec, 'w' | 'h' | 'res'>): { w: number; h: number } {
  return { w: Math.ceil(s.w * s.res), h: Math.ceil(s.h * s.res) };
}

const GAP = 2;

/** Skyline packing, tallest first (ties keep the table's order): each frame goes where it sits
 *  highest (then leftmost), GAP px from its neighbours and the sheet's edges. */
function pack(area: CameoSheetArea): CameoFrameRect[] {
  const W = CAMEO_SHEET_SIZE[area].w;
  const order = SPECS[area]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => cellSize(b.s).h - cellSize(a.s).h || a.i - b.i);
  const sky = new Array<number>(W).fill(GAP);
  const out: CameoFrameRect[] = [];
  for (const { s } of order) {
    const c = cellSize(s);
    let best: { x: number; y: number } | null = null;
    for (let x = GAP; x + c.w + GAP <= W; x++) {
      let y = 0;
      for (let k = x - GAP; k < x + c.w + GAP; k++) y = Math.max(y, sky[k] ?? 0);
      if (best === null || y < best.y) best = { x, y };
    }
    if (best === null) throw new Error(`cameo sheet ${area}: ${s.name} is wider than the sheet`);
    for (let k = best.x; k < best.x + c.w; k++) sky[k] = best.y + c.h + GAP;
    out.push({ ...s, x: best.x, y: best.y });
  }
  return out;
}

const FRAMES: Readonly<Record<CameoSheetArea, readonly CameoFrameRect[]>> = {
  bushveld: pack('bushveld'),
  karoo: pack('karoo'),
  kalahari: pack('kalahari'),
  namibie: pack('namibie'),
};

export function cameoFrames(area: CameoSheetArea): readonly CameoFrameRect[] {
  return FRAMES[area];
}

export function cameoFrame(area: CameoSheetArea, name: CameoFrame): CameoFrameRect {
  const r = FRAMES[area].find((x) => x.name === name);
  // Safe: every frame name the view asks for is in its area's table (cameoSheet.test.ts).
  if (r === undefined) throw new Error(`no cameo frame ${area}/${name}`);
  return r;
}

/** The frame's rect on the 1× sheet (sheet px). */
export function sheetRect(r: CameoFrameRect): { x: number; y: number; w: number; h: number } {
  return { x: r.x, y: r.y, ...cellSize(r) };
}

/** The packed height of an area's sheet (sheet px). */
export function cameoSheetHeight(area: CameoSheetArea): number {
  return Math.max(...FRAMES[area].map((r) => r.y + cellSize(r).h));
}

/** Each area sheet's GPU cost cap at 1× (bytes, RGBA): 1 MiB (the brief's aim; every sheet here
 *  is well under it, the Okavango has none). */
export const GPU_BYTES_CAP = 1024 * 1024;

/** Texture px per sheet px of a file `width` px wide (1 for the Standard sheet, 2 for HD). */
export function cameoTexelsPerPx(area: CameoSheetArea, width: number): number {
  return Math.max(1, Math.round(width / CAMEO_SHEET_SIZE[area].w));
}
