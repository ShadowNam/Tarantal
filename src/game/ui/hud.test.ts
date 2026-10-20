import { describe, expect, it } from 'vitest';
import { designSizeFor, safeAreaInDesignPx } from '../layout';
import { formatAward, formatClock, formatScore, popParts } from './format';
import { hudLayout, rectContains, type Rect } from './hudLayout';

const sizing = { marginPx: 28, beltTapMinPx: 64 };
const inside = (outer: Rect, r: Rect) =>
  r.x >= outer.x &&
  r.y >= outer.y &&
  r.x + r.w <= outer.x + outer.w &&
  r.y + r.h <= outer.y + outer.h;
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('HUD layout at 16:9, 19.5:9 and 4:3', () => {
  const cases = [
    { name: '16:9', vw: 1920, vh: 1080, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    // iPhone 14 landscape: 844×390 CSS px with a 47 px notch inset on the left and 21 px bottom.
    { name: '19.5:9', vw: 844, vh: 390, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
    { name: '4:3', vw: 1024, vh: 768, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  ];
  for (const c of cases) {
    it(`${c.name}: every element sits inside the safe area without overlapping`, () => {
      const size = designSizeFor(c.vw, c.vh);
      const insets = safeAreaInDesignPx(c.insets, { width: c.vw, height: c.vh }, size);
      const l = hudLayout(size.width, size.height, insets, sizing);
      const parts = [l.timer, l.frenzy, l.score, l.belt, l.reloadPrompt];
      for (const p of parts) expect(inside(l.safe, p)).toBe(true);
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i];
          const b = parts[j];
          if (a && b) expect(overlap(a, b)).toBe(false);
        }
      expect(l.belt.h).toBeGreaterThanOrEqual(64);
      expect(rectContains(l.belt, l.belt.x + 5, l.belt.y + 5)).toBe(true);
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
