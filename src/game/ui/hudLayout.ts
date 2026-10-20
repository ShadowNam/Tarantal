// In-hunt HUD layout (art bible §6) from the design width and the safe area. Pure; unit-tested
// at 16:9, 19.5:9 and 4:3. Top-left: timer + Frenzy meter. Top-right: score + pop stack.
// Bottom-right: shell belt (tap target) + RELOAD prompt. Bottom-left: gadget button (Vuvuzela,
// GDD §18.2; mirrored for left-handers with the M5 settings). Gun: bottom, centre-right.
import type { Insets } from '../layout';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface HudLayout {
  readonly safe: Rect;
  readonly timer: Rect;
  readonly frenzy: Rect;
  readonly score: Rect;
  /** Pops stack downward from here, right-aligned. */
  readonly popAnchor: { readonly x: number; readonly y: number };
  readonly belt: Rect;
  readonly reloadPrompt: Rect;
  readonly gadget: Rect;
  /** Gun pivot (bottom-centre of the gun sprite). */
  readonly gun: { readonly x: number; readonly y: number };
}

export interface HudSizing {
  readonly marginPx: number;
  readonly beltTapMinPx: number;
  readonly gadgetPx: number;
}

export function hudLayout(width: number, height: number, insets: Insets, s: HudSizing): HudLayout {
  const m = s.marginPx;
  const safe: Rect = {
    x: insets.left,
    y: insets.top,
    w: width - insets.left - insets.right,
    h: height - insets.top - insets.bottom,
  };
  const left = safe.x + m;
  const right = safe.x + safe.w - m;
  const top = safe.y + m;
  const bottom = safe.y + safe.h - m;

  const timer: Rect = { x: left, y: top, w: 220, h: 96 };
  const frenzy: Rect = { x: left, y: top + timer.h + 16, w: 400, h: 44 };
  const score: Rect = { x: right - 420, y: top, w: 420, h: 96 };
  const beltH = Math.max(s.beltTapMinPx, 96);
  // 8 shells × 44 px + padding; narrower screens keep the same belt (it fits at 1440).
  const beltW = 8 * 44 + 40;
  const belt: Rect = { x: right - beltW, y: bottom - beltH, w: beltW, h: beltH };
  const reloadPrompt: Rect = { x: belt.x, y: belt.y - 90, w: belt.w, h: 76 };
  const gadget: Rect = { x: left, y: bottom - s.gadgetPx, w: s.gadgetPx, h: s.gadgetPx };
  return {
    safe,
    timer,
    frenzy,
    score,
    popAnchor: { x: right, y: score.y + score.h + 12 },
    belt,
    reloadPrompt,
    gadget,
    gun: { x: safe.x + safe.w * 0.62, y: height },
  };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
