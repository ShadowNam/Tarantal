import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { isPlaneScalePreset, withPlaneScales } from './devContent';

describe('?planeScale=v17 (D-049 before/after screenshots)', () => {
  it('puts back the v1.7 scales, assist and no hit floor, and nothing else', () => {
    const c = loadContent();
    const old = withPlaneScales(c, 'v17').scoring.planes;
    expect([old.near.scale, old.mid.scale, old.far.scale, old.ver.scale]).toEqual([
      1, 0.5, 0.22, 0.1,
    ]);
    expect([old.mid.aimAssistPx, old.far.aimAssistPx]).toEqual([14, 18]);
    expect(old.far.minHitRadiusPx).toBe(0);
    expect(old.far.base).toBe(c.scoring.planes.far.base);
    expect(c.scoring.planes.far.scale).toBe(0.15);
  });

  it('only known presets; far animals back to as drawn', () => {
    expect(isPlaneScalePreset('v17')).toBe(true);
    expect(isPlaneScalePreset('toString')).toBe(false);
    expect(isPlaneScalePreset(null)).toBe(false);
  });
});
