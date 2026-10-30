// v1.8c (D-063): the Harvest sheet's table — its size matches harvestKeys.ts (the placeholder's),
// frames fit and never overlap, every box holds its feet.
import { describe, expect, it } from 'vitest';
import { HARVEST_SHEET_H, HARVEST_SHEET_W } from './harvestKeys';
import {
  HARVEST_FRAMES,
  HARVEST_FRAME_NAMES,
  harvestFrames,
  harvestSheetHeight,
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
});
