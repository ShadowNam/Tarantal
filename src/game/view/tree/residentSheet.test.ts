// v1.20.2 (D-082): the baobab residents' frame table — the true-size owl and hornbill boxes are
// D-057's × their growth (rounded out), every frame inside the sheet, none overlapping.
import { describe, expect, it } from 'vitest';
import { RESIDENT_SHEET_H, RESIDENT_SHEET_W, residentFrames } from './residentSheet';
import { RESIDENT_TRUE_MUL } from './residentTrueSize';

const grown = (w: number, h: number, ox: number, oy: number, k: number): number[] => [
  Math.ceil(w * k),
  Math.ceil(h * k),
  Math.round(ox * k),
  Math.round(oy * k),
];

describe('baobab residents sheet (D-057, D-082)', () => {
  const fr = residentFrames();
  const box = (name: string): number[] => {
    const f = fr.find((x) => x.name === name);
    if (f === undefined) throw new Error(name);
    return [f.w, f.h, f.ox, f.oy];
  };

  it("the flying owl and the hornbill are D-057's boxes at their true-size growth", () => {
    for (const n of ['owl_fly_a', 'owl_fly_b'])
      expect(box(n), n).toEqual(grown(74, 40, 37, 20, RESIDENT_TRUE_MUL.owlFly));
    for (const n of ['hornbill_fly_a', 'hornbill_fly_b'])
      expect(box(n), n).toEqual(grown(64, 34, 30, 17, RESIDENT_TRUE_MUL.hornbill));
    for (const n of ['hornbill_cling', 'hornbill_feed'])
      expect(box(n), n).toEqual(grown(50, 54, 16, 40, RESIDENT_TRUE_MUL.hornbill));
  });

  it('fits every frame in the sheet, 2 px apart', () => {
    for (const a of fr) {
      expect(a.x + a.w).toBeLessThanOrEqual(RESIDENT_SHEET_W - 2);
      expect(a.y + a.h).toBeLessThanOrEqual(RESIDENT_SHEET_H - 2);
      for (const b of fr)
        if (a !== b)
          expect(
            a.x + a.w + 2 <= b.x ||
              b.x + b.w + 2 <= a.x ||
              a.y + a.h + 2 <= b.y ||
              b.y + b.h + 2 <= a.y,
            `${a.name} touches ${b.name}`,
          ).toBe(true);
    }
  });
});
