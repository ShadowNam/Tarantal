// v1.13 (D-075): the elephants that answer a flush (content/cameos.json kinds.elephants.herd) are the
// Okavango's far herd as the view draws it (faunaHerds.ts): the same layer and u.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { FAUNA_HERDS } from '../view/faunaHerds';

describe('the trumpeting herd (D-075)', () => {
  it('is the far elephant herd of every map whose cameos include the elephants', () => {
    const c = loadContent().cameos;
    const herd = c.kinds.elephants.herd;
    const maps = c.areas.filter((a) => a.cameos.includes('elephants'));
    expect(maps.length).toBeGreaterThan(0);
    for (const a of maps) {
      const drawn = (FAUNA_HERDS[a.biome] ?? []).find((h) =>
        h.animals.some((x) => x.species === 'elephant'),
      );
      expect(drawn?.layer).toBe(herd.layer);
      expect(drawn?.u).toBe(herd.u);
    }
  });
});
