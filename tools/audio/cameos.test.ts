// v1.13 (D-075): the veld cameos' interim sounds — each renders, is finite, within full scale,
// audible, deterministic and short enough to repeat over gunfire and music.
import { describe, expect, it } from 'vitest';
import { CAMEO_CALLS, CAMEO_RATE, renderCameo } from './cameos';

const rms = (a: Float32Array): number => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** The longest each sound may be (s). */
const MAX_SEC: Readonly<Record<string, number>> = {
  cameo_warthog_grunt: 1.0,
  cameo_beetle_plop: 0.3,
  cameo_tortoise_tok: 0.35,
  cameo_ostrich_boom: 1.5,
  cameo_springbok_whistle: 0.6,
  cameo_gemsbok_snort: 0.5,
  cameo_elephant_trumpet: 2.2,
};

describe('interim cameo sounds (D-075)', () => {
  it('has exactly the seven cameo sounds', () => {
    expect([...CAMEO_CALLS].sort()).toEqual(Object.keys(MAX_SEC).sort());
  });

  for (const id of CAMEO_CALLS) {
    it(`${id} renders finite, within full scale, audible and short`, () => {
      const x = renderCameo(id);
      expect(x.every(Number.isFinite)).toBe(true);
      expect(peak(x)).toBeLessThanOrEqual(1);
      expect(rms(x)).toBeGreaterThan(0.02);
      const sec = x.length / CAMEO_RATE;
      expect(sec).toBeGreaterThan(0.05);
      expect(sec).toBeLessThanOrEqual(MAX_SEC[id] ?? 0);
    });

    it(`${id} is deterministic`, () => {
      expect(renderCameo(id)).toEqual(renderCameo(id));
    });
  }

  it('throws for an unknown id', () => {
    expect(() => renderCameo('cameo_nope')).toThrow();
  });
});
