// 1.9.3 (D-056, review M2): MakalaniView scales every makalani texture by displayScale() and cuts
// the nut sheet's frames by it, so every makalani spec must be view-scaled (an HD texture keeps
// its 2× size and displayScale() halves).
import { describe, expect, it } from 'vitest';
import { NUT_SHEET } from '../view/palms/makalaniSheet';
import { makalaniSpecs } from './makalaniArt';

describe('makalani placeholder specs', () => {
  it('are all view-scaled, the nut sheet included', () => {
    const specs = makalaniSpecs();
    expect(specs.some((s) => s.key === NUT_SHEET)).toBe(true);
    for (const s of specs) expect(s.viewScaled, s.key).toBe(true);
  });
});
