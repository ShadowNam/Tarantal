import { describe, expect, it } from 'vitest';
import { grassLean } from './windGrass';

describe('wind grass lean (v1.17, D-079)', () => {
  it('leans downwind, more with strength, faster than linearly', () => {
    expect(grassLean(1, 0.5, 1.5).lean).toBeGreaterThan(0);
    expect(grassLean(-1, 0.5, 1.5).lean).toBeLessThan(0);
    const l = (s: number): number => grassLean(1, s, 1.5).lean;
    expect(l(1)).toBeGreaterThan(l(0.7));
    expect(l(0.7)).toBeGreaterThan(l(0.4));
    expect(l(1) - l(0.9)).toBeGreaterThan(l(0.5) - l(0.4));
    expect(grassLean(1, 1, 1.5).flutter).toBeGreaterThan(grassLean(1, 0.2, 1.5).flutter);
  });
});
