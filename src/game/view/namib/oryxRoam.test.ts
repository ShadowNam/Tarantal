import { describe, expect, it } from 'vitest';
import { ORYX_ROAMS, heatOf, roamAt, shimmerAt } from './oryxRoam';

const roam = ORYX_ROAMS.namibie?.[0];

describe('oryx in the mirage (v1.7d, D-059)', () => {
  it('3–6 oryx from the gemsbok sheet (no art of their own), walking, grazing and head-up', () => {
    const all = ORYX_ROAMS.namibie ?? [];
    const animals = all.flatMap((r) => r.herd.animals);
    expect(animals.length).toBeGreaterThanOrEqual(3);
    expect(animals.length).toBeLessThanOrEqual(6);
    for (const r of all) {
      expect(r.herd.sheet).toBe('fauna/namibie_gemsbok');
      expect(r.herd.layer).toBe('far_veld');
    }
    for (const a of animals) expect(a.species).toBe('gemsbok');
    expect(new Set(animals.map((a) => a.pose))).toEqual(new Set(['walk', 'graze', 'alert']));
    // Never in step: every walker on its own pace and phase, a few px apart in depth.
    const walkers = all.filter((r) => r.pxPerSec > 0);
    expect(new Set(walkers.map((r) => r.pxPerSec)).size).toBe(walkers.length);
    expect(new Set(walkers.map((r) => r.phaseSeconds)).size).toBe(walkers.length);
    expect(new Set(walkers.map((r) => r.herd.y)).size).toBe(walkers.length);
  });

  it('walks there and back inside its span, slowly, with pauses, as a function of the tick', () => {
    if (roam === undefined) throw new Error('no roam');
    const core = 3000;
    let prev = roamAt(roam, 0, core);
    let turns = 0;
    let stops = 0;
    for (let t = 1 / 60; t < 600; t += 1 / 60) {
      const at = roamAt(roam, t, core);
      expect(at.x).toBeGreaterThanOrEqual(roam.spanU[0] * core - 1e-6);
      expect(at.x).toBeLessThanOrEqual(roam.spanU[1] * core + 1e-6);
      // Never faster than its walking pace (no jumps).
      expect(Math.abs(at.x - prev.x)).toBeLessThanOrEqual(roam.pxPerSec / 60 + 1e-6);
      if (at.facing !== prev.facing) turns++;
      if (at.x === prev.x) stops++;
      prev = at;
    }
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(stops).toBeGreaterThan(0);
    expect(roamAt(roam, 12.5, core)).toEqual(roamAt(roam, 12.5, core));
  });

  it('shimmers with the heat: full with the mirage, none at dawn; still with reduce motion', () => {
    expect(heatOf(true, ['dawn_mist'])).toBe(1);
    expect(heatOf(false, ['dawn_mist'])).toBe(0);
    expect(heatOf(false, ['midday'])).toBe(0.5);
    expect(shimmerAt(3, 0, false).alpha).toBe(0);
    const still = shimmerAt(3, 1, true);
    expect([still.herdDx, still.mirrorDx, still.squash]).toEqual([0, 0, 1]);
    expect(still.alpha).toBeGreaterThan(0);
    // A slow breathe: alpha never jumps between frames.
    for (let t = 0; t < 10; t += 1 / 60)
      expect(
        Math.abs(shimmerAt(t + 1 / 60, 1, false).alpha - shimmerAt(t, 1, false).alpha),
      ).toBeLessThan(0.02);
  });
});
