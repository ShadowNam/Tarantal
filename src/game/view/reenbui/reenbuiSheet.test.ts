// v1.10 (D-067): the Reënbui sheet's table — every frame inside the sheet the keys name, none
// overlapping, origins inside their frames, and the GPU cost inside the Okavango's HD headroom.
import { describe, expect, it } from 'vitest';
import {
  COLUMN_FRAMES,
  GPU_BYTES_CAP,
  PUFF_FRAMES,
  REENBUI_SHEET_H,
  REENBUI_SHEET_W,
  columnFrame,
  puffFrame,
  reenbuiFrames,
  reenbuiSheetHeight,
  reenbuiSheetWidth,
  reenbuiTexelsPerPx,
  sheetRect,
} from './reenbuiSheet';

describe('Reënbui sheet (D-067)', () => {
  const frames = reenbuiFrames();

  it('fits the sheet the keys name, frames apart, origins inside', () => {
    expect(reenbuiSheetHeight()).toBeLessThanOrEqual(REENBUI_SHEET_H);
    expect(reenbuiSheetWidth()).toBeLessThanOrEqual(REENBUI_SHEET_W);
    for (const fr of frames) {
      // On the sheet: cropped, half size for the frames drawn ×2.
      const f = { ...fr, ...sheetRect(fr) };
      expect([1, 0.5]).toContain(fr.res);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(REENBUI_SHEET_W);
      expect(fr.ox).toBeGreaterThanOrEqual(0);
      expect(fr.ox).toBeLessThanOrEqual(fr.w);
      expect(fr.oy).toBeGreaterThanOrEqual(0);
      expect(fr.oy).toBeLessThanOrEqual(fr.h);
      for (const or of frames)
        if (or !== fr) {
          const o = sheetRect(or);
          const apart =
            f.x + f.w <= o.x || o.x + o.w <= f.x || f.y + f.h <= o.y || o.y + o.h <= f.y;
          expect(apart, `${fr.name} overlaps ${or.name}`).toBe(true);
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

  it('costs at most GPU_BYTES_CAP (0.5 MiB) of texture memory at 1× (Standard in HD, D-067)', () => {
    expect(reenbuiTexelsPerPx(REENBUI_SHEET_W)).toBe(1);
    // RGBA: 512 × 256 × 4 = 524 288 bytes (the 1024 × 490 sheet was 2 007 040).
    expect(REENBUI_SHEET_W * REENBUI_SHEET_H * 4).toBeLessThanOrEqual(GPU_BYTES_CAP);
    expect(GPU_BYTES_CAP).toBeLessThanOrEqual(512 * 1024);
  });

  it('the half-size frames are the soft and repeating ones; the columns keep their foot', () => {
    const half = frames.filter((f) => f.res !== 1).map((f) => f.name);
    expect(half.sort()).toEqual(
      [
        'cloud_a',
        'cloud_b',
        'col_0',
        'col_1',
        'col_2',
        'col_3',
        'rain_far',
        'rain_near',
        'wet',
      ].sort(),
    );
    for (const f of frames.filter((x) => x.name.startsWith('col_'))) {
      expect(f.oy).toBeLessThan(f.h);
      expect(f.h).toBeGreaterThanOrEqual(420);
    }
  });
});
