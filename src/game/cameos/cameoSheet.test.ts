import { describe, expect, it } from 'vitest';
import { CAMEO_SHEETS, CAMEO_SHEET_AREAS, CAMEO_SHEET_SIZE, cameoSheetKey } from './cameoKeys';
import { GPU_BYTES_CAP, cameoFrames, cameoSheetHeight, cellSize } from './cameoSheet';

describe('cameo sheets (D-075)', () => {
  for (const area of CAMEO_SHEET_AREAS) {
    it(`${area}: packs inside its declared size, frames apart`, () => {
      const { w, h } = CAMEO_SHEET_SIZE[area];
      expect(cameoSheetHeight(area)).toBeLessThanOrEqual(h);
      const rs = cameoFrames(area);
      for (const r of rs) {
        const c = cellSize(r);
        expect(r.x + c.w).toBeLessThanOrEqual(w);
        expect(r.ox).toBeGreaterThan(0);
        expect(r.ox).toBeLessThan(r.w);
        expect(r.oy).toBeLessThan(r.h);
      }
      for (const a of rs)
        for (const b of rs) {
          if (a === b) continue;
          const ca = cellSize(a);
          const cb = cellSize(b);
          const apart =
            a.x + ca.w <= b.x || b.x + cb.w <= a.x || a.y + ca.h <= b.y || b.y + cb.h <= a.y;
          expect(apart).toBe(true);
        }
    });
    it(`${area}: the 1× sheet stays inside the GPU-bytes cap (lessons 29, 38)`, () => {
      const { w, h } = CAMEO_SHEET_SIZE[area];
      expect(w * h * 4).toBeLessThanOrEqual(GPU_BYTES_CAP);
    });
    it(`${area}: the literal key matches the key builder (the asset audit reads it)`, () => {
      expect(CAMEO_SHEETS[area]).toBe(cameoSheetKey(area));
    });
  }
});
