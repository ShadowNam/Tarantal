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

  // v1.17b (D-080): the field at true scale beside the guineafowl — a warthog (~0.7 m at the
  // back) ~0.4× a worker (~1.7 m) and ~0.6× a fence post (~1.2 m); a worker ~1.4× the post.
  // From content (modes.json harvest: warthogs, workers, fence), on any plane alike.
  it('the warthogs, the workers and the fence are in real proportion', () => {
    const H = modes.modes.harvest;
    const hog = H.warthogs.heightPx;
    const worker = H.workers.heightPx;
    const post = H.fence.postPx;
    expect(hog / worker).toBeGreaterThanOrEqual(0.35);
    expect(hog / worker).toBeLessThanOrEqual(0.5);
    expect(hog / post).toBeGreaterThanOrEqual(0.5);
    expect(hog / post).toBeLessThanOrEqual(0.75);
    expect(worker / post).toBeGreaterThanOrEqual(1.3);
    expect(worker / post).toBeLessThanOrEqual(1.8);
  });

  it('the drawn fence is content’s fence on the mid plane (the layer art and the gap panel)', () => {
    expect(FENCE_POST_H).toBeCloseTo(
      modes.modes.harvest.fence.postPx * scoring.planes.mid.scale,
      0,
    );
  });
});
