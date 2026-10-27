import { describe, expect, it } from 'vitest';
import type { FaunaPose, FaunaSpecies, FaunaVariant } from '../../src/game/view/faunaHerds';
import { drawLook } from './farFauna';
import { resetIds } from './scenery';

const SPECIES: FaunaSpecies[] = [
  'zebra',
  'wildebeest',
  'gemsbok',
  'springbok',
  'lechwe',
  'giraffe',
  'elephant',
  'ostrich',
];
const POSES: FaunaPose[] = ['graze', 'alert', 'walk'];
const VARIANTS: FaunaVariant[] = ['m', 'f', 'y'];

describe('far fauna drawing (D-054)', () => {
  it('draws every look in parts, deterministically, with pivots inside its box', () => {
    for (const species of SPECIES)
      for (const pose of POSES)
        for (const variant of VARIANTS) {
          const look = { species, pose, variant, h: 100 };
          resetIds();
          const a = drawLook(look);
          resetIds();
          const b = drawLook(look);
          expect(a).toEqual(b);
          expect(a.parts.body).toBeTruthy();
          expect(a.parts.head).toBeTruthy();
          expect(a.pivots.body).toEqual([0, 0]);
          for (const p of Object.values(a.pivots)) {
            expect(p[0]).toBeGreaterThan(a.box.x0);
            expect(p[0]).toBeLessThan(a.box.x1);
            expect(p[1]).toBeGreaterThan(a.box.y0);
            expect(p[1]).toBeLessThan(a.box.y1);
          }
          // The feet stand on y = 0: the box reaches just below it.
          expect(a.box.y1).toBeGreaterThan(0);
          expect(a.box.y1).toBeLessThan(40);
        }
  });

  it('elephants have an ear part; the giraffe drinks splay-legged', () => {
    expect(
      drawLook({ species: 'elephant', pose: 'alert', variant: 'm', h: 100 }).parts.ear,
    ).toBeTruthy();
    const drink = drawLook({ species: 'giraffe', pose: 'drink', variant: 'f', h: 100 });
    const stand = drawLook({ species: 'giraffe', pose: 'alert', variant: 'f', h: 100 });
    expect(drink.pivots.head?.[1]).toBeGreaterThan(stand.pivots.head?.[1] ?? 0);
  });
});
