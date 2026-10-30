// v1.8c (D-063): the Harvest sheet's interim art — every frame keeps clear of its box's edges
// (nothing clipped) and stands on its feet: its lowest art (the feet, the posts' foot, or the soft
// contact shadow) is within FEET_PX of the origin row. The tumble (rolling over) and the hanging
// sign have no feet on the ground.
import { describe, expect, it } from 'vitest';
import { HARVEST_FRAMES, HARVEST_FRAME_NAMES } from '../../src/game/view/harvest/harvestSheet';
import { opaqueBounds } from '../assets/image';
import { drawFrame, frameSeed } from './harvest';
import { renderSvg } from './raster';
import { g, svgDoc } from './svg';

const FEET_PX = 8;

describe('Harvest frames (D-063)', () => {
  for (const name of HARVEST_FRAME_NAMES)
    it(`${name}: inside its box, on its feet`, () => {
      const b = HARVEST_FRAMES[name];
      const img = renderSvg(
        svgDoc(
          b.w,
          b.h,
          [0, 0, b.w, b.h],
          '',
          g({ transform: `translate(${b.ox} ${b.oy})` }, drawFrame(name, frameSeed(name))),
        ),
      );
      const o = opaqueBounds(img);
      expect(o).not.toBeNull();
      if (o === null) return;
      expect(o.x, 'left').toBeGreaterThan(0);
      expect(o.y, 'top').toBeGreaterThan(0);
      expect(o.x + o.w, 'right').toBeLessThan(b.w);
      expect(o.y + o.h, 'bottom').toBeLessThan(b.h);
      if (name === 'wh_tumble' || name === 'sign_oes') return;
      expect(Math.abs(o.y + o.h - b.oy), 'feet at the origin').toBeLessThanOrEqual(FEET_PX);
    });
});
