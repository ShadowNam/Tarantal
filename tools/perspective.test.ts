import { describe, expect, it } from 'vitest';
import { FAUNA_HERDS, lookHeight } from '../src/game/view/faunaHerds';
import { birdOversize, GUINEAFOWL_M, pxPerMetre, targetPx } from './perspective';
import { birdUnits } from './birdUnits';
import { loadContent, loadFeel } from './testContent';

describe('perspective audit (D-049, D-054)', () => {
  it('the product owner (9 Nov, D-080): every far animal at true size, the ostrich too', () => {
    const mul = loadFeel().fauna.sizeMul;
    const far = pxPerMetre(birdUnits('alert') * loadContent().scoring.planes.far.scale);
    // "yes make all animals true size" (superseding D-054's 0.57 and the ostrich's 0.45).
    for (const sp of [
      'elephant',
      'giraffe',
      'zebra',
      'wildebeest',
      'gemsbok',
      'springbok',
      'lechwe',
      'ostrich',
    ] as const)
      expect(mul[sp], sp).toBe(1);
    expect(lookHeight('elephant', 'm', far, mul.elephant)).toBeCloseTo(252.5, 0);
    expect(lookHeight('giraffe', 'm', far, mul.giraffe)).toBeCloseTo(394.6, 0);
    expect(lookHeight('zebra', 'm', far, mul.zebra)).toBeCloseTo(106.5, 0);
    expect(lookHeight('springbok', 'm', far, mul.springbok)).toBeCloseTo(63.1, 0);
    expect(lookHeight('ostrich', 'm', far, mul.ostrich)).toBeCloseTo(197.2, 0);
  });

  it('true proportions give an oversize of 1', () => {
    expect(birdOversize(10, 50, 2.5)).toBeCloseTo(1, 9);
    expect(targetPx(2.5, 40)).toBeCloseTo(200, 9);
    expect(pxPerMetre(40)).toBeCloseTo(40 / GUINEAFOWL_M, 9);
  });

  it('D-054: every far animal is drawn at its true size × its feel sizeMul beside the guineafowl on its plane', () => {
    const c = loadContent();
    const mul = loadFeel().fauna.sizeMul;
    const stand = birdUnits('alert');
    for (const herds of Object.values(FAUNA_HERDS))
      for (const h of herds) {
        const plane = h.layer === 'ver_veld' ? 'ver' : 'far';
        const bird = stand * c.scoring.planes[plane].scale;
        for (const a of h.animals) {
          if (a.variant === 'y') continue;
          const px = lookHeight(a.species, 'm', pxPerMetre(bird), mul[a.species]);
          // The product owner's rule: no far guineafowl stands taller than the animals beside it.
          expect(bird, `${h.key} ${a.species}`).toBeLessThan(px * 1.3);
          expect(birdOversize(bird, px, lookHeight(a.species, 'm', 1)), h.key).toBeCloseTo(
            1 / mul[a.species],
            6,
          );
        }
      }
  });
});
