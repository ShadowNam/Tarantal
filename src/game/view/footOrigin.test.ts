// v1.8c review round 3: a custom-pivot frame keeps its origin at the pivot when mirrored (Phaser
// mirrors it round the origin); only a frame without one mirrors the origin too.
import { describe, expect, it } from 'vitest';
import { footOriginX, setFootOrigin } from './footOrigin';

describe('footOriginX', () => {
  it('keeps a custom pivot as it is, flipped or not', () => {
    expect(footOriginX(0.3, false, true)).toBe(0.3);
    expect(footOriginX(0.3, true, true)).toBe(0.3);
  });
  it('mirrors the origin only for a frame without a custom pivot', () => {
    expect(footOriginX(0.3, true, false)).toBeCloseTo(0.7);
    expect(footOriginX(0.3, false, false)).toBe(0.3);
  });
  it('sets the origin only when it changes', () => {
    const calls: [number, number][] = [];
    const img = {
      frame: { pivotX: 0.25, pivotY: 0.9, customPivot: true },
      originX: 0.5,
      originY: 0.5,
      setOrigin(x: number, y: number) {
        calls.push([x, y]);
        this.originX = x;
        this.originY = y;
      },
    };
    setFootOrigin(img, true);
    setFootOrigin(img, false);
    expect(calls).toEqual([[0.25, 0.9]]);
  });
});
