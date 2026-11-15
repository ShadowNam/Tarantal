import { describe, expect, it } from 'vitest';
import { skyHazeAlpha, skyHazeBands } from './skyHaze';

describe('soft sky haze', () => {
  const haze = { layer: 'sky', color: '#D7BAA2', alpha: 0.3, top: 200, bottom: 400 };
  it('removes hard edges while retaining the centre colour and outside sky', () => {
    expect(skyHazeAlpha(haze, 199)).toBe(0);
    expect(skyHazeAlpha(haze, 400)).toBe(0);
    expect(skyHazeAlpha(haze, 200)).toBeLessThan(0.01);
    expect(skyHazeAlpha(haze, 399)).toBeLessThan(0.01);
    expect(skyHazeAlpha(haze, 300)).toBe(haze.alpha);
  });
  it('covers the band without gaps, matching the contrast audit at every rendered strip', () => {
    const bands = skyHazeBands(haze);
    expect(bands[0]?.top).toBe(200);
    expect(bands.at(-1)?.bottom).toBe(400);
    for (const [i, band] of bands.entries()) {
      if (i > 0) expect(band.top).toBe(bands[i - 1]?.bottom);
      expect(band.alpha).toBe(skyHazeAlpha(haze, (band.top + band.bottom) / 2));
      expect(band.alpha).toBeGreaterThanOrEqual(0);
      expect(band.alpha).toBeLessThanOrEqual(haze.alpha);
    }
  });
  it('preserves whole-sky haze and handles empty bands', () => {
    expect(skyHazeBands({ ...haze, top: 0, bottom: 1080 })).toEqual([
      { top: 0, bottom: 1080, alpha: 0.3 },
    ]);
    expect(skyHazeBands({ ...haze, bottom: 200 })).toEqual([]);
    expect(skyHazeBands({ ...haze, alpha: 0 })).toEqual([]);
    expect(skyHazeAlpha({ ...haze, top: 0 }, 0)).toBe(haze.alpha);
  });
});
