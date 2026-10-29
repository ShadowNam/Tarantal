// v1.7e (review R8): no tell animal floats off its prop. Each tell's feet (its prop's placement +
// the secret's tell ox/oy) stand on an opaque pixel of the prop's art, or on one at most
// FEET_DROP_PX below them. Checked for every tell in every biome.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../testContent';
import { FEET_DROP_PX, tellFeet } from './tellFeet';

/**
 * Intentional exceptions, by species, with the reason. Keep this short: a tell on nothing reads
 * as hovering.
 */
const STANDS_ON_ITS_OWN_ART: Readonly<Record<string, string>> = {
  // The jacana is drawn standing on its own floating lily leaf (part of its frames,
  // tools/art/tells.ts), on open water beside the frog's lily, which the prop leaves transparent.
  african_jacana: 'its own lily leaf, drawn in its frames',
};

describe('tell animals stand on their props (review R8)', () => {
  const feet = tellFeet(loadContent(), join(import.meta.dirname, '..', '..'));

  it('checks all thirteen', () => {
    expect(feet).toHaveLength(13);
  });

  for (const f of feet)
    it(`${f.biome}/${f.prop}: the ${f.species} has art under its feet`, () => {
      if (f.species in STANDS_ON_ITS_OWN_ART) return;
      expect(f.drop, `nothing within ${FEET_DROP_PX} px below the feet`).not.toBeNull();
    });
});
