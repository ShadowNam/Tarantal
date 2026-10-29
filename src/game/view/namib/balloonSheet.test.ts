import { describe, expect, it } from 'vitest';
import { BALLOON_SHEET_H, BALLOON_SHEET_W, balloonFrames, burnerAt } from './balloonSheet';

describe('balloon sheet (v1.7d, D-059)', () => {
  it('fits every frame on the sheet', () => {
    for (const f of balloonFrames()) {
      expect(f.x + f.w).toBeLessThanOrEqual(BALLOON_SHEET_W);
      expect(f.y + f.h).toBeLessThanOrEqual(BALLOON_SHEET_H);
    }
  });

  it('flares now and then on sim time, smoothly (never a flash), and roars after a hit', () => {
    let bursts = 0;
    let prev = 0;
    for (let t = 0; t < 60 * 60; t++) {
      const l = burnerAt(4, t, null);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
      expect(Math.abs(l - prev)).toBeLessThan(0.1);
      if (l > 0 && prev === 0) bursts++;
      prev = l;
    }
    // A burst every 5–9 s: no more than 3 a second, by far.
    expect(bursts).toBeGreaterThanOrEqual(6);
    expect(bursts).toBeLessThanOrEqual(13);
    expect(burnerAt(4, 1000, 990)).toBe(1);
    expect(burnerAt(4, 1000, 990)).toBe(burnerAt(4, 1000, 990));
  });
});
