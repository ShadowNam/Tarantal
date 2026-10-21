import { describe, expect, it } from 'vitest';
import { moveOrder, slotAt, slotRects } from './charmSlots';

describe('charm row geometry', () => {
  it('moves a slot to a new place (new slot i holds old order[i])', () => {
    expect(moveOrder(4, 0, 2)).toEqual([1, 2, 0, 3]);
    expect(moveOrder(4, 3, 0)).toEqual([3, 0, 1, 2]);
    expect(moveOrder(3, 1, 9)).toEqual([0, 2, 1]);
  });

  it('centres the slots and finds the nearest one', () => {
    const rects = slotRects({ x: 0, y: 0, w: 1000, h: 100 }, 3, 200, 50);
    expect(rects.map((r) => r.x)).toEqual([150, 400, 650]);
    expect(slotAt(rects, 0)).toBe(0);
    expect(slotAt(rects, 520)).toBe(1);
    expect(slotAt(rects, 2000)).toBe(2);
  });
});
