// v1.18 (D-081, art bible §5.4) The Harvest's Phase 2 sheet: a second, small texture in the
// Harvest map's own lazy group (`oes`) with the frames the raid's way in and Phase 2 add, facing
// right with the origin at the feet (the ground contact):
// - a warthog's jump over the fence (rising, landing: WARTHOG_H) and a yearling's or a piglet's
//   squeeze under it (head down, pushing through: WARTHOG_H, PIGLET_H);
// - a baboon climbing a fence post (two frames, head up) and dropping off it (BABOON_H: the
//   baboon sheet's raider size);
// - the small hole's patch (new mesh and a stone, drawn 1:1 at the mid layer's px, origin at the
//   bottom centre on the fence's ground line).
// No HD twin (hdPack.ts STANDARD_IN_HD_KEYS): drawn at 1 texture px per drawn px, which is
// ≥ 0.86 texture px per px on screen at the animals' true size (animalDensity.test.ts) — and
// keeps the Harvest's HD hunt, the tightest, under 256 MB.
import { HARVEST2_BOXES } from './harvest2Boxes';
import { HARVEST2_SHEET_W } from './harvest2Keys';

export { HARVEST2_SHEET, HARVEST2_SHEET_H, HARVEST2_SHEET_W } from './harvest2Keys';

/** A sitting male baboon's drawn height (the baboon sheet's RAIDER_H). */
export const BABOON2_H = 151;

interface Box {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
}

export const HARVEST2_FRAME_NAMES = [
  'wh_jump_a',
  'wh_jump_b',
  'wh_squeeze',
  'pg_squeeze',
  'bb_climb_a',
  'bb_climb_b',
  'bb_drop',
  'hole_patch',
] as const;

export type Harvest2Frame = (typeof HARVEST2_FRAME_NAMES)[number];

/** Each frame's box, fitted to its drawing (tools/art/harvest2Boxes.ts). */
export const HARVEST2_FRAMES = HARVEST2_BOXES as unknown as Readonly<Record<Harvest2Frame, Box>>;

export interface Harvest2Rect extends Box {
  readonly name: Harvest2Frame;
  readonly x: number;
  readonly y: number;
}

const GAP = 2;

/** Every frame's rect at 1× (shelves, tallest first, as the Harvest sheet). */
export function harvest2Frames(): Harvest2Rect[] {
  const out: Harvest2Rect[] = [];
  const shelves: { y: number; h: number; x: number }[] = [];
  let top = GAP;
  const order = [...HARVEST2_FRAME_NAMES].sort(
    (a, b) =>
      HARVEST2_FRAMES[b].h - HARVEST2_FRAMES[a].h ||
      HARVEST2_FRAMES[b].w - HARVEST2_FRAMES[a].w ||
      HARVEST2_FRAME_NAMES.indexOf(a) - HARVEST2_FRAME_NAMES.indexOf(b),
  );
  for (const name of order) {
    const b = HARVEST2_FRAMES[name];
    let shelf: (typeof shelves)[number] | null = null;
    for (const s of shelves)
      if (s.h >= b.h && s.x + b.w + GAP <= HARVEST2_SHEET_W && (shelf === null || s.x > shelf.x))
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

/** Sheet height the frames need (harvest2Keys.ts HARVEST2_SHEET_H must equal it). */
export function harvest2SheetHeight(): number {
  return Math.max(...harvest2Frames().map((f) => f.y + f.h)) + GAP;
}

/** Texture px per design px of a sheet whose file is `width` px wide (1: the delivered file). */
export function harvest2TexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / HARVEST2_SHEET_W));
}
