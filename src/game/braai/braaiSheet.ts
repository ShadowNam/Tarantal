// v1.11 (D-068, art bible §6.1) Die Braai's frame table: Oupa in his camp chair (three poses: at
// rest with his mug, a sip, poking the coals) and his poker, two vastrap frames (mirrored for the
// other foot), four flame frames, the hearth (stones, coals, the grid and the coffee pot), the
// fire's glow, three spark frames, a star tile, the Milky Way's band, the Southern Cross with its
// pointers, the bakkie's silhouette. Soft or repeating frames are authored at half or quarter
// size and drawn larger (`res`), so the 1× sheet stays inside GPU_BYTES_CAP. Packed in shelves,
// tallest first, 2 px apart. Pure: the game, the art generator and the tests read it.
import { BRAAI_SHEET_W } from './braaiKeys';

export { BRAAI_SHEET, BRAAI_SHEET_H, BRAAI_SHEET_W } from './braaiKeys';

export const FLAME_FRAMES = 4;
export const SPARK_FRAMES = 3;

export type BraaiFrame =
  | 'sit_idle'
  | 'sit_sip'
  | 'sit_poke'
  | 'poker'
  | 'dance_a'
  | 'dance_b'
  | `flame_${number}`
  | 'hearth'
  | 'glow'
  | `spark_${number}`
  | 'stars'
  | 'milky'
  | 'cross'
  | 'bakkie';

interface FrameSpec {
  readonly name: BraaiFrame;
  /** Size as drawn (design px); on the sheet w × res by h × res. */
  readonly w: number;
  readonly h: number;
  /** The origin inside the frame (design px): a figure's feet, the fire's base, a star's middle. */
  readonly ox: number;
  readonly oy: number;
  /** Sheet px per design px: 1, 0.5 or 0.25. */
  readonly res: number;
}

export interface BraaiFrameRect extends FrameSpec {
  /** Its corner on the 1× sheet (sheet px). */
  readonly x: number;
  readonly y: number;
}

/** Oupa seated: his feet at the origin, the chair's back legs behind him (design px). */
export const SEATED = { w: 128, h: 182, ox: 60, oy: 178 } as const;
/** Oupa dancing: centred on his feet (the frames mirror round the origin). */
export const DANCING = { w: 108, h: 200, ox: 54, oy: 196 } as const;
/** A flame frame: the fire's base at the origin. */
export const FLAME = { w: 56, h: 82, ox: 28, oy: 78 } as const;
/** The hearth: the fire's base at the origin (stones round it, the grid above the coals). */
export const HEARTH = { w: 150, h: 50, ox: 75, oy: 36 } as const;
/** Where the hand of the poking pose holds the poker, from Oupa's feet (design px). */
export const POKE_HAND = { x: 56, y: -66 } as const;
/** The poker: held at its origin, pointing right (rotated by the view toward the coals). */
export const POKER = { w: 104, h: 10, ox: 4, oy: 5 } as const;
/** The star tile repeats (its stars wrap at the edges). */
export const STAR_TILE = 192;

const SPECS: readonly FrameSpec[] = [
  { name: 'dance_a', ...DANCING, res: 1 },
  { name: 'dance_b', ...DANCING, res: 1 },
  { name: 'sit_idle', ...SEATED, res: 1 },
  { name: 'sit_sip', ...SEATED, res: 1 },
  { name: 'sit_poke', ...SEATED, res: 1 },
  { name: 'stars', w: STAR_TILE, h: STAR_TILE, ox: 0, oy: 0, res: 0.5 },
  ...Array.from({ length: FLAME_FRAMES }, (_, i) => ({
    name: `flame_${i}` as BraaiFrame,
    ...FLAME,
    res: 1,
  })),
  { name: 'cross', w: 64, h: 76, ox: 32, oy: 38, res: 1 },
  { name: 'glow', w: 320, h: 180, ox: 160, oy: 120, res: 0.25 },
  ...Array.from({ length: SPARK_FRAMES }, (_, i) => ({
    name: `spark_${i}` as BraaiFrame,
    w: 80,
    h: 150,
    ox: 40,
    oy: 146,
    res: 0.5,
  })),
  { name: 'milky', w: 720, h: 220, ox: 360, oy: 110, res: 0.25 },
  { name: 'bakkie', w: 320, h: 124, ox: 160, oy: 120, res: 0.5 },
  { name: 'hearth', ...HEARTH, res: 1 },
  { name: 'poker', ...POKER, res: 1 },
];

/** Sheet px a frame takes (rounded up). */
export function cellSize(f: Pick<FrameSpec, 'w' | 'h' | 'res'>): { w: number; h: number } {
  return { w: Math.ceil(f.w * f.res), h: Math.ceil(f.h * f.res) };
}

const GAP = 2;

/** Skyline packing, tallest first (ties keep the table's order): each frame goes where it sits
 *  highest (then leftmost), GAP px from its neighbours and the sheet's edges. */
function pack(): BraaiFrameRect[] {
  const order = SPECS.map((s, i) => ({ s, i })).sort(
    (a, b) => cellSize(b.s).h - cellSize(a.s).h || a.i - b.i,
  );
  const sky = new Array<number>(BRAAI_SHEET_W).fill(GAP);
  const out: BraaiFrameRect[] = [];
  for (const { s } of order) {
    const c = cellSize(s);
    let best: { x: number; y: number } | null = null;
    for (let x = GAP; x + c.w + GAP <= BRAAI_SHEET_W; x++) {
      let y = 0;
      for (let k = x - GAP; k < x + c.w + GAP; k++) y = Math.max(y, sky[k] ?? 0);
      if (best === null || y < best.y) best = { x, y };
    }
    if (best === null) throw new Error(`braai sheet: ${s.name} is wider than the sheet`);
    for (let k = best.x; k < best.x + c.w; k++) sky[k] = best.y + c.h + GAP;
    out.push({ ...s, x: best.x, y: best.y });
  }
  return out;
}

const FRAMES = pack();
const BY_NAME = new Map(FRAMES.map((f) => [f.name, f]));

export function braaiFrames(): readonly BraaiFrameRect[] {
  return FRAMES;
}

export function braaiFrame(name: BraaiFrame): BraaiFrameRect | undefined {
  return BY_NAME.get(name);
}

/** The frame's rect on the 1× sheet (sheet px). */
export function sheetRect(f: BraaiFrameRect): { x: number; y: number; w: number; h: number } {
  return { x: f.x, y: f.y, ...cellSize(f) };
}

export function braaiSheetHeight(): number {
  return Math.max(...FRAMES.map((f) => f.y + cellSize(f).h));
}
export function braaiSheetWidth(): number {
  return Math.max(...FRAMES.map((f) => f.x + cellSize(f).w));
}

/** The sheet's GPU cost cap at 1× (bytes, RGBA): inside the Okavango Reënbui HD headroom. */
export const GPU_BYTES_CAP = 512 * 432 * 4;

/** Texture px per sheet px of a file `width` px wide (1 for the Standard sheet, 2 for HD). */
export function braaiTexelsPerPx(width: number): number {
  return Math.max(1, Math.round(width / BRAAI_SHEET_W));
}

export const flameFrame = (i: number): BraaiFrame =>
  `flame_${((i % FLAME_FRAMES) + FLAME_FRAMES) % FLAME_FRAMES}`;
export const sparkFrame = (i: number): BraaiFrame =>
  `spark_${((i % SPARK_FRAMES) + SPARK_FRAMES) % SPARK_FRAMES}`;
