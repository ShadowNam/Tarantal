import { describe, expect, it } from 'vitest';
import { formatAward, popParts } from './format';
import { bitmapFontData, layoutGlyphs, popCanShow } from './popGlyphs';

describe('pop glyph atlas (v1.0.1, D-028 §4)', () => {
  it('holds every character a score pop can show', () => {
    const samples = [
      formatAward(0),
      formatAward(20),
      formatAward(12_345_678),
      formatAward(-150),
      formatAward(-1_000_000),
      popParts(10, 2),
      popParts(1_250, 1.5),
      popParts(5, 12),
      popParts(100, 0.5),
    ];
    for (const s of samples) expect(popCanShow(s), JSON.stringify(s)).toBe(true);
    expect(popCanShow('POOF!')).toBe(false);
  });

  it('packs cells left to right and wraps at the width limit', () => {
    const l = layoutGlyphs('abcd', [10, 10, 10, 10], 30, 2, 30);
    // Each cell is 10 + 2 × 2 = 14 wide: two fit per 30 px row.
    expect(l.glyphs.map((g) => [g.x, g.y])).toEqual([
      [0, 0],
      [14, 0],
      [0, 30],
      [14, 30],
    ]);
    expect([l.w, l.h]).toEqual([28, 60]);
  });

  it('font data: advance without the pad, glyph drawn pad px left, v flipped', () => {
    const l = layoutGlyphs('1+', [9.2, 12], 40, 3, 1024);
    const d = bitmapFontData('f', 32, l, 3);
    const one = d.chars['1'.charCodeAt(0)];
    expect(one).toMatchObject({ x: 0, width: 16, xAdvance: 10, xOffset: -3, u0: 0, v0: 1 });
    expect(d.chars['+'.charCodeAt(0)]).toMatchObject({ x: 16, u1: 1, v1: 0 });
    expect(d.lineHeight).toBe(40);
    expect(Object.keys(d.chars)).toHaveLength(2);
  });
});
