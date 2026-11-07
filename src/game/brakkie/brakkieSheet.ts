// v1.12 (D-069, art bible §5.6) Brakkie's frame table: a Jack Russell (white with tan patches)
// facing right with the origin at his feet — trotting (2), running (2), sitting, the title's wag
// (2), lying, sniffing, barking, digging, the startled yelp — and the guineafowl he carries (its
// own small frame, held at the running frames' mouth). Every frame is authored at half size and
// drawn ×2 (`res` 0.5), so the 1× sheet stays inside GPU_BYTES_CAP (lessons 29, 38). Packed in a
// skyline, tallest first, 2 px apart. Pure: the game, the art generator and the tests read it.
import { BRAKKIE_SHEET_H, BRAKKIE_SHEET_W } from './brakkieKeys';

export { BRAKKIE_SHEET, BRAKKIE_SHEET_H, BRAKKIE_SHEET_W } from './brakkieKeys';

export type BrakkieFrame =
  | 'trot_a'
  | 'trot_b'
  | 'run_a'
  | 'run_b'
  | 'sit'
  | 'wag_a'
  | 'lie'
  | 'sniff'
  | 'bark'
  | 'dig'
  | 'yelp'
  | 'bird';

interface FrameSpec {
  readonly name: BrakkieFrame;
  /** Size as drawn (design px at the near plane's scale); on the sheet w × res by h × res. */
  readonly w: number;
  readonly h: number;
  /** His feet inside the frame (design px): the origin the view places on the ground. The bird:
   *  where his mouth holds it. */
  readonly ox: number;
  readonly oy: number;
  /** Sheet px per design px. */
  readonly res: number;
}

export interface BrakkieFrameRect extends FrameSpec {
  /** Its corner on the 1× sheet (sheet px). */
  readonly x: number;
  readonly y: number;
}

/** Each frame's box, fitted to its drawing with a 6 px margin on every side (lesson 12; the art
 *  test checks the fit). */
const SPECS: readonly FrameSpec[] = [
  { name: 'trot_a', w: 228, h: 169, ox: 95, oy: 158, res: 0.5 },
  { name: 'trot_b', w: 228, h: 169, ox: 95, oy: 158, res: 0.5 },
  { name: 'run_a', w: 265, h: 143, ox: 126, oy: 134, res: 0.5 },
  { name: 'run_b', w: 265, h: 143, ox: 126, oy: 134, res: 0.5 },
  { name: 'sit', w: 167, h: 181, ox: 88, oy: 170, res: 0.5 },
  { name: 'wag_a', w: 167, h: 181, ox: 88, oy: 170, res: 0.5 },
  { name: 'lie', w: 243, h: 95, ox: 122, oy: 86, res: 0.5 },
  { name: 'sniff', w: 208, h: 159, ox: 86, oy: 148, res: 0.5 },
  { name: 'bark', w: 218, h: 179, ox: 88, oy: 168, res: 0.5 },
  { name: 'dig', w: 201, h: 165, ox: 90, oy: 154, res: 0.5 },
  { name: 'yelp', w: 205, h: 156, ox: 87, oy: 145, res: 0.5 },
  { name: 'bird', w: 94, h: 68, ox: 14, oy: 6, res: 0.5 },
];

/** Where his mouth is in the running frames (design px from his feet, facing right): the bird's
 *  origin when he carries one. */
export const MOUTH: Readonly<Record<'run_a' | 'run_b', { x: number; y: number }>> = {
  run_a: { x: 116, y: -76 },
  run_b: { x: 112, y: -74 },
};

/** Sheet px a frame takes (rounded up). */
export function cellSize(f: Pick<FrameSpec, 'w' | 'h' | 'res'>): { w: number; h: number } {
  return { w: Math.ceil(f.w * f.res), h: Math.ceil(f.h * f.res) };
}

const GAP = 2;

/** Skyline packing, tallest first (ties keep the table's order): each frame goes where it sits
 *  highest (then leftmost), GAP px from its neighbours and the sheet's edges. */
function pack(): BrakkieFrameRect[] {
  const order = SPECS.map((s, i) => ({ s, i })).sort(
    (a, b) => cellSize(b.s).h - cellSize(a.s).h || a.i - b.i,
  );
  const sky = new Array<number>(BRAKKIE_SHEET_W).fill(GAP);
  const out: BrakkieFrameRect[] = [];
  for (const { s } of order) {
    const c = cellSize(s);
    let best: { x: number; y: number } | null = null;
    for (let x = GAP; x + c.w + GAP <= BRAKKIE_SHEET_W; x++) {
      let y = 0;
      for (let k = x - GAP; k < x + c.w + GAP; k++) y = Math.max(y, sky[k] ?? 0);
      if (best === null || y < best.y) best = { x, y };
    }
    if (best === null) throw new Error(`brakkie sheet: ${s.name} is wider than the sheet`);
    for (let k = best.x; k < best.x + c.w; k++) sky[k] = best.y + c.h + GAP;
    out.push({ ...s, x: best.x, y: best.y });
  }
  return out;
}

const FRAMES = pack();
const BY_NAME = new Map(FRAMES.map((f) => [f.name, f]));

export function brakkieFrames(): readonly BrakkieFrameRect[] {
  return FRAMES;
}

export function brakkieFrame(name: BrakkieFrame): BrakkieFrameRect {
  const f = BY_NAME.get(name);
  // Safe: every BrakkieFrame is in SPECS (brakkieSheet.test.ts).
  if (f === undefined) throw new Error(`no brakkie frame ${name}`);
  return f;
}

/** The frame's rect on the 1× sheet (sheet px). */
export function sheetRect(f: BrakkieFrameRect): { x: number; y: number; w: number; h: number } {
  return { x: f.x, y: f.y, ...cellSize(f) };
}

export function brakkieSheetHeight(): number {
  return Math.max(...FRAMES.map((f) => f.y + cellSize(f).h));
}

/** The sheet's GPU cost cap at 1× (bytes, RGBA): 0.5 MiB, inside the Okavango Reënbui HD hunt's
 *  headroom (254.8 + 0.5 = 255.3 of 256 MB, D-069). */
export const GPU_BYTES_CAP = 512 * 256 * 4;

/** Texture px per sheet px of a file `width` px wide (1 for the Standard sheet, 2 for HD). */
export function brakkieTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / BRAKKIE_SHEET_W));
}

/** Unused height check for the tests: the packed sheet fits its declared size. */
export const SHEET_SIZE = { w: BRAKKIE_SHEET_W, h: BRAKKIE_SHEET_H } as const;
