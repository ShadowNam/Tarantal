// v1.18 (D-081): every Phase 2 frame sits inside its box with a clear pixel on every side
// (nothing clipped at a box edge); the ground frames stand on their origin.
import { describe, expect, it } from 'vitest';
import { HARVEST2_FRAMES, HARVEST2_FRAME_NAMES } from '../../src/game/view/harvest/harvest2Sheet';
import { opaqueBounds } from '../assets/image';
import { drawFrame2, frameSeed2 } from './harvest2';
import { renderSvg } from './raster';
import { g, svgDoc } from './svg';

/** Frames off the ground (in the air, on the fence) or the patch: no feet to stand on. */
const AIRBORNE = ['wh_jump_a', 'wh_jump_b', 'bb_climb_a', 'bb_climb_b', 'bb_drop'];

describe('Harvest Phase 2 frames (D-081)', () => {
  for (const name of HARVEST2_FRAME_NAMES)
    it(`${name}: inside its box${AIRBORNE.includes(name) ? '' : ', on its feet'}`, () => {
      const b = HARVEST2_FRAMES[name];
      const img = renderSvg(
        svgDoc(
          b.w,
          b.h,
          [0, 0, b.w, b.h],
          '',
          g({ transform: `translate(${b.ox} ${b.oy})` }, drawFrame2(name, frameSeed2(name))),
        ),
      );
      const o = opaqueBounds(img);
      expect(o).not.toBeNull();
      if (o === null) return;
      expect(o.x, 'left').toBeGreaterThan(0);
      expect(o.y, 'top').toBeGreaterThan(0);
      expect(o.x + o.w, 'right').toBeLessThan(b.w);
      expect(o.y + o.h, 'bottom').toBeLessThan(b.h);
      if (AIRBORNE.includes(name)) return;
      expect(Math.abs(o.y + o.h - b.oy), 'feet at the origin').toBeLessThanOrEqual(12);
    });
});
