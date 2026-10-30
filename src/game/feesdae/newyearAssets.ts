// D-065 the New Year countdown: its sheet (small striped party hats in three sizes, Oupa in a
// party hat with a party blower, his head alone, the fireworks' spark and the stars' dot, two
// curled streamers and a little burst for the tally frame) and its sounds. They load in a lazy
// group of their own ("feesdae-newyear") only when the New Year special starts (or its
// override): a Halloween or Christmas hunt never downloads them, and the other way round.
// Standard in HD from the start (D-064/D-065: no HD twin; the Okavango leaves only ~2 MB of HD
// texture memory): the sheet is ~400 × 400 px, ~0.6 MB on the GPU.
// Pure constants and a frame table: the game, the pack tool and the interim art generator read
// them.

export {
  NEWYEAR_GROUP,
  NEWYEAR_SHEET,
  NY_MASTER,
  NY_SHEET_W,
  NY_SOUNDS,
  type NySound,
} from './newyearKeys';
import { NEWYEAR_SHEET, NY_SHEET_W, NY_SOUNDS } from './newyearKeys';

export type NyFrame =
  | 'oupa'
  | 'oupa_head'
  | 'hat_l'
  | 'hat_m'
  | 'hat_s'
  | 'spark'
  | 'streak'
  | 'star'
  | 'streamer_a'
  | 'streamer_b'
  | 'burst';

interface FrameSpec {
  readonly name: NyFrame;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  /** The plane scale a hat drawing is made for (1 = near). */
  readonly forScale?: number;
}

/** Packed in shelves, tallest first. Oupa's frames match Christmas's (badgeOupaRect, the slate). */
const SPECS: readonly FrameSpec[] = [
  { name: 'oupa', w: 120, h: 210, ox: 55, oy: 206 },
  { name: 'hat_l', w: 90, h: 120, ox: 45, oy: 108, forScale: 1 },
  { name: 'burst', w: 110, h: 110, ox: 55, oy: 55 },
  { name: 'oupa_head', w: 66, h: 100, ox: 31, oy: 68 },
  { name: 'streamer_a', w: 250, h: 70, ox: 125, oy: 12 },
  { name: 'streamer_b', w: 250, h: 70, ox: 125, oy: 12 },
  { name: 'hat_m', w: 50, h: 66, ox: 25, oy: 59, forScale: 0.5 },
  { name: 'hat_s', w: 28, h: 36, ox: 14, oy: 31, forScale: 0.22 },
  { name: 'spark', w: 16, h: 16, ox: 8, oy: 8 },
  // D-065 second pass: a spark's streak, the bright head at the origin, its tail behind (left).
  { name: 'streak', w: 40, h: 10, ox: 34, oy: 5 },
  { name: 'star', w: 12, h: 12, ox: 6, oy: 6 },
];

export interface NyRect {
  readonly name: NyFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly forScale: number;
}

const PAD = 4;

/**
 * Every frame of the sheet in design px (×1): first-fit shelves — each frame (the SPECS order)
 * goes on the first shelf tall enough with room left, else on a new shelf.
 */
export function nyFrames(): NyRect[] {
  const out: NyRect[] = [];
  const shelves: { y: number; h: number; x: number }[] = [];
  for (const s of SPECS) {
    let shelf = shelves.find((sh) => sh.h >= s.h && sh.x + s.w <= NY_SHEET_W);
    if (shelf === undefined) {
      const last = shelves[shelves.length - 1];
      shelf = { y: last === undefined ? 0 : last.y + last.h + PAD, h: s.h, x: 0 };
      shelves.push(shelf);
    }
    out.push({ ...s, x: shelf.x, y: shelf.y, forScale: s.forScale ?? 1 });
    shelf.x += s.w + PAD;
  }
  return out;
}

/** Sheet height in design px. */
export const NY_SHEET_H = ((): number => {
  const f = nyFrames();
  return Math.max(...f.map((r) => r.y + r.h));
})();

/** The party hat drawing for a hat shown this wide (design px): the witch and Santa hats' sizes,
 *  so their head anchors and widths carry over. */
export function partyHatFrame(widthPx: number): 'hat_l' | 'hat_m' | 'hat_s' {
  return widthPx > 52 ? 'hat_l' : widthPx > 26 ? 'hat_m' : 'hat_s';
}

/** A key that belongs to New Year's group. */
export function isNewYearKey(key: string): boolean {
  return key === NEWYEAR_SHEET || (Object.values(NY_SOUNDS) as string[]).includes(key);
}
