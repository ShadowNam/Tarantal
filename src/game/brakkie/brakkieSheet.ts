// v1.12 (D-069, art bible §5.6) Brakkie's frame table: a Jack Russell (white with tan patches)
// facing right with the origin at his feet — trotting (2), running (2), sitting, the title's wag
// (2), lying, sniffing, barking, digging, the startled yelp — and the guineafowl he carries (its
// own small frame, held at the running frames' mouth). Every frame is authored at half size and
// drawn ×2 (`res` 0.5; his own frames 0.675 since D-080, for his true size), so the 1× sheet stays
// inside GPU_BYTES_CAP (lessons 29, 38). Packed in a
// skyline, tallest first, 2 px apart. Pure: the game, the art generator and the tests read it.
import { BRAKKIE_SHEET_H, BRAKKIE_SHEET_W } from './brakkieKeys';

export { BRAKKIE_SHEET, BRAKKIE_SHEET_H, BRAKKIE_SHEET_W } from './brakkieKeys';

export type BrakkieFrame =
  | 'trot_a'
  | 'trot_b'
  | 'trot_c'
  | 'trot_d'
  | 'run_a'
  | 'run_b'
  | 'run_c'
  | 'run_d'
  | 'sit'
  | 'wag_a'
  | 'lie'
  | 'sniff'
  | 'bark'
  | 'dig'
  | 'yelp'
  | 'bird'
  // v1.17 (D-079): the point (freeze, quiver), the proud hop (crouch, up), the head tilt, and
  // the marker where the pointed flock sits (a rustling tuft with a small white chevron).
  | 'point_a'
  | 'point_b'
  | 'proud_a'
  | 'proud_b'
  | 'tilt'
  | 'marker';

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

/**
 * v1.17b (D-080): his frames are shown at brakkie.json sizeMul (1.35, a true Jack Russell), so they
 * are drawn at 0.5 × that sheet px per design px of the box — 0.5 per drawn px in Standard, 1.0 in
 * the HD twin (animalDensity.test.ts). Redrawn from the vector shapes, never scaled up. The bird he
 * carries and the point's marker keep their size (0.5).
 */
export const BRAKKIE_DRAWN_MUL = 1.35;
const DOG_RES = 0.5 * BRAKKIE_DRAWN_MUL;

/** Each frame's box, fitted to its drawing with a 6 px margin on every side (lesson 12; the art
 *  test checks the fit). */
const SPECS: readonly FrameSpec[] = [
  { name: 'trot_a', w: 222, h: 167, ox: 88, oy: 155, res: DOG_RES },
  { name: 'trot_b', w: 225, h: 169, ox: 91, oy: 157, res: DOG_RES },
  { name: 'run_a', w: 266, h: 134, ox: 126, oy: 128, res: DOG_RES },
  { name: 'run_b', w: 235, h: 141, ox: 99, oy: 131, res: DOG_RES },
  { name: 'trot_c', w: 220, h: 169, ox: 86, oy: 158, res: DOG_RES },
  { name: 'trot_d', w: 227, h: 169, ox: 93, oy: 158, res: DOG_RES },
  { name: 'run_c', w: 245, h: 146, ox: 105, oy: 137, res: DOG_RES },
  { name: 'run_d', w: 241, h: 142, ox: 103, oy: 133, res: DOG_RES },
  { name: 'sit', w: 150, h: 185, ox: 70, oy: 173, res: DOG_RES },
  { name: 'wag_a', w: 157, h: 185, ox: 77, oy: 173, res: DOG_RES },
  { name: 'lie', w: 233, h: 100, ox: 111, oy: 89, res: DOG_RES },
  { name: 'sniff', w: 209, h: 144, ox: 86, oy: 132, res: DOG_RES },
  { name: 'bark', w: 220, h: 182, ox: 87, oy: 171, res: DOG_RES },
  { name: 'dig', w: 201, h: 153, ox: 89, oy: 141, res: DOG_RES },
  { name: 'yelp', w: 206, h: 157, ox: 87, oy: 145, res: DOG_RES },
  { name: 'bird', w: 94, h: 68, ox: 14, oy: 6, res: 0.5 },
  { name: 'point_a', w: 226, h: 131, ox: 88, oy: 119, res: DOG_RES },
  { name: 'point_b', w: 226, h: 132, ox: 88, oy: 120, res: DOG_RES },
  { name: 'proud_a', w: 235, h: 157, ox: 100, oy: 145, res: DOG_RES },
  { name: 'proud_b', w: 212, h: 201, ox: 97, oy: 190, res: DOG_RES },
  { name: 'tilt', w: 148, h: 177, ox: 70, oy: 165, res: DOG_RES },
  { name: 'marker', w: 76, h: 93, ox: 35, oy: 84, res: 0.5 },
];

/** Where his mouth is in the running frames (design px from his feet, facing right): the bird's
 *  origin when he carries one. */
export const MOUTH: Readonly<
  Record<'run_a' | 'run_b' | 'run_c' | 'run_d', { x: number; y: number }>
> = {
  run_a: { x: 116, y: -76 },
  run_b: { x: 112, y: -74 },
  run_c: { x: 116, y: -82 },
  run_d: { x: 114, y: -78 },
};

/** Sheet px a frame takes (rounded up). */
export function cellSize(f: Pick<FrameSpec, 'w' | 'h' | 'res'>): { w: number; h: number } {
  return { w: Math.ceil(f.w * f.res), h: Math.ceil(f.h * f.res) };
}

const GAP = 2;

/** Skyline packing, tallest first (ties keep the table's order): each frame goes where it sits
 *  highest (then leftmost), GAP px from its neighbours and the sheet's edges. */
function pack(W = BRAKKIE_SHEET_W): BrakkieFrameRect[] {
  const order = SPECS.map((s, i) => ({ s, i })).sort(
    (a, b) => cellSize(b.s).h - cellSize(a.s).h || a.i - b.i,
  );
  const sky = new Array<number>(W).fill(GAP);
  const out: BrakkieFrameRect[] = [];
  for (const { s } of order) {
    const c = cellSize(s);
    let best: { x: number; y: number } | null = null;
    for (let x = GAP; x + c.w + GAP <= W; x++) {
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

/** The packed height on a sheet `w` wide (tools: choosing BRAKKIE_SHEET_W/H). */
export function brakkiePackHeight(w: number): number {
  return Math.max(...pack(w).map((f) => f.y + cellSize(f).h)) + GAP;
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

/** The sheet's GPU cost cap at 1× (bytes, RGBA; the HD twin is 4×): v1.17 0.875 MiB; v1.17b
 *  (D-080) 1.5 MiB for his true-size frames (1.47 MiB; HD 5.88, with room made in Namibië's HD
 *  hunt; his HD twin also loads only under feel.brakkie.hd's budget). */
export const GPU_BYTES_CAP = 1.5 * 1024 * 1024;

/** Texture px per sheet px of a file `width` px wide (1 for the Standard sheet, 2 for HD). */
export function brakkieTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / BRAKKIE_SHEET_W));
}

/** Unused height check for the tests: the packed sheet fits its declared size. */
export const SHEET_SIZE = { w: BRAKKIE_SHEET_W, h: BRAKKIE_SHEET_H } as const;
