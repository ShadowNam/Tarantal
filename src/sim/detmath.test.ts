import { describe, expect, it } from 'vitest';
import * as dm from './detmath';

function sweep(from: number, to: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);
}

function maxAbsError(
  xs: readonly number[],
  f: (x: number) => number,
  g: (x: number) => number,
): number {
  let worst = 0;
  for (const x of xs) worst = Math.max(worst, Math.abs(f(x) - g(x)));
  return worst;
}

function maxRelError(
  xs: readonly number[],
  f: (x: number) => number,
  g: (x: number) => number,
): number {
  let worst = 0;
  for (const x of xs) {
    const ref = g(x);
    worst = Math.max(worst, Math.abs(f(x) - ref) / Math.max(Math.abs(ref), 1e-300));
  }
  return worst;
}

describe('detmath error bounds against Math.*', () => {
  const angles = sweep(-50, 50, 20000);

  it('sin and cos within 1e-14 over ±50 rad', () => {
    expect(maxAbsError(angles, dm.sin, Math.sin)).toBeLessThan(1e-14);
    expect(maxAbsError(angles, dm.cos, Math.cos)).toBeLessThan(1e-14);
  });

  it('hits exact values at key angles', () => {
    expect(dm.sin(0)).toBe(0);
    expect(dm.cos(0)).toBe(1);
    expect(dm.sin(Math.PI / 2)).toBe(1);
    expect(Math.abs(dm.cos(Math.PI / 2))).toBeLessThan(1e-16);
  });

  it('atan and atan2 within 1e-15 in every quadrant', () => {
    expect(maxAbsError(sweep(-1000, 1000, 20000), dm.atan, Math.atan)).toBeLessThan(1e-15);
    for (const y of sweep(-5, 5, 60)) {
      for (const x of sweep(-5, 5, 60)) {
        expect(Math.abs(dm.atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-14);
      }
    }
  });

  it('exp and log within 1e-14 relative', () => {
    expect(maxRelError(sweep(-700, 700, 20000), dm.exp, Math.exp)).toBeLessThan(1e-14);
    expect(maxAbsError(sweep(1e-6, 1e6, 20000), dm.log, Math.log)).toBeLessThan(1e-13);
    expect(dm.log(1)).toBe(0);
    expect(dm.exp(0)).toBe(1);
  });

  it('pow: exact for integer exponents, 1e-13 relative otherwise', () => {
    expect(dm.pow(2, 10)).toBe(1024);
    expect(dm.pow(3, -2)).toBe(1 / 9);
    expect(dm.pow(7, 0)).toBe(1);
    const xs = sweep(0.01, 100, 5000);
    expect(
      maxRelError(
        xs,
        (x) => dm.pow(x, 0.37),
        (x) => Math.pow(x, 0.37),
      ),
    ).toBeLessThan(1e-13);
    expect(
      maxRelError(
        xs,
        (x) => dm.pow(x, 2.5),
        (x) => Math.pow(x, 2.5),
      ),
    ).toBeLessThan(1e-13);
  });

  it('handles special values', () => {
    expect(dm.sin(Infinity)).toBeNaN();
    expect(dm.log(-1)).toBeNaN();
    expect(dm.log(0)).toBe(-Infinity);
    expect(dm.atan2(0, 0)).toBe(0);
    expect(dm.exp(1000)).toBe(Infinity);
  });
});
