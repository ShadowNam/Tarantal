// v1.10 (D-067): the Reënbui sheet's table — every frame inside the sheet the keys name, none
// overlapping, origins inside their frames, and the GPU cost inside the Okavango's HD headroom.
import { describe, expect, it } from 'vitest';
import {
  COLUMN_FRAMES,
  PUFF_FRAMES,
  REENBUI_SHEET_H,
  REENBUI_SHEET_W,
  columnFrame,
  puffFrame,
  reenbuiFrames,
  reenbuiSheetHeight,
  reenbuiTexelsPerPx,
} from './reenbuiSheet';

describe('Reënbui sheet (D-067)', () => {
  const frames = reenbuiFrames();

  it('fits the sheet the keys name, frames apart, origins inside', () => {
    expect(reenbuiSheetHeight()).toBeLessThanOrEqual(REENBUI_SHEET_H);
    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(REENBUI_SHEET_W);
      expect(f.ox).toBeGreaterThanOrEqual(0);
      expect(f.ox).toBeLessThanOrEqual(f.w);
      expect(f.oy).toBeGreaterThanOrEqual(0);
      expect(f.oy).toBeLessThanOrEqual(f.h);
      for (const o of frames)
        if (o !== f) {
          const apart =
            f.x + f.w <= o.x || o.x + o.w <= f.x || f.y + f.h <= o.y || o.y + o.h <= f.y;
          expect(apart, `${f.name} overlaps ${o.name}`).toBe(true);
        }
    }
    expect(new Set(frames.map((f) => f.name)).size).toBe(frames.length);
  });

  it('has every frame the view asks for', () => {
    const names = new Set(frames.map((f) => f.name));
    for (let i = -2; i < COLUMN_FRAMES * 2; i++) expect(names.has(columnFrame(i))).toBe(true);
    for (let i = -1; i <= PUFF_FRAMES; i++) expect(names.has(puffFrame(i))).toBe(true);
    for (const n of [
      'rain_far',
      'rain_near',
      'mound',
      'wet',
      'cloud_a',
      'cloud_b',
      'fork_a',
      'fork_b',
    ])
      expect(names.has(n as never)).toBe(true);
  });

  it('costs under 2 MB of texture memory at 1× (Standard in HD, D-067)', () => {
    expect(reenbuiTexelsPerPx(REENBUI_SHEET_W)).toBe(1);
    expect(REENBUI_SHEET_W * REENBUI_SHEET_H * 4).toBeLessThan(2 * 1024 * 1024);
  });
});
