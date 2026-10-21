// Pure geometry for the charm row (unit-tested without Phaser).
import type { Rect } from './hudLayout';

/** Slot rects for `n` cards of width `w` centred in `area`. */
export function slotRects(area: Rect, n: number, w: number, gap: number): Rect[] {
  const total = n * w + Math.max(0, n - 1) * gap;
  const x0 = area.x + (area.w - total) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y: area.y, w, h: area.h }));
}

/** The order after moving slot `from` to slot `to` (new slot i holds old slot order[i]). */
export function moveOrder(n: number, from: number, to: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const [moved] = order.splice(from, 1);
  if (moved === undefined) return order;
  order.splice(Math.max(0, Math.min(n - 1, to)), 0, moved);
  return order;
}

/** Which slot an x position falls into (clamped). */
export function slotAt(rects: readonly Rect[], x: number): number {
  let best = 0;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const d = Math.abs(r.x + r.w / 2 - x);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
