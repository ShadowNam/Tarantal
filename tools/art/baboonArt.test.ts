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
import { ridgeLine } from './ridgeLine';
import { g, svgDoc } from './svg';
import { coreWidth } from '../../src/sim/world';
import { resolveMap } from '../../src/sim/maps';
import { rockTop } from '../../src/game/view/baboon/troopRock';

/** Feet within ±2 px of the art's top, looked for within SIDE_PX sideways (a seat is the median
 *  of a few columns); seats sit SINK_PX into the art. */
const SEAT_PX = 2;
const SIDE_PX = 6;
const SINK_PX = 2;
/** The lowest art may be the soft contact shadow under the feet (≤ 0.035 of a male's height). */
const FEET_PX = 8;

describe('baboon troops sit on their ridges, nothing floating (D-062)', () => {
  const content = loadContent();
  for (const base of content.biomes) {
    const maps: { name: string; layout?: string; bonus?: string }[] = [{ name: 'plain' }];
    for (const l of base.layouts) {
      maps.push({ name: l.id, layout: l.id });
      for (const b of base.bonusMaps)
        maps.push({ name: `${l.id}+${b.id}`, layout: l.id, bonus: b.id });
    }
    it(`${base.id}: on every map, every seat stands on its ridge's art (or the troop's rock)`, () => {
      for (const map of maps) {
        const m = resolveMap(base, map.layout, map.bonus).biome;
        for (const t of m.baboons?.troops ?? []) {
          if (t.chance === 0) continue;
          const layer = m.layers.find((l) => l.id === t.layer);
          if (layer === undefined) throw new Error(`${map.name}: no layer ${t.layer}`);
          const line = ridgeLine(base.id, t.layer);
          const cx = t.u * coreWidth(layer.scrollFactor);
          for (const s of t.seats) {
            const x = cx + s.dx;
            const feet = s.y - SINK_PX;
            if (t.rock !== undefined) {
              // On the rock's top (troopRock.ts), which stands on the ridge's art.
              expect(
                Math.abs(feet - (t.rock.y + rockTop(s.dx))),
                `${map.name} seat ${s.dx}`,
              ).toBeLessThanOrEqual(SEAT_PX);
              continue;
            }
            // The art's opaque top within a few px sideways is within ±2 px of the feet.
            let near = false;
            for (let d = -SIDE_PX; d <= SIDE_PX && !near; d++) {
              const top = line.at(x + d);
              near = top !== null && Math.abs(top - feet) <= SEAT_PX;
            }
            expect(near, `${map.name}: seat ${s.dx} (feet at ${feet}) is not on the art`).toBe(
              true,
            );
          }
          if (t.rock !== undefined) {
            // The rock's base is sunk into the ridge's art (opaque at its middle, below its top).
            const top = line.at(cx);
            expect(top, `${map.name}: art under the rock`).not.toBeNull();
            expect(t.rock.y).toBeGreaterThan(top ?? 0);
          }
        }
      }
    });
  }
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
