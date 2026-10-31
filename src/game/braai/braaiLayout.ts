// v1.11 (D-068): where the braai's pieces go round the tally slate (design px). Pure. Oupa and his
// fire sit in the column left of the slate under the story bubble, feet on the ground near the
// bottom of the safe area, sized to the column (lesson 25: laid out against every rect, never
// fixed offsets); when the column can't hold them (4:3) they are left out and the sky, the
// horizon and the bakkie still show. The bakkie stands in the right column (behind the slate if
// the column is narrow: it is scenery), the Southern Cross above it, the Milky Way across the sky.
import type { Rect } from '../ui/hudLayout';
import { DANCING, HEARTH, SEATED } from './braaiSheet';

export interface BraaiLayoutIn {
  readonly width: number;
  readonly height: number;
  /** The safe area (design px). */
  readonly safe: Rect;
  /** The slate with its wooden edge. */
  readonly panel: Rect;
  /** The story bubble's slot (tallyBarkSlot). */
  readonly slot: Rect;
  /** Every other rect on the tally (buttons, tag, toast, the special frame's pieces). */
  readonly avoid: readonly Rect[];
  /** The slate's own content the story bubble keeps clear of (title, score, rows, stamp, news). */
  readonly content?: readonly Rect[];
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BraaiLayout {
  /** Oupa's and the fire's scale (design px per art px), 0 when they are left out. */
  readonly scale: number;
  /** Where the ground meets the sky. */
  readonly horizonY: number;
  /** Oupa's feet, or null when the column can't hold him. */
  readonly oupa: Point | null;
  /** The fire's base (the hearth's origin), or null. */
  readonly fire: Point | null;
  /** The bakkie's wheels' line and its scale. */
  readonly bakkie: Point & { readonly scale: number };
  readonly cross: Point;
  readonly milky: Point & { readonly rotation: number; readonly scaleX: number };
  /** Oupa (seated and dancing) and the fire with its flames (null when left out). */
  readonly oupaRect: Rect | null;
  readonly fireRect: Rect | null;
  /** Oupa's story bubble: just above his head when he shows (else the tally's bubble slot). */
  readonly storySlot: Rect;
}

/** The fire's base is this far right of Oupa's feet (art px). */
export const FIRE_DX = 150;
/** Art px the group spans left of his feet (the chair) and right of the fire's base. */
const LEFT = SEATED.ox;
const RIGHT = HEARTH.w - HEARTH.ox;
const GROUP_W = LEFT + FIRE_DX + RIGHT;
/** Art px above his feet: the dance (taller than the chair). */
const GROUP_H = Math.max(DANCING.oy, SEATED.oy);
/** The flames rise this far above the fire's base (art px). */
const FIRE_UP = 86;
const MAX_SCALE = 1.5;
/** x per y of the Milky Way's band (its rotation −1.15 rad): 1 / tan(1.15). */
const MILKY_RISE = 1 / Math.tan(1.15);
const MIN_SCALE = 0.8;
const GAP = 16;

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function groupRects(feet: Point, s: number): { oupa: Rect; fire: Rect } {
  const fx = feet.x + FIRE_DX * s;
  return {
    oupa: {
      x: feet.x - Math.max(LEFT, DANCING.ox) * s,
      y: feet.y - GROUP_H * s,
      w: (Math.max(LEFT, DANCING.ox) + Math.max(SEATED.w - SEATED.ox, DANCING.w - DANCING.ox)) * s,
      h: GROUP_H * s,
    },
    fire: {
      x: fx - HEARTH.ox * s,
      y: feet.y - FIRE_UP * s,
      w: HEARTH.w * s,
      h: (FIRE_UP + HEARTH.h - HEARTH.oy) * s,
    },
  };
}

/** The story bubble's smallest useful size (its name row and two lines of text). */
const BUBBLE_MIN = { w: 240, h: 100 } as const;
/** Its tallest (above Oupa in the column). */
const BUBBLE_MAX_H = 200;

/**
 * Oupa's story bubble, laid out against every rect (lessons 25/31): the first of these that keeps
 * clear of the buttons and frame pieces (`avoid`) and the slate's content — above Oupa in the left
 * column; the tally's own bark slot; the slate's top-right corner beside the title (below [Share]
 * when it is there); the top-left corner (below the tag). If none is clear of the content, the
 * first clear of the buttons; the tally's slot as the last resort.
 */
export function storySlot(i: BraaiLayoutIn, oupa: Rect | null, avoid: readonly Rect[]): Rect {
  const { slot, panel, safe } = i;
  const content = i.content ?? [];
  const gap = 10;
  const cands: Rect[] = [];
  if (oupa !== null) {
    const x = safe.x + 16;
    const w = Math.min(400, panel.x - 16 - x);
    const bottom = oupa.y - 8;
    const h = Math.min(BUBBLE_MAX_H, bottom - (safe.y + 16));
    if (w >= BUBBLE_MIN.w && h >= BUBBLE_MIN.h) cands.push({ x, y: bottom - h, w, h });
  }
  cands.push(slot);
  // The slate's top corners: from the title's edge to the slate's, from the top (or below a
  // button or tag there) down to the first content below.
  const inner = { x: panel.x + 14, y: panel.y + 14, w: panel.w - 28, h: panel.h - 28 };
  const title = content[0];
  for (const side of ['right', 'left'] as const) {
    const x0 =
      side === 'right'
        ? (title === undefined ? inner.x + inner.w / 2 : title.x + title.w) + gap
        : inner.x + gap;
    const x1 =
      side === 'right'
        ? inner.x + inner.w - gap
        : (title === undefined ? inner.x + inner.w / 2 : title.x) - gap;
    let y0 = inner.y + gap;
    for (const b of avoid)
      if (b.x < x1 && b.x + b.w > x0 && b.y < y0 + BUBBLE_MIN.h && b.y + b.h > y0)
        y0 = Math.max(y0, b.y + b.h + gap);
    let y1 = Math.min(inner.y + inner.h, y0 + 150);
    for (const c of content.slice(1))
      if (c.x < x1 && c.x + c.w > x0 && c.y >= y0) y1 = Math.min(y1, c.y - gap);
    cands.push({ x: x0, y: y0, w: Math.min(400, x1 - x0), h: y1 - y0 });
  }
  const ok = (r: Rect): boolean =>
    r.w >= BUBBLE_MIN.w * 0.8 &&
    r.h >= BUBBLE_MIN.h * 0.8 &&
    r.x >= safe.x &&
    r.y >= safe.y &&
    r.x + r.w <= safe.x + safe.w &&
    !avoid.some((b) => overlaps(b, r));
  return cands.find((r) => ok(r) && !content.some((c) => overlaps(c, r))) ?? cands.find(ok) ?? slot;
}

export function braaiLayout(i: BraaiLayoutIn): BraaiLayout {
  const { height, safe, panel, slot } = i;
  const footY = safe.y + safe.h - 24;
  const horizonY = Math.round(height * 0.6);
  const left = safe.x + GAP;
  const right = panel.x - GAP;
  const colW = right - left;
  const above = slot.x + slot.w <= panel.x ? slot.y + slot.h + GAP : safe.y + GAP;
  const blockers = [panel, slot, ...i.avoid];
  let scale = Math.min(MAX_SCALE, colW / GROUP_W, (footY - above) / GROUP_H);
  let oupa: Point | null = null;
  let rects: { oupa: Rect; fire: Rect } | null = null;
  for (; scale >= MIN_SCALE; scale *= 0.94) {
    const feet = { x: left + LEFT * scale + (colW - GROUP_W * scale) / 2, y: footY };
    const r = groupRects(feet, scale);
    const inside = r.oupa.x >= safe.x && r.fire.x + r.fire.w <= right + GAP / 2;
    if (inside && !blockers.some((b) => overlaps(b, r.oupa) || overlaps(b, r.fire))) {
      oupa = feet;
      rects = r;
      break;
    }
  }
  const rightCol = { x: panel.x + panel.w, w: safe.x + safe.w - (panel.x + panel.w) };
  const skyX = rightCol.x + Math.max(60, rightCol.w / 2) - 30;
  const crossY = safe.y + Math.min(200, height * 0.2);
  const bakkieScale = Math.min(1.3, Math.max(0.7, (rightCol.w - 2 * GAP) / 340));
  const bakkieX = Math.max(rightCol.x + rightCol.w / 2, rightCol.x + 130 * bakkieScale);
  return {
    scale: oupa === null ? 0 : scale,
    horizonY,
    oupa,
    fire: oupa === null ? null : { x: oupa.x + FIRE_DX * scale, y: oupa.y },
    bakkie: { x: bakkieX, y: footY - 6, scale: bakkieScale },
    // The Milky Way rises steeply through the right column, the Southern Cross in it (as it
    // stands in the southern sky on a summer evening, the Coalsack beside it).
    cross: { x: skyX + MILKY_RISE * (height * 0.4 - crossY), y: crossY },
    milky: { x: skyX, y: height * 0.4, rotation: -1.15, scaleX: (height * 1.2) / 720 },
    oupaRect: rects?.oupa ?? null,
    fireRect: rects?.fire ?? null,
    storySlot: storySlot(i, rects?.oupa ?? null, i.avoid),
  };
}
