// v1.8c (D-063, art bible §5.4) The Harvest's sheet: one texture in the Harvest map's own lazy
// group (`oes`, HD twin `oes-hd`) with every frame the HarvestView draws, all facing right with
// the origin at the feet (the ground contact):
// - the warthogs (an adult drawn WARTHOG_H tall at 1×): trotting with the tail up (4), digging on
//   its knees (2), running (2), the tumble when bagged and lying still;
// - the piglets (PIGLET_H): trotting (2) and running;
// - the three farm workers (WORKER_H to the hat's top, looks 0–2): running in with their tool (2),
//   working (2: hammering, twisting wire, holding a post) and ducking;
// - the fence's gap panel (FENCE_GAP_W wide, drawn 1:1 at the mid layer's px, origin at the
//   bottom centre on the fence's ground line): broken open (gap_0), three repair stages, whole
//   (gap_4); and the "OES" sign (origin at its top hanging point).
// The delivered file is a 2× master (HD shows it at 2 texels per px; Standard gets the pack's 1×).
// Pure constants and a frame table: the game, the placeholder and the interim art generator
// (tools/art/harvest.ts) all read them.
import { HARVEST_BOXES } from './harvestBoxes';
import { HARVEST_SHEET_W } from './harvestKeys';

export { HARVEST_GROUP, HARVEST_SHEET, HARVEST_SHEET_H, HARVEST_SHEET_W } from './harvestKeys';

/** Drawn sizes at 1× (design px): an adult warthog to the top of its back/head, a piglet, a worker
 *  to the hat's top. The view scales each to its plane. */
export const WARTHOG_H = 200;
export const PIGLET_H = 90;
/** Drawn larger than shown on the mid plane (modes.json harvest.workers.heightPx × 0.42 ≈ 113
 *  px), so the 2× master keeps its detail in HD. */
export const WORKER_H = 180;
/** The gap panel: as wide as the gap (2 × its half-width 170) at the mid layer's px, and tall. */
export const FENCE_GAP_W = 340;
export const FENCE_H = 90;
/** v1.8c (review round 1): the mid layer's fence post, drawn height above its ground line (design
 *  px; tools/art/biomes/oes.ts draws them, the gap panel matches). A worker stands ~1.6× it. */
export const FENCE_POST_H = 70;

interface Box {
  readonly w: number;
  readonly h: number;
  /** The feet within the box. */
  readonly ox: number;
  readonly oy: number;
}

export const HARVEST_FRAME_NAMES = [
  'wh_trot_a',
  'wh_trot_b',
  'wh_trot_c',
  'wh_trot_d',
  'wh_dig_a',
  'wh_dig_b',
  'wh_run_a',
  'wh_run_b',
  'wh_tumble',
  'wh_down',
  'pg_trot_a',
  'pg_trot_b',
  'pg_run',
  'wk0_run_a',
  'wk0_run_b',
  'wk0_work_a',
  'wk0_work_b',
  'wk0_duck',
  'wk1_run_a',
  'wk1_run_b',
  'wk1_work_a',
  'wk1_work_b',
  'wk1_duck',
  'wk2_run_a',
  'wk2_run_b',
  'wk2_work_a',
  'wk2_work_b',
  'wk2_duck',
  'gap_0',
  'gap_1',
  'gap_2',
  'gap_3',
  'gap_4',
  'sign_oes',
] as const;

export type HarvestFrame = (typeof HARVEST_FRAME_NAMES)[number];

/** Each frame's box, fitted to its drawing (tools/art/harvestBoxes.ts). */
export const HARVEST_FRAMES = HARVEST_BOXES as unknown as Readonly<Record<HarvestFrame, Box>>;

export interface HarvestRect extends Box {
  readonly name: HarvestFrame;
  readonly x: number;
  readonly y: number;
}

const GAP = 2;

/** Every frame's rect at 1×: shelves, tallest frames first, each frame on the open shelf it
 *  fills best, else a new shelf (as the baboon sheet). */
export function harvestFrames(): HarvestRect[] {
  const out: HarvestRect[] = [];
  const shelves: { y: number; h: number; x: number }[] = [];
  let top = GAP;
  const order = [...HARVEST_FRAME_NAMES].sort(
    (a, b) =>
      HARVEST_FRAMES[b].h - HARVEST_FRAMES[a].h ||
      HARVEST_FRAMES[b].w - HARVEST_FRAMES[a].w ||
      HARVEST_FRAME_NAMES.indexOf(a) - HARVEST_FRAME_NAMES.indexOf(b),
  );
  for (const name of order) {
    const b = HARVEST_FRAMES[name];
    let shelf: (typeof shelves)[number] | null = null;
    for (const s of shelves)
      if (s.h >= b.h && s.x + b.w + GAP <= HARVEST_SHEET_W && (shelf === null || s.x > shelf.x))
        shelf = s;
    if (shelf === null) {
      shelf = { y: top, h: b.h, x: GAP };
      shelves.push(shelf);
      top += b.h + GAP;
    }
    out.push({ name, x: shelf.x, y: shelf.y, ...b });
    shelf.x += b.w + GAP;
  }
  return out;
}

/** Sheet height the frames need (harvestKeys.ts HARVEST_SHEET_H must equal it). */
export function harvestSheetHeight(): number {
  return Math.max(...harvestFrames().map((f) => f.y + f.h)) + GAP;
}

/** Texture px per design px of a sheet whose file is `width` px wide (2: the 2× master). */
export function harvestTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / HARVEST_SHEET_W));
}
