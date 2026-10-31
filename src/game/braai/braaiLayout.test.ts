// v1.11 (D-068, lesson 25): the braai is laid out against every tally rect on 16:9, 20:9 and
// 19.5:9 (with the iPhone's notch insets): Oupa and his fire stay on screen, inside the safe area,
// clear of the slate, the story bubble, the buttons and a special frame's pieces; on 4:3 they are
// left out rather than squeezed under the slate.
import { describe, expect, it } from 'vitest';
import { tallyBarkSlot, type Rect } from '../ui/hudLayout';
import { braaiLayout, overlaps } from './braaiLayout';

/** The tally's rects as TallyScene lays them out (design px). */
function tally(width: number, inset: { l: number; r: number; t: number; b: number }) {
  const height = 1080;
  const safe: Rect = {
    x: inset.l,
    y: inset.t,
    w: width - inset.l - inset.r,
    h: height - inset.t - inset.b,
  };
  const panelW = Math.min(1100, width - inset.l - inset.r - 80);
  const panelH = Math.min(900, height - inset.t - inset.b - 60);
  const px = inset.l + (width - inset.l - inset.r - panelW) / 2;
  const py = inset.t + (height - inset.t - inset.b - panelH) / 2;
  const panel = { x: px, y: py, w: panelW, h: panelH };
  const slate = { x: px - 14, y: py - 14, w: panelW + 28, h: panelH + 28 };
  const by = py + panelH - 116;
  const again = { x: px + panelW / 2 - 210, y: by, w: 420, h: 96 };
  const season = { x: px + 30, y: by + 12, w: Math.min(300, again.x - px - 60), h: 76 };
  const menu = { x: px + panelW - 30 - season.w, y: by + 12, w: season.w, h: 76 };
  const share = { x: px + panelW - 30 - 240, y: py + 20, w: 240, h: 84 };
  // A special frame's pieces sticking out of the slate's edges (Oupa's head on the left, a
  // present on the right): the braai must keep clear of them too.
  const head = { x: slate.x - 40, y: slate.y + 40, w: 90, h: 110 };
  const present = { x: slate.x + slate.w - 50, y: slate.y + slate.h - 160, w: 100, h: 100 };
  const avoid = [again, season, menu, share, head, present];
  return { width, height, safe, panel, slate, slot: tallyBarkSlot(safe, panel), avoid };
}

const inside = (r: Rect, s: Rect): boolean =>
  r.x >= s.x && r.y >= s.y && r.x + r.w <= s.x + s.w && r.y + r.h <= s.y + s.h;

describe('braai layout (D-068)', () => {
  it.each([
    ['desktop 16:9', 1920, { l: 0, r: 0, t: 0, b: 0 }],
    ['Pixel 7 20:9', 2400, { l: 0, r: 0, t: 0, b: 0 }],
    ['iPhone 14 19.5:9 (notch)', 2338, { l: 130, r: 130, t: 0, b: 58 }],
  ] as const)('%s: Oupa and the fire clear of every rect, inside the safe area', (_, w, inset) => {
    const t = tally(w, inset);
    const L = braaiLayout({
      width: t.width,
      height: t.height,
      safe: t.safe,
      panel: t.slate,
      slot: t.slot,
      avoid: t.avoid,
    });
    expect(L.oupa).not.toBeNull();
    expect(L.scale).toBeGreaterThanOrEqual(0.8);
    for (const r of [L.oupaRect, L.fireRect]) {
      expect(r).not.toBeNull();
      if (r === null) continue;
      expect(inside(r, t.safe), JSON.stringify(r)).toBe(true);
      for (const b of [t.slate, t.slot, ...t.avoid])
        expect(overlaps(r, b), JSON.stringify(b)).toBe(false);
    }
    // The story bubble above his head, clear of everything else and of him.
    const bubble = L.storySlot;
    expect(inside(bubble, t.safe)).toBe(true);
    expect(overlaps(bubble, t.slate)).toBe(false);
    if (L.oupaRect !== null) expect(bubble.y + bubble.h).toBeLessThanOrEqual(L.oupaRect.y);
    for (const b of t.avoid) expect(overlaps(bubble, b)).toBe(false);
    // Feet on the ground: below the horizon line, inside the screen.
    expect(L.oupa?.y ?? 0).toBeGreaterThan(L.horizonY);
    expect(L.fire?.y).toBe(L.oupa?.y);
    // The bakkie on the right, the cross in the sky.
    expect(L.bakkie.x).toBeGreaterThan(t.slate.x + t.slate.w);
    expect(L.cross.y).toBeLessThan(L.horizonY);
  });

  it('4:3: no room beside the slate — Oupa and the fire are left out, the sky still shows', () => {
    const t = tally(1440, { l: 0, r: 0, t: 0, b: 0 });
    const L = braaiLayout({
      width: t.width,
      height: t.height,
      safe: t.safe,
      panel: t.slate,
      slot: t.slot,
      avoid: t.avoid,
    });
    expect(L.oupa).toBeNull();
    expect(L.fire).toBeNull();
    expect(L.oupaRect).toBeNull();
    expect(L.horizonY).toBeGreaterThan(0);
  });

  it('a rect in the way pushes them smaller or out, never over it', () => {
    const t = tally(1920, { l: 0, r: 0, t: 0, b: 0 });
    const block = { x: 0, y: 700, w: 400, h: 380 };
    const L = braaiLayout({
      width: t.width,
      height: t.height,
      safe: t.safe,
      panel: t.slate,
      slot: t.slot,
      avoid: [...t.avoid, block],
    });
    for (const r of [L.oupaRect, L.fireRect])
      if (r !== null) expect(overlaps(r, block)).toBe(false);
  });
});
