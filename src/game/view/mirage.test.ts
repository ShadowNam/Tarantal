import { describe, expect, it } from 'vitest';
import { MIRAGE_BREATHE, mirageLook } from './mirage';

const strip = { phase: 1.3, base: 0.42 };

describe('the Namibië mirage (v1.4 B, D-039)', () => {
  it('holds still with reduce flashes / reduced motion: the base alpha, no ripple, any time', () => {
    for (const t of [0, 0.5, 1.7, 3.3, 59.9])
      expect(mirageLook(strip, t, true)).toEqual({ alpha: strip.base, scaleX: 1 });
  });

  it('otherwise breathes slowly on sim time (≥ 3 s a cycle, never above its base)', () => {
    expect((2 * Math.PI) / MIRAGE_BREATHE).toBeGreaterThanOrEqual(2.99);
    const a = mirageLook(strip, 0.2, false);
    const b = mirageLook(strip, 1.2, false);
    expect(a.alpha).not.toBeCloseTo(b.alpha, 3);
    for (let t = 0; t < 10; t += 0.1) {
      const l = mirageLook(strip, t, false);
      expect(l.alpha).toBeLessThanOrEqual(strip.base + 1e-9);
      expect(l.alpha).toBeGreaterThanOrEqual(strip.base * 0.2 - 1e-9);
    }
    // The same sim time draws the same frame (a held frame holds it).
    expect(mirageLook(strip, 4.25, false)).toEqual(mirageLook(strip, 4.25, false));
  });
});
