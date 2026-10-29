import { describe, expect, it } from 'vitest';
import { ORYX_ROAMS, heatOf, roamAt, shimmerAt } from './oryxRoam';

const roam = ORYX_ROAMS.namibie?.[0];

describe('oryx in the mirage (v1.7d, D-059)', () => {
  it('a gemsbok herd walks the far pan from the gemsbok sheet (no art of its own)', () => {
    expect(roam?.herd.sheet).toBe('fauna/namibie_gemsbok');
    expect(roam?.herd.layer).toBe('far_veld');
    expect(roam?.herd.animals.length).toBeGreaterThanOrEqual(3);
    expect(roam?.herd.animals.length).toBeLessThanOrEqual(6);
    for (const a of roam?.herd.animals ?? []) expect(a.species).toBe('gemsbok');
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
