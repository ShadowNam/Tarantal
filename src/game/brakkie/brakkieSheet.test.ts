// v1.12 (D-069): Brakkie's sheet table — every frame inside the sheet the keys name, none
// overlapping, origins inside their frames, and the GPU cost capped at 0.5 MiB (lessons 29, 38):
// 254.8 + 0.5 = 255.3 MB in the Okavango Reënbui HD hunt.
import { describe, expect, it } from 'vitest';
import { BRAKKIE_SHEET as KEY, BRAKKIE_SHEET_H as KH, BRAKKIE_SHEET_W as KW } from './brakkieKeys';
import {
  BRAKKIE_SHEET,
  BRAKKIE_SHEET_H,
  BRAKKIE_SHEET_W,
  GPU_BYTES_CAP,
  MOUTH,
  brakkieFrames,
  brakkieSheetHeight,
  brakkieTexelsPerPx,
  sheetRect,
} from './brakkieSheet';

describe('Brakkie sheet (D-069)', () => {
  const frames = brakkieFrames();

  it('fits the sheet the keys name, frames 2 px apart, origins inside', () => {
    expect([BRAKKIE_SHEET, BRAKKIE_SHEET_W, BRAKKIE_SHEET_H]).toEqual([KEY, KW, KH]);
    expect(brakkieSheetHeight()).toBeLessThanOrEqual(BRAKKIE_SHEET_H - 2);
    for (const fr of frames) {
      const f = sheetRect(fr);
      expect(f.x).toBeGreaterThanOrEqual(2);
      expect(f.y).toBeGreaterThanOrEqual(2);
      expect(f.x + f.w).toBeLessThanOrEqual(BRAKKIE_SHEET_W - 2);
      expect(fr.ox).toBeGreaterThanOrEqual(0);
      expect(fr.ox).toBeLessThanOrEqual(fr.w);
      expect(fr.oy).toBeGreaterThanOrEqual(0);
      expect(fr.oy).toBeLessThanOrEqual(fr.h);
      for (const or of frames)
        if (or !== fr) {
          const o = sheetRect(or);
          const apart =
            f.x + f.w + 2 <= o.x ||
            o.x + o.w + 2 <= f.x ||
            f.y + f.h + 2 <= o.y ||
            o.y + o.h + 2 <= f.y;
          expect(apart, `${fr.name} touches ${or.name}`).toBe(true);
        }
    }
    expect(new Set(frames.map((f) => f.name)).size).toBe(frames.length);
  });

  it('costs at most 0.5 MiB on the GPU (Standard); the HD twin is 2×', () => {
    expect(BRAKKIE_SHEET_W * BRAKKIE_SHEET_H * 4).toBeLessThanOrEqual(GPU_BYTES_CAP);
    expect(GPU_BYTES_CAP).toBe(512 * 1024);
    expect(brakkieTexelsPerPx(BRAKKIE_SHEET_W)).toBe(1);
    expect(brakkieTexelsPerPx(BRAKKIE_SHEET_W * 2)).toBe(2);
  });

  it('the mouth the bird hangs from is inside each running frame', () => {
    for (const name of ['run_a', 'run_b'] as const) {
      const f = frames.find((x) => x.name === name);
      if (f === undefined) throw new Error(name);
      const m = MOUTH[name];
      expect(f.ox + m.x).toBeGreaterThan(0);
      expect(f.ox + m.x).toBeLessThan(f.w);
      expect(f.oy + m.y).toBeGreaterThan(0);
      expect(f.oy + m.y).toBeLessThan(f.h);
    }
  });
});
