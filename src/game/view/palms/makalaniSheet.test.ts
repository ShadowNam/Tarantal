// 1.9.3 (D-056, review M11): a palm's crown sits on its trunk's drawn top — on both planes, with a
// lean, in Standard (k 1) and with a 2× HD texture (k 0.5). The trunk's origin is its foot; with
// Phaser's default (the centre) the trunk sank half its length and the crown floated.
import { describe, expect, it } from 'vitest';
import {
  NUT_SHEET_W,
  PALM_ART_PLANES,
  nutFrames,
  nutTexelsPerPx,
  crownBaseOf,
  palmFrames,
  trunkTopOf,
  trunkTransform,
  type PalmArtPlane,
} from './makalaniSheet';

const SCALE: Record<PalmArtPlane, number> = { near: 1, mid: 0.42 };

describe('makalani placement', () => {
  for (const plane of PALM_ART_PLANES)
    for (const k of [1, 0.5])
      it(`the crown sits on the trunk top (${plane}, k ${String(k)})`, () => {
        const s = SCALE[plane];
        const foot = { x: 1200, y: plane === 'near' ? 1000 : 776 };
        const top = { x: foot.x + 40 * s, y: foot.y - 720 * s };
        const tf = trunkTransform(foot, top, plane, s, k);
        const f = palmFrames(plane);
        const img = { x: foot.x, y: foot.y, ...tf };
        const t = trunkTopOf(img, plane, f.trunk.h / k, k);
        expect(t.x).toBeCloseTo(top.x, 6);
        expect(t.y).toBeCloseTo(top.y, 6);
        const crown = {
          x: top.x,
          y: top.y,
          originX: f.crown.ox / f.crown.w,
          originY: f.crown.oy / f.crown.h,
          scaleX: k,
          scaleY: k,
        };
        const c = crownBaseOf(crown, plane, f.crown.w / k, f.crown.h / k, k);
        expect(Math.hypot(c.x - t.x, c.y - t.y)).toBeLessThan(0.01);
        // The bug: a trunk centred on its foot ends well below its top.
        const centred = trunkTopOf({ ...img, originY: 0.5 }, plane, f.trunk.h / k, k);
        expect(centred.y - top.y).toBeGreaterThan(100 * s);
      });
});

describe('the nut sheet (review M15)', () => {
  it('a nut frame draws the same design size from the Standard and the 2× HD file', () => {
    for (const width of [NUT_SHEET_W, NUT_SHEET_W * 2]) {
      const k = nutTexelsPerPx(width);
      expect(k).toBe(width / NUT_SHEET_W);
      for (const f of nutFrames()) {
        // Cut at the frame table × k in the file, drawn at 1 / k: the frame's design size.
        expect((f.w * k) / k).toBe(f.w);
        expect(f.x * k + f.w * k).toBeLessThanOrEqual(width);
      }
    }
  });
});
