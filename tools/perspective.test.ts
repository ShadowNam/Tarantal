import { describe, expect, it } from 'vitest';
import { FAUNA_DRAW } from './art/faunaSheets';
import { ANIMAL_M, birdOversize, GUINEAFOWL_M, pxPerMetre, targetPx } from './perspective';
import { birdUnits } from './perspective-audit';
import { loadContent, loadFeel } from './testContent';

describe('perspective audit (D-049)', () => {
  it('true proportions give an oversize of 1', () => {
    expect(birdOversize(10, 50, 2.5)).toBeCloseTo(1, 9);
    expect(targetPx(2.5, 40)).toBeCloseTo(200, 9);
    expect(pxPerMetre(40)).toBeCloseTo(40 / GUINEAFOWL_M, 9);
  });

  it('the Karoo ostriches: a far guineafowl was 12× too big beside them, now under 3×', () => {
    const c = loadContent();
    const feel = loadFeel();
    const stand = birdUnits('alert');
    const ostrich = FAUNA_DRAW['fauna/karoo_ostrich']?.animals[0];
    if (ostrich === undefined) throw new Error('no Karoo ostriches');
    expect(ostrich.kind).toBe('ostrich');
    const before = birdOversize(stand * 0.22, ostrich.h, ANIMAL_M.ostrich);
    const k = feel.perspective.faunaScale['fauna/karoo_ostrich'] ?? 1;
    const birdNow = stand * c.scoring.planes.far.scale;
    const after = birdOversize(birdNow, ostrich.h * k, ANIMAL_M.ostrich);
    expect(before).toBeGreaterThan(10);
    expect(after).toBeLessThan(3);
    // The product owner's rule: a far guineafowl never stands taller than the ostrich beside it.
    expect(birdNow).toBeLessThan(ostrich.h * k);
  });

  it('no far guineafowl stands taller than a springbok (shoulder) or an ostrich on its plane', () => {
    const c = loadContent();
    const feel = loadFeel();
    const stand = birdUnits('alert');
    for (const [key, draw] of Object.entries(FAUNA_DRAW)) {
      const k = feel.perspective.faunaScale[key] ?? 1;
      const plane = key === 'fauna/namibie_waterhole' ? 'ver' : 'far';
      const bird = stand * c.scoring.planes[plane].scale;
      for (const a of draw.animals) {
        if (a.kind !== 'springbok' && a.kind !== 'ostrich') continue;
        // A springbok's head stands about 1.3 × its shoulder height.
        const top = a.kind === 'springbok' ? a.h * k * 1.3 : a.h * k;
        expect(bird, `${key} ${a.kind}`).toBeLessThanOrEqual(top);
      }
    }
  });
});
