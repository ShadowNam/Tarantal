// In-hunt HUD layout (art bible §6) from the design width and the safe area. Pure; unit-tested
// at 16:9, 19.5:9 and 4:3. Top-left: timer + Frenzy meter. Top-right: score + pop stack.
// Bottom-right: shell belt (tap target) + RELOAD prompt. Bottom-left: gadget button (Vuvuzela,
// GDD §18.2). Left-handed mode mirrors the bottom row (belt left, gadget right, gun centre-left).
// Top centre: pause button (and the FTUE skip button next to it). Gun: bottom, centre-right.
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
  /** M4: power-up / crate-weapon chips stack down from here (room for MAX_CHIPS). */
  readonly chips: Rect;
  /** Wind sock (omen hunts), between the timer and the score. */
  readonly windsock: Rect;
  /** Gun pivot (bottom-centre of the gun sprite). */
  readonly gun: { readonly x: number; readonly y: number };
  /** Pause button (touch players have no Esc), top centre. */
  readonly pause: Rect;
  /** FTUE skip button, right of the pause button. */
  readonly skip: Rect;
  /** FTUE prompt line: centre and the width it may use. */
  readonly prompt: { readonly x: number; readonly y: number; readonly w: number };
  /** M6 Season Run: quota bar under the score, charm chips under the pause button, and the
   *  consumable + rental buttons beside the gadget (slot i = consumable command slot i). */
  readonly quota: Rect;
  readonly charms: Rect;
  readonly items: readonly Rect[];
  /** v1.0.1 (D-028 §3): Oupa's speech bubble, left column under the chips — clear of the belt,
   *  score, pops, pause and gadget, and never a tap target (taps pass through it). */
  readonly bark: Rect;
  /** v1.4 (D-038): the variable scope's zoom row above the reload prompt, at the belt's outer
   *  edge: − button, the zoom label, + button (buttons on touch only). */
  readonly zoomOut: Rect;
  readonly zoomLabel: Rect;
  readonly zoomIn: Rect;
}

/** Consumable slots + the rental slot (run.json consumableSlots 2, + 1). */
export const ITEM_SLOTS = 3;
export const ITEM_GAP = 14;

/** Pause button size (a ≥ 64 px tap target). */
export const PAUSE_PX = 88;

export interface HudSizing {
  readonly marginPx: number;
  readonly beltTapMinPx: number;
  readonly gadgetPx: number;
  readonly chipW: number;
  readonly chipH: number;
  readonly zoomButtonPx: number;
}

/** Oupa's bubble slot height (design px): three lines at the bubble's text size. */
export const BARK_H = 150;

/** Chips shown at once (crate weapon + power-ups). */
export const MAX_CHIPS = 3;
export const CHIP_GAP = 10;

export function hudLayout(
  width: number,
  height: number,
  insets: Insets,
  s: HudSizing,
  mirrored = false,
): HudLayout {
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
  const belt: Rect = {
    x: mirrored ? left : right - beltW,
    y: bottom - beltH,
    w: beltW,
    h: beltH,
  };
  const reloadPrompt: Rect = { x: belt.x, y: belt.y - 90, w: belt.w, h: 76 };
  const gadget: Rect = {
    x: mirrored ? right - s.gadgetPx : left,
    y: bottom - s.gadgetPx,
    w: s.gadgetPx,
    h: s.gadgetPx,
  };
  const mid = safe.x + safe.w / 2;
  const pause: Rect = { x: mid - PAUSE_PX / 2, y: top, w: PAUSE_PX, h: PAUSE_PX };
  const skip: Rect = { x: pause.x + pause.w + 24, y: top + 8, w: 200, h: 72 };
  const chips: Rect = {
    x: left,
    y: frenzy.y + frenzy.h + 16,
    w: s.chipW,
    h: MAX_CHIPS * s.chipH + (MAX_CHIPS - 1) * CHIP_GAP,
  };
  const windsock: Rect = { x: timer.x + timer.w + 24, y: top + 10, w: 170, h: 76 };
  const quota: Rect = { x: score.x, y: score.y + score.h + 6, w: score.w, h: 40 };
  const charmsW = Math.max(0, Math.min(600, 2 * (score.x - 24 - (safe.x + safe.w / 2))));
  const charms: Rect = {
    x: safe.x + safe.w / 2 - charmsW / 2,
    y: top + PAUSE_PX + 14,
    w: charmsW,
    h: 52,
  };
  const itemPx = Math.max(72, Math.round(s.gadgetPx * 0.8));
  const items: Rect[] = Array.from({ length: ITEM_SLOTS }, (_, i) => ({
    x: mirrored
      ? gadget.x - 16 - itemPx - i * (itemPx + ITEM_GAP)
      : gadget.x + gadget.w + 16 + i * (itemPx + ITEM_GAP),
    y: bottom - itemPx,
    w: itemPx,
    h: itemPx,
  }));
  const zb = s.zoomButtonPx;
  const zoomRowW = zb * 2 + 2 * 10 + 96;
  const zoomX = mirrored ? belt.x : belt.x + belt.w - zoomRowW;
  const zoomY = reloadPrompt.y - 12 - zb;
  const zoomOut: Rect = { x: zoomX, y: zoomY, w: zb, h: zb };
  const zoomLabel: Rect = { x: zoomX + zb + 10, y: zoomY, w: 96, h: zb };
  const zoomIn: Rect = { x: zoomLabel.x + zoomLabel.w + 10, y: zoomY, w: zb, h: zb };
  return {
    safe,
    timer,
    frenzy,
    score,
    popAnchor: { x: right, y: quota.y + quota.h + 12 },
    belt,
    reloadPrompt,
    gadget,
    chips,
    windsock,
    gun: { x: safe.x + safe.w * (mirrored ? 0.38 : 0.62), y: height },
    pause,
    skip,
    // Under the banner line, between the left and right HUD columns.
    prompt: { x: mid, y: safe.y + safe.h * 0.36, w: safe.w - 2 * (frenzy.w + m + 40) },
    quota,
    charms,
    items,
    bark: {
      x: left,
      y: chips.y + chips.h + 24,
      // The Frenzy column's width: long banners already shrink to stay clear of it.
      w: frenzy.w,
      h: BARK_H,
    },
    zoomOut,
    zoomLabel,
    zoomIn,
  };
}

/** A bubble needs this much width (design px) to sit beside a tally panel. */
const SIDE_MIN_W = 300;
const SIDE_MAX_W = 400;
const SLOT_H = 150;

/**
 * Where Oupa's bubble goes on a tally (v1.0.1, D-028 §3): beside the panel when the screen leaves
 * room (16:9 and wider), else in the panel's top-right corner, beside the centred title and above
 * the score (4:3), never over the buttons at the bottom. Pure.
 */
export function tallyBarkSlot(safe: Rect, panel: Rect, gap = 20): Rect {
  const sideW = Math.min(SIDE_MAX_W, panel.x - gap - (safe.x + gap));
  if (sideW >= SIDE_MIN_W) return { x: safe.x + gap, y: panel.y + 40, w: sideW, h: SLOT_H };
  const w = Math.min(SIDE_MAX_W, panel.w * 0.34);
  return { x: panel.x + panel.w - w - gap, y: panel.y + gap, w, h: SLOT_H * 0.75 };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
