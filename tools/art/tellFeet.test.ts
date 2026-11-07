// v1.7e (review R8): no tell animal floats off its prop. Each tell's feet (its prop's placement +
// the secret's tell ox/oy) stand on an opaque pixel of the prop's art, or on one at most
// FEET_DROP_PX below them. Checked for every tell in every biome.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../testContent';
import { TELL_BOXES } from '../../src/game/view/tell/tellSheet';
import { FEET_DROP_PX, tellEnds, tellFeet } from './tellFeet';

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

// v1.12 (polish b): the Bushveld agama's tail stuck out past its koppie onto the sand (facing left,
// its tail ran off the rock's right edge). A lizard lying flat has its rock under its whole length:
// at its head and its tail the prop's art reaches up to its line (within 6 px).
describe('lizards lie on their rock, head to tail (polish b)', () => {
  const ends = tellEnds(loadContent(), join(import.meta.dirname, '..', '..'), TELL_BOXES);

  it('checks the agama', () => {
    expect(ends.map((e) => e.species)).toEqual(['rock_agama']);
  });

  for (const e of ends)
    it(`${e.biome}/${e.prop}: the ${e.species}'s head and tail are on its rock`, () => {
      expect(e.head, 'head end').not.toBeNull();
      expect(e.tail, 'tail end').not.toBeNull();
      expect(e.head ?? -99, 'head end').toBeGreaterThanOrEqual(-6);
      expect(e.tail ?? -99, 'tail end').toBeGreaterThanOrEqual(-6);
    });
});
