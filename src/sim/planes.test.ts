import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { ScoringSchema } from '../content/schemas';
import { hitRadius, tuningRatio } from './planes';

const content = loadContent();
const P = content.scoring.planes;

describe('plane scales (D-049: birds get smaller with distance)', () => {
  it('shrink with every plane back: near 1, mid 0.42, far 0.15, Ver 0.07', () => {
    expect([P.near.scale, P.mid.scale, P.far.scale, P.ver.scale]).toEqual([1, 0.42, 0.15, 0.07]);
  });

  it('the schema refuses a plane that is not smaller than the one in front', () => {
    const bad = structuredClone(content.scoring);
    bad.planes.far.scale = bad.planes.mid.scale;
    expect(ScoringSchema.safeParse(bad).success).toBe(false);
    expect(ScoringSchema.safeParse(content.scoring).success).toBe(true);
  });

  it('px tunings written at tuningRefScale scale with the plane', () => {
    expect(content.scoring.tuningRefScale).toBe(0.5);
    expect(tuningRatio(0.5, 0.5)).toBe(1);
    expect(tuningRatio(P.mid.scale, content.scoring.tuningRefScale)).toBeCloseTo(0.84, 9);
    expect(tuningRatio(P.far.scale, content.scoring.tuningRefScale)).toBeCloseTo(0.3, 9);
  });

  it('a hit radius is the scaled radius, never below the floor', () => {
    expect(hitRadius(110, 0.42, 0)).toBeCloseTo(46.2, 9);
    expect(hitRadius(110, 0.15, 18)).toBe(18);
    expect(hitRadius(85, 0.15, 18)).toBe(18);
    expect(hitRadius(110, 0.5, 18)).toBe(55);
  });

  it('far and Ver birds keep a minimum hit radius; near and mid are as drawn', () => {
    expect(P.near.minHitRadiusPx).toBe(0);
    expect(P.mid.minHitRadiusPx).toBe(0);
    expect(P.far.minHitRadiusPx).toBe(18);
    expect(P.ver.minHitRadiusPx).toBe(10);
    // The floor is at least what the far bird's body is drawn at (it only ever widens).
    expect(P.far.minHitRadiusPx).toBeGreaterThan(85 * P.far.scale);
  });

  it('touch aim assist per plane (mid 10, far 12 after D-049)', () => {
    expect([P.near.aimAssistPx, P.mid.aimAssistPx, P.far.aimAssistPx, P.ver.aimAssistPx]).toEqual([
      8, 10, 12, 6,
    ]);
  });
});
