import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, designSizeFor, isPortrait, safeAreaInDesignPx } from './layout';

describe('designSizeFor', () => {
  it('keeps the 1920 reference width at 16:9', () => {
    expect(designSizeFor(1920, 1080)).toEqual({ width: 1920, height: DESIGN_HEIGHT });
    expect(designSizeFor(1280, 720)).toEqual({ width: 1920, height: DESIGN_HEIGHT });
  });

  it('widens for 19.5:9 phones (iPhone 14 / Pixel 7 landscape)', () => {
    expect(designSizeFor(844, 390)).toEqual({ width: 2338, height: DESIGN_HEIGHT });
    expect(designSizeFor(915, 412).width).toBe(2398);
  });

  it('narrows to 1440 for 4:3 tablets and never below', () => {
    expect(designSizeFor(1024, 768)).toEqual({ width: 1440, height: DESIGN_HEIGHT });
    expect(designSizeFor(1000, 1000).width).toBe(1440);
  });

  it('stops at 2520 for anything wider than 21:9 (pillarbox)', () => {
    expect(designSizeFor(2520, 1080).width).toBe(2520);
    expect(designSizeFor(3840, 1080).width).toBe(2520);
  });

  it('always returns an even width and the fixed height', () => {
    for (const [w, h] of [
      [1366, 768],
      [1536, 864],
      [2560, 1440],
      [740, 360],
    ] as const) {
      const size = designSizeFor(w, h);
      expect(size.height).toBe(DESIGN_HEIGHT);
      expect(size.width % 2).toBe(0);
    }
  });

  it('falls back to the reference size for an empty viewport', () => {
    expect(designSizeFor(0, 0)).toEqual({ width: 1920, height: DESIGN_HEIGHT });
  });
});

describe('isPortrait', () => {
  it('is true only when the viewport is taller than wide', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isPortrait(800, 800)).toBe(false);
  });
});

describe('safeAreaInDesignPx', () => {
  it('scales notch insets into design px', () => {
    // iPhone 14 landscape: 844×390 viewport, 47 px notch insets left/right, 21 px home bar.
    const design = designSizeFor(844, 390);
    const safe = safeAreaInDesignPx(
      { top: 0, right: 47, bottom: 21, left: 47 },
      { width: 844, height: 390 },
      design,
    );
    const scale = 390 / 1080;
    expect(safe.left).toBeCloseTo(47 / scale, 0);
    expect(safe.bottom).toBeCloseTo(21 / scale, 0);
    expect(safe.top).toBe(0);
  });

  it('lets pillarbox bars absorb insets', () => {
    // 32:9 monitor: the canvas is pillarboxed, so a 40 px inset sits inside the black bar.
    const design = designSizeFor(3840, 1080);
    const safe = safeAreaInDesignPx(
      { top: 0, right: 40, bottom: 0, left: 40 },
      { width: 3840, height: 1080 },
      design,
    );
    expect(safe.left).toBe(0);
    expect(safe.right).toBe(0);
  });
});
