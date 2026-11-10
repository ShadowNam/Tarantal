import { describe, expect, it } from 'vitest';
import { CAMEO_SHEETS, CAMEO_SHEET_AREAS, CAMEO_SHEET_SIZE, cameoSheetKey } from './cameoKeys';
import { loadContent } from '../../../tools/testContent';
import {
  CAMEO_SIZE_MUL,
  GPU_BYTES_CAP,
  cameoFrames,
  cameoSheetHeight,
  cellSize,
  frameKind,
} from './cameoSheet';

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

describe('the cameos at true size (D-080)', () => {
  // v1.22.1 (D-086): the view shows a kind at content's sizeMul ÷ the art's growth (the hit shapes
  // are × sizeMul), so an owner-set size (npm run sizes:apply) matches its hit shapes before the
  // frames are redrawn; within ±(1/1.5) of the drawn size the art stays crisp enough.
  it("content's sizeMul is the art's growth, or an owner-set size the art still covers", () => {
    const kinds = loadContent().cameos.kinds;
    for (const [kind, mul] of Object.entries(CAMEO_SIZE_MUL)) {
      const ratio = kinds[kind as keyof typeof CAMEO_SIZE_MUL].sizeMul / mul;
      expect(ratio, kind).toBeGreaterThanOrEqual(1 / 1.5);
      expect(ratio, kind).toBeLessThanOrEqual(1.5);
    }
  });

  it('every frame belongs to a kind and is drawn at its size', () => {
    for (const area of CAMEO_SHEET_AREAS)
      for (const f of cameoFrames(area)) expect(f.size).toBe(CAMEO_SIZE_MUL[frameKind(f.name)]);
  });

  it('the dung beetle stays as it was: bigger than life on purpose', () => {
    expect(CAMEO_SIZE_MUL.dungBeetle).toBe(1);
  });
});
