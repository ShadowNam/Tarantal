// v1.18 (D-081): the Phase 2 sheet's table — its size matches harvest2Keys.ts (the
// placeholder's), frames fit and never overlap, every box holds its origin; it has no HD twin.
import { describe, expect, it } from 'vitest';
import hd from '../../../../public/assets/asset-index-hd.json' with { type: 'json' };
import { hdAllowed } from '../../assets/hdPack';
import { RAIDER_H } from '../baboon/baboonSheet';
import { HARVEST2_SHEET, HARVEST2_SHEET_H, HARVEST2_SHEET_W } from './harvest2Keys';
import {
  BABOON2_H,
  HARVEST2_FRAMES,
  HARVEST2_FRAME_NAMES,
  harvest2Frames,
  harvest2SheetHeight,
} from './harvest2Sheet';

describe('Harvest Phase 2 sheet (D-081)', () => {
  it('fits the size the placeholder declares', () => {
    expect(harvest2SheetHeight()).toBe(HARVEST2_SHEET_H);
    for (const f of harvest2Frames()) expect(f.x + f.w).toBeLessThanOrEqual(HARVEST2_SHEET_W);
    expect(harvest2Frames()).toHaveLength(HARVEST2_FRAME_NAMES.length);
    for (const n of HARVEST2_FRAME_NAMES) expect(HARVEST2_FRAMES[n], n).toBeDefined();
  });

  it('frames never overlap, and each holds its origin', () => {
    const fr = harvest2Frames();
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

  it('its baboons are drawn at the raiders’ size; Standard in HD (no twin: HD memory)', () => {
    expect(BABOON2_H).toBe(RAIDER_H);
    expect(hdAllowed(HARVEST2_SHEET)).toBe(false);
    expect((hd.images as Record<string, unknown>)[HARVEST2_SHEET]).toBeUndefined();
  });
});
