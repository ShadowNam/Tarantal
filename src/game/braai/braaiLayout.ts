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

/** The story bubble above Oupa's head, inside the column; the tally's slot if that won't fit. */
function storySlot(i: BraaiLayoutIn, oupa: Rect | null, avoid: readonly Rect[]): Rect {
  const slot = i.slot;
  if (oupa === null || slot.x + slot.w > i.panel.x) return slot;
  const y = Math.max(slot.y, oupa.y - slot.h - 8);
  const r = { ...slot, y };
  return avoid.some((b) => overlaps(b, r)) ? slot : r;
}

export function braaiLayout(i: BraaiLayoutIn): BraaiLayout {
  const { width, height, safe, panel, slot } = i;
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
  const bakkieScale = Math.min(1.3, Math.max(0.7, (rightCol.w - 2 * GAP) / 340));
  const bakkieX = Math.max(rightCol.x + rightCol.w / 2, rightCol.x + 130 * bakkieScale);
  return {
    scale: oupa === null ? 0 : scale,
    horizonY,
    oupa,
    fire: oupa === null ? null : { x: oupa.x + FIRE_DX * scale, y: oupa.y },
    bakkie: { x: bakkieX, y: footY - 6, scale: bakkieScale },
    cross: {
      x: rightCol.x + Math.max(60, rightCol.w / 2),
      y: safe.y + Math.min(190, height * 0.18),
    },
    milky: { x: width * 0.5, y: height * 0.3, rotation: -0.38, scaleX: (width * 1.3) / 720 },
    oupaRect: rects?.oupa ?? null,
    fireRect: rects?.fire ?? null,
    storySlot: storySlot(i, rects?.oupa ?? null, blockers.slice(2)),
  };
}
