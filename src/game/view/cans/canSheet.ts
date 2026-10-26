// v1.8 (D-050) Blikkies art: one small shared sheet (texture key CAN_SHEET, in the common group —
// the Karoo is the home map and has a fence) with the four tin cans upright, each with a motion-
// blurred twin for a fast spin, a dent and a bullet hole, a soft ground shadow, and the three kinds
// of fence post. Sizes are design px at plane scale 1 (a can's frame is its hit capsule's size:
// birds.json cans.types). Pure constants and a frame table: the game, the placeholder and the
// interim art generator (tools/art/blikkies.ts) all read them. Sounds reuse common recordings.
import type { CanType } from '../../../content/schemas';

export const CAN_SHEET = 'fx/blikkies';

export const CAN_TYPES: readonly CanType[] = ['food', 'paint', 'bully', 'cooldrink'];

/** Upright can frames: width and height = 2r and 2(r + half) of birds.json (plus a 1 px rim). */
const CAN_BOX: Readonly<Record<CanType, { w: number; h: number }>> = {
  food: { w: 40, h: 60 },
  paint: { w: 44, h: 56 },
  bully: { w: 36, h: 50 },
  cooldrink: { w: 32, h: 58 },
};

/** A post frame's height stands for this many design px of post (scaled to the post's height). */
export const POST_FRAME_H = 120;

export type CanFrame =
  | `can_${CanType}`
  | `can_${CanType}_blur`
  | 'dent'
  | 'hole'
  | 'shadow'
  | 'post_wood'
  | 'post_dropper'
  | 'post_kraal';

export interface CanRect {
  readonly name: CanFrame;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Origin in the frame (cans: their centre; posts: the foot; shadow: its centre). */
  readonly ox: number;
  readonly oy: number;
}

const GAP = 2;

/** The frame table, packed in one row of cans and one of the rest. */
export function canFrames(): CanRect[] {
  const out: CanRect[] = [];
  let x = GAP;
  for (const t of CAN_TYPES) {
    const b = CAN_BOX[t];
    out.push({ name: `can_${t}`, x, y: GAP, w: b.w, h: b.h, ox: b.w / 2, oy: b.h / 2 });
    x += b.w + GAP;
    out.push({ name: `can_${t}_blur`, x, y: GAP, w: b.w, h: b.h, ox: b.w / 2, oy: b.h / 2 });
    x += b.w + GAP;
  }
  const row = GAP + 60 + GAP;
  let x2 = GAP;
  const put = (name: CanFrame, w: number, h: number, ox: number, oy: number): void => {
    out.push({ name, x: x2, y: row, w, h, ox, oy });
    x2 += w + GAP;
  };
  put('post_wood', 22, POST_FRAME_H, 11, POST_FRAME_H);
  put('post_dropper', 14, POST_FRAME_H, 7, POST_FRAME_H);
  put('post_kraal', 26, POST_FRAME_H, 13, POST_FRAME_H);
  put('shadow', 56, 14, 28, 7);
  put('dent', 10, 10, 5, 5);
  put('hole', 8, 8, 4, 4);
  return out;
}

const rows = canFrames();
export const CAN_SHEET_W = Math.max(...rows.map((f) => f.x + f.w)) + GAP;
export const CAN_SHEET_H = Math.max(...rows.map((f) => f.y + f.h)) + GAP;

/** Sounds through the AudioDirector: the common recordings, pitched by the chain. */
export const CAN_SOUNDS = {
  tink: 'sfx/ting',
  knock: 'sfx/clang',
  rattle: 'sfx/thud',
  whistle: 'sfx/whoosh',
} as const;
