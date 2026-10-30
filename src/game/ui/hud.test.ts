import { describe, expect, it } from 'vitest';
import { designSizeFor, safeAreaInDesignPx } from '../layout';
import { formatAward, formatClock, formatScore, popParts } from './format';
import { harvestBarsRects } from './harvestBarsLayout';
import {
  hudLayout,
  pickupAlpha,
  PICKUP_UNDER_AIM_ALPHA,
  rectContains,
  type Rect,
} from './hudLayout';

const sizing = {
  marginPx: 28,
  beltTapMinPx: 64,
  gadgetPx: 120,
  chipW: 260,
  chipH: 48,
  zoomButtonPx: 88,
};
const inside = (outer: Rect, r: Rect) =>
  r.x >= outer.x &&
  r.y >= outer.y &&
  r.x + r.w <= outer.x + outer.w &&
  r.y + r.h <= outer.y + outer.h;
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('v1.7b pickup card slot (D-046)', () => {
  for (const [name, vw, vh] of [
    ['16:9', 1920, 1080],
    ['19.5:9', 844, 390],
    ['4:3', 1024, 768],
  ] as const)
    it(`${name}: top centre, clear of the left column, the score plate and the middle`, () => {
      const size = designSizeFor(vw, vh);
      const l = hudLayout(
        size.width,
        size.height,
        { top: 0, right: 0, bottom: 0, left: 0 },
        sizing,
      );
      const p = l.pickup;
      expect(inside(l.safe, p)).toBe(true);
      expect(Math.abs(p.x + p.w / 2 - size.width / 2)).toBeLessThan(1);
      for (const r of [l.timer, l.frenzy, l.chips, l.score, l.quota, l.pause, l.bark])
        expect(overlap(p, r)).toBe(false);
      // Never down to the crosshair and the flock in the middle.
      expect(p.y + p.h).toBeLessThan(size.height * 0.42);
      expect(p.w).toBeGreaterThanOrEqual(440);
    });
});

describe('v1.7b pickup card under the crosshair (D-046)', () => {
  const size = designSizeFor(1920, 1080);
  const card = hudLayout(
    size.width,
    size.height,
    { top: 0, right: 0, bottom: 0, left: 0 },
    sizing,
  ).pickup;
  const mid = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
  it('fades while the crosshair is on the card or near it', () => {
    expect(pickupAlpha(card, mid)).toBe(PICKUP_UNDER_AIM_ALPHA);
    expect(pickupAlpha(card, { x: card.x + 4, y: card.y + 4 })).toBe(PICKUP_UNDER_AIM_ALPHA);
    // Just below its bottom edge (a flock flying under the card).
    expect(pickupAlpha(card, { x: mid.x, y: card.y + card.h + 40 })).toBe(PICKUP_UNDER_AIM_ALPHA);
    // Beside it, in the margin.
    expect(pickupAlpha(card, { x: card.x - 50, y: mid.y })).toBe(PICKUP_UNDER_AIM_ALPHA);
  });
  it('stays solid when the crosshair is elsewhere or not shown', () => {
    expect(pickupAlpha(card, { x: size.width / 2, y: size.height / 2 })).toBe(1);
    expect(pickupAlpha(card, { x: 100, y: 900 })).toBe(1);
    expect(pickupAlpha(card, { x: card.x + card.w + 200, y: mid.y })).toBe(1);
    expect(pickupAlpha(card, null)).toBe(1);
  });
});

describe('HUD layout at 16:9, 19.5:9 and 4:3', () => {
  const cases = [
    { name: '16:9', vw: 1920, vh: 1080, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    // iPhone 14 landscape: 844×390 CSS px with a 47 px notch inset on the left and 21 px bottom.
    { name: '19.5:9', vw: 844, vh: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
    { name: '4:3', vw: 1024, vh: 768, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  ];
  for (const c of cases)
    for (const mirrored of [false, true]) {
      it(`${c.name}${mirrored ? ' left-handed' : ''}: every element sits inside the safe area without overlapping`, () => {
        const size = designSizeFor(c.vw, c.vh);
        const insets = safeAreaInDesignPx(c.insets, { width: c.vw, height: c.vh }, size);
        const l = hudLayout(size.width, size.height, insets, sizing, mirrored);
        const parts = [
          l.timer,
          l.frenzy,
          l.score,
          l.belt,
          l.reloadPrompt,
          l.gadget,
          l.chips,
          l.windsock,
          l.pause,
          l.skip,
          l.quota,
          l.charms,
          ...l.items,
          l.bark,
          l.zoomOut,
          l.zoomLabel,
          l.zoomIn,
        ];
        for (const p of parts) expect(inside(l.safe, p)).toBe(true);
        for (let i = 0; i < parts.length; i++)
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i];
            const b = parts[j];
            if (a && b) expect(overlap(a, b)).toBe(false);
          }
        // v1.8c (D-063): the Harvest's crop and fence bars overlap nothing the Harvest shows (the
        // Season Run's charms and quota never show there).
        const hv = harvestBarsRects(l);
        for (const bar of [hv.crop, hv.repair]) {
          expect(inside(l.safe, bar)).toBe(true);
          for (const p of parts)
            if (p !== l.charms && p !== l.quota) expect(overlap(bar, p)).toBe(false);
        }
        expect(l.belt.h).toBeGreaterThanOrEqual(64);
        expect(Math.min(l.gadget.w, l.gadget.h)).toBeGreaterThanOrEqual(64);
        expect(rectContains(l.belt, l.belt.x + 5, l.belt.y + 5)).toBe(true);
        expect(Math.min(l.pause.w, l.pause.h, l.skip.h)).toBeGreaterThanOrEqual(64);
        // v1.4: the zoom buttons are ≥ 64 px tap targets.
        expect(Math.min(l.zoomIn.w, l.zoomIn.h, l.zoomOut.w, l.zoomOut.h)).toBeGreaterThanOrEqual(
          64,
        );
        // Left-handed mirrors the bottom row: belt on the left, gadget on the right.
        const beltLeft = l.belt.x < size.width / 2;
        expect(beltLeft).toBe(mirrored);
        expect(l.gadget.x < size.width / 2).toBe(!mirrored);
        // D-028 §3: Oupa's bubble stays clear of the pop stack under the score.
        expect(l.bark.x + l.bark.w).toBeLessThan(l.popAnchor.x - 300);
      });
    }
});

describe('formatting', () => {
  it('formats large numbers as 12.4K and 1.2M', () => {
    expect(formatScore(999)).toBe('999');
    expect(formatScore(9999)).toBe('9999');
    expect(formatScore(12_400)).toBe('12.4K');
    expect(formatScore(150_000)).toBe('150K');
    expect(formatScore(1_200_000)).toBe('1.2M');
    expect(formatScore(-35)).toBe('−35');
  });
  it('pops read "10 ×2" then "+20"', () => {
    expect(popParts(10, 2)).toBe('10 ×2');
    expect(popParts(25, 1.5)).toBe('25 ×1.5');
    expect(formatAward(20)).toBe('+20');
    expect(formatAward(-35)).toBe('−35');
  });
  it('clock rounds up', () => {
    expect(formatClock(90 * 60, 60)).toBe('1:30');
    expect(formatClock(61, 60)).toBe('0:02');
    expect(formatClock(0, 60)).toBe('0:00');
  });
});
