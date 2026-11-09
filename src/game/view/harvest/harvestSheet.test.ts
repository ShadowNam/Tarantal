// v1.8c (D-063): the Harvest sheet's table — its size matches harvestKeys.ts (the placeholder's),
// frames fit and never overlap, every box holds its feet.
import { describe, expect, it } from 'vitest';
import modes from '../../../../content/modes.json' with { type: 'json' };
import scoring from '../../../../content/scoring.json' with { type: 'json' };
import { HARVEST_SHEET_H, HARVEST_SHEET_W } from './harvestKeys';
import {
  HARVEST_FRAMES,
  HARVEST_FRAME_NAMES,
  harvestFrames,
  harvestSheetHeight,
  FENCE_POST_H,
} from './harvestSheet';

describe('Harvest sheet (D-063)', () => {
  it('fits the size the placeholder declares', () => {
    expect(harvestSheetHeight()).toBe(HARVEST_SHEET_H);
    for (const f of harvestFrames()) expect(f.x + f.w).toBeLessThanOrEqual(HARVEST_SHEET_W);
    expect(harvestFrames()).toHaveLength(HARVEST_FRAME_NAMES.length);
    for (const n of HARVEST_FRAME_NAMES) expect(HARVEST_FRAMES[n], n).toBeDefined();
  });

  it('frames never overlap, and each holds its feet', () => {
    const fr = harvestFrames();
    for (let i = 0; i < fr.length; i++) {
      const a = fr[i];
      if (a === undefined) continue;
      expect(a.ox, a.name).toBeGreaterThanOrEqual(0);
      expect(a.ox, a.name).toBeLessThanOrEqual(a.w);
      expect(a.oy, a.name).toBeGreaterThanOrEqual(0);
      expect(a.oy, a.name).toBeLessThanOrEqual(a.h);
      for (let j = i + 1; j < fr.length; j++) {
        const b = fr[j];
        if (b === undefined) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
    }
  });

  // v1.8c review round 1: a worker on the mid plane stands ~1.5× the fence's posts (a person by a
  // 1.2 m fence), not a giant. (A warthog's back was about the post's height until D-080.)
  it('the workers are sized to the fence on the mid plane', () => {
    const mid = scoring.planes.mid.scale;
    const worker = modes.modes.harvest.workers.heightPx * mid;
    expect(worker / FENCE_POST_H).toBeGreaterThanOrEqual(1.3);
    expect(worker / FENCE_POST_H).toBeLessThanOrEqual(1.8);
  });

  it('D-080: the warthogs are their true size beside the guineafowl, no longer the fence’s', () => {
    // tools/sizes.test.ts holds them to ±15 % of a 0.7 m warthog; against the stage-scaled fence
    // posts they now stand taller than a post.
    const hog = modes.modes.harvest.warthogs.heightPx * scoring.planes.mid.scale;
    expect(hog / FENCE_POST_H).toBeGreaterThan(1.2);
  });
});
