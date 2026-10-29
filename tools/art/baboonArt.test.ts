// v1.8b (D-062): the baboons' interim art. Each troop's seats sit on its far ridge's skyline
// (within SEAT_PX of the art's top edge: the troop never floats in the sky or sinks into the hill),
// and every frame of the sheet keeps clear of its box's edges (nothing clipped) and stands on its
// feet: its lowest art (its feet, or the soft contact shadow under them) is within FEET_PX of the
// origin row (the moon's post stands on the ground too).
import { describe, expect, it } from 'vitest';
import { BABOON_FRAMES, BABOON_FRAME_NAMES } from '../../src/game/view/baboon/baboonSheet';
import { loadContent } from '../testContent';
import { opaqueBounds } from '../assets/image';
import { drawFrame, frameSeed } from './baboons';
import { renderSvg } from './raster';
import { ridgeLine, seatY } from './ridgeLine';
import { g, svgDoc } from './svg';
import { coreWidth } from '../../src/sim/world';

const SEAT_PX = 6;
/** The lowest art may be the soft contact shadow under the feet (≤ 0.035 of a male's height). */
const FEET_PX = 8;

describe('baboon troops sit on their ridges (D-062)', () => {
  const content = loadContent();
  for (const b of content.biomes)
    for (const t of b.baboons?.troops ?? [])
      it(`${b.id}/${t.id}: every seat is on the skyline`, () => {
        const layer = b.layers.find((l) => l.id === t.layer);
        if (layer === undefined) throw new Error('no layer');
        const line = ridgeLine(b.id, t.layer);
        for (const s of t.seats) {
          const x = t.u * coreWidth(layer.scrollFactor) + s.dx;
          const top = seatY(line, x);
          expect(top, `seat at ${x}`).not.toBeNull();
          expect(Math.abs(s.y - (top ?? 0)), `seat at ${x}`).toBeLessThanOrEqual(SEAT_PX);
        }
      });
});

describe('baboon frames (D-062)', () => {
  for (const name of BABOON_FRAME_NAMES)
    it(`${name}: inside its box, on its feet`, () => {
      const b = BABOON_FRAMES[name];
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
      // A clear pixel on every side: nothing is cut at the box's edge.
      expect(o.x, 'left').toBeGreaterThan(0);
      expect(o.y, 'top').toBeGreaterThan(0);
      expect(o.x + o.w, 'right').toBeLessThan(b.w);
      expect(o.y + o.h, 'bottom').toBeLessThan(b.h);
      // The tumble, and the ridge frames drawn tilted (climbing over the ridge, a youngster's
      // tumble in play), have no feet on the ground.
      if (name.startsWith('fx_') || ['tumble', 'r_down', 'r_up', 'r_play_b'].includes(name)) return;
      // Feet: the lowest art (the contact shadow aside, faint) is at the origin row.
      expect(Math.abs(o.y + o.h - b.oy), 'feet at the origin').toBeLessThanOrEqual(FEET_PX);
    });
});
