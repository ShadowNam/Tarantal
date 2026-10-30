// D-064 "Christmas in the sun": Christmas's sheet (wrapped presents shut and open with their lids,
// tinsel garlands and baubles for the big tree, a glint, Santa hats in three sizes, a paper-confetti
// puff, Oupa in his Santa hat and shorts) and its sounds. They load in a lazy group of their own
// ("feesdae-christmas") only when the Christmas special starts (or its override): a Halloween
// hunt never downloads them, and a Christmas hunt never downloads Halloween's ("feesdae").
// Pure constants and a frame table: the game, the pack tool and the interim art generator read
// them.

export {
  CHRISTMAS_GROUP,
  CHRISTMAS_SHEET,
  OUPA_DRAWN,
  PRESENT_GROUND_PX,
  XMAS_MASTER,
  XMAS_SOUNDS,
  type XmasSound,
} from './christmasKeys';
import { CHRISTMAS_SHEET, XMAS_SOUNDS } from './christmasKeys';
/** The wraps a present can come in (picked by its id). */
export const PRESENT_WRAPS = ['a', 'b', 'c'] as const;
export type PresentWrap = (typeof PRESENT_WRAPS)[number];

/** A garland frame spans this many px between its two hooks (it is stretched to its anchors). */
export const GARLAND_SPAN_PX = 300;

interface FrameSpec {
  readonly name: XmasFrame;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  /** The plane scale a hat drawing is made for (1 = near). */
  readonly forScale?: number;
}

export type XmasFrame =
  | `present_${PresentWrap}_${'shut' | 'open'}`
  | `lid_${PresentWrap}`
  | 'garland_silver'
  | 'garland_red'
  | 'bauble_red'
  | 'bauble_gold'
  | 'bauble_silver'
  | 'glint'
  | 'confetti'
  | 'hat_l'
  | 'hat_m'
  | 'hat_s'
  | 'oupa'
  | 'oupa_head';

/** A present: the box (100 px tall) under its lid and bow; origin at the box's centre, its foot
 *  PRESENT_GROUND_PX below. */
const PRESENT = { w: 140, h: 182, ox: 70, oy: 130 };
/** The lid with its bow, origin where it sits on the box (its bottom centre). */
const LID = { w: 140, h: 92, ox: 70, oy: 84 };
const BAUBLE = { w: 30, h: 38, ox: 15, oy: 2 };

/** Packed in shelves, tallest first (keeps the sheet's GPU size down: 600 × 710 design px). */
const SPECS: readonly FrameSpec[] = [
  { name: 'oupa', w: 120, h: 210, ox: 55, oy: 206 },
  { name: 'present_a_shut', ...PRESENT },
  { name: 'present_b_shut', ...PRESENT },
  { name: 'present_c_shut', ...PRESENT },
  { name: 'present_a_open', ...PRESENT },
  { name: 'present_b_open', ...PRESENT },
  { name: 'present_c_open', ...PRESENT },
  { name: 'confetti', w: 140, h: 140, ox: 70, oy: 70 },
  { name: 'hat_l', w: 130, h: 120, ox: 65, oy: 104, forScale: 1 },
  { name: 'oupa_head', w: 66, h: 100, ox: 31, oy: 68 },
  { name: 'lid_a', ...LID },
  { name: 'lid_b', ...LID },
  { name: 'lid_c', ...LID },
  { name: 'garland_silver', w: GARLAND_SPAN_PX + 20, h: 90, ox: 10 + GARLAND_SPAN_PX / 2, oy: 14 },
  { name: 'garland_red', w: GARLAND_SPAN_PX + 20, h: 90, ox: 10 + GARLAND_SPAN_PX / 2, oy: 14 },
  { name: 'hat_m', w: 70, h: 64, ox: 35, oy: 55, forScale: 0.5 },
  { name: 'glint', w: 44, h: 44, ox: 22, oy: 22 },
  { name: 'bauble_red', ...BAUBLE },
  { name: 'bauble_gold', ...BAUBLE },
  { name: 'bauble_silver', ...BAUBLE },
  { name: 'hat_s', w: 36, h: 34, ox: 18, oy: 29, forScale: 0.22 },
];

export interface XmasRect {
  readonly name: XmasFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly forScale: number;
}

/** Sheet width in design px (×XMAS_MASTER in texture px). */
export { XMAS_SHEET_W } from './christmasKeys';
import { XMAS_SHEET_W } from './christmasKeys';
const PAD = 4;

/** Every frame of the sheet in design px (×1), packed in shelves in SPECS order. */
export function xmasFrames(): XmasRect[] {
  const out: XmasRect[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  for (const s of SPECS) {
    if (x + s.w > XMAS_SHEET_W) {
      x = 0;
      y += row + PAD;
      row = 0;
    }
    out.push({ ...s, x, y, forScale: s.forScale ?? 1 });
    x += s.w + PAD;
    row = Math.max(row, s.h);
  }
  return out;
}

/** Sheet height in design px. */
export const XMAS_SHEET_H = ((): number => {
  const f = xmasFrames();
  return Math.max(...f.map((r) => r.y + r.h));
})();

/** The Santa hat drawing for a hat shown this wide (design px): the same sizes as the witch
 *  hats, so Halloween's head anchors and widths carry over. */
export function santaHatFrame(widthPx: number): 'hat_l' | 'hat_m' | 'hat_s' {
  return widthPx > 52 ? 'hat_l' : widthPx > 26 ? 'hat_m' : 'hat_s';
}

/** A present's wrap from its id (stable on every device). */
export function wrapOf(id: number): PresentWrap {
  return PRESENT_WRAPS[id % PRESENT_WRAPS.length] ?? 'a';
}

/** A key that belongs to Christmas's group. */
export function isChristmasKey(key: string): boolean {
  return key === CHRISTMAS_SHEET || (Object.values(XMAS_SOUNDS) as string[]).includes(key);
}
