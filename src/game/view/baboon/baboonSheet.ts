// v1.8b (D-062, art bible §5.3) The baboons' sheet: one texture in the late group (after the first
// download; no area chunk grows) holding two sets of frames, both facing right with the origin at
// the feet (a sitting baboon's rump):
// - raider frames, drawn at the mid plane's size (a sitting male 151 px: birds.json
//   baboons.heightPx × planes.mid.scale): walking on all fours (4), running (2), each raid's
//   action (2 each), the tumble when bagged and lying still;
// - ridge frames, drawn at the far plane's size (a sitting male 54 px): sitting, grooming,
//   looking, the lookout's bark, walking, the youngsters' play, a mother with the baby on her
//   back (sitting, walking), climbing down and up. Mothers and youngsters are the same frames
//   drawn smaller (motherScale, juvenileScale) except the mother's own.
// Plus two small things: the fruit a thrower throws and the water from a knocked tap.
// The delivered file is a 2× master (HD shows it at 2 texels per px; Standard gets the pack's 1×).
// Pure constants and a frame table: the game, the placeholder and the interim art generator
// (tools/art/baboons.ts) all read them.
import { BABOON_BOXES } from './baboonBoxes';
import { BABOON_SHEET_W } from './baboonKeys';

export { BABOON_SHEET, BABOON_SHEET_H, BABOON_SHEET_W } from './baboonKeys';

/** The size each set is drawn at: a sitting male's height (design px at 1×). */
export const RAIDER_H = 151;
export const RIDGE_H = 54;

interface Box {
  readonly w: number;
  readonly h: number;
  /** The feet within the box. */
  readonly ox: number;
  readonly oy: number;
}

/** Every frame, raiders (mid plane) first, then the ridge (far plane), then the things (mid). */
export const BABOON_FRAME_NAMES = [
  'walk_a',
  'walk_b',
  'walk_c',
  'walk_d',
  'run_a',
  'run_b',
  'hat_a',
  'hat_b',
  'fruit_a',
  'fruit_b',
  'mielie_a',
  'mielie_b',
  'tap_a',
  'throw_a',
  'throw_b',
  'moon_a',
  'tumble',
  'down',
  'r_sit',
  'r_groom',
  'r_look',
  'r_bark_a',
  'r_bark_b',
  'r_walk_a',
  'r_walk_b',
  'r_play_a',
  'r_play_b',
  'r_mother_sit',
  'r_mother_walk_a',
  'r_mother_walk_b',
  'r_down',
  'r_up',
  'fx_fruit',
  'fx_water',
] as const;

export type BaboonFrame = (typeof BABOON_FRAME_NAMES)[number];

/** Each frame's box, fitted to its drawing (tools/art/baboonBoxes.ts). */
export const BABOON_FRAMES: Readonly<Record<BaboonFrame, Box>> = BABOON_BOXES;

export interface BaboonRect extends Box {
  readonly name: BaboonFrame;
  readonly x: number;
  readonly y: number;
}

const GAP = 2;

/** Every frame's rect at 1×: shelves, tallest frames first, each frame on the open shelf it
 *  fills best (tall enough, least room left), else a new shelf. */
export function baboonFrames(): BaboonRect[] {
  const out: BaboonRect[] = [];
  const shelves: { y: number; h: number; x: number }[] = [];
  let top = GAP;
  const order = [...BABOON_FRAME_NAMES].sort(
    (a, b) =>
      BABOON_FRAMES[b].h - BABOON_FRAMES[a].h ||
      BABOON_FRAMES[b].w - BABOON_FRAMES[a].w ||
      BABOON_FRAME_NAMES.indexOf(a) - BABOON_FRAME_NAMES.indexOf(b),
  );
  for (const name of order) {
    const b = BABOON_FRAMES[name];
    let shelf: (typeof shelves)[number] | null = null;
    for (const s of shelves)
      if (s.h >= b.h && s.x + b.w + GAP <= BABOON_SHEET_W && (shelf === null || s.x > shelf.x))
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

/** Sheet height the frames need (baboonKeys.ts BABOON_SHEET_H must equal it). */
export function baboonSheetHeight(): number {
  return Math.max(...baboonFrames().map((f) => f.y + f.h)) + GAP;
}

/** Texture px per design px of a sheet whose file is `width` px wide (2: the 2× master). */
export function baboonTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / BABOON_SHEET_W));
}
