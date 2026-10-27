// D-049 (perspective): real sizes and the helpers that compare what is drawn on a plane with what
// real proportions would give. Pure (no I/O); tools/perspective-audit.ts reads the art and prints
// the tables in docs/balance/perspective.md.
import type { FaunaSpecies as AnimalKind } from '../src/game/view/faunaHerds';

/** A helmeted guineafowl standing (feet to the top of the casque), metres. */
export const GUINEAFOWL_M = 0.5;

/**
 * Real heights (m) in the sense the fauna art's `h` is drawn: the shoulder for the quadrupeds,
 * the top of the head for the giraffe and the ostrich (tools/art/farFauna.ts).
 */
export const ANIMAL_M: Readonly<Record<AnimalKind, number>> = {
  elephant: 3.2,
  giraffe: 5.0,
  zebra: 1.35,
  wildebeest: 1.4,
  gemsbok: 1.2,
  springbok: 0.8,
  ostrich: 2.5,
  lechwe: 1.0,
};

/** What the height is measured to, per species (for the tables). */
export const ANIMAL_MEASURE: Readonly<Record<AnimalKind, 'shoulder' | 'head'>> = {
  elephant: 'shoulder',
  giraffe: 'head',
  zebra: 'shoulder',
  wildebeest: 'shoulder',
  gemsbok: 'shoulder',
  springbok: 'shoulder',
  ostrich: 'head',
  lechwe: 'shoulder',
};

/** Real heights (m) of the props on the bird planes, by asset key; null = not a size cue. */
export const PROP_M: Readonly<Record<string, number | null>> = {
  'karoo/windpomp': 9,
  'karoo/reservoir': 1.5,
  'karoo/bakkie': 1.8,
  'karoo/fence_bell': 1.3,
  'karoo/potjie': 0.4,
  'bushveld/baobab': 15,
  'bushveld/dassie_koppie': null,
  'bushveld/boulder_crack': null,
  'bushveld/boulder_a': null,
  'bushveld/boulder_b': null,
  'kalahari/weaver_camelthorn': 9,
  'kalahari/windpomp_sign': 9,
  'kalahari/dead_camelthorn': 6,
  'namibie/nest_camelthorn': 9,
  'namibie/camelthorn_mature': 8,
  'namibie/camelthorn_old': 9,
  'namibie/camelthorn_young': 3,
  'namibie/quiver_tree': 5,
  'namibie/quiver_egg': 5,
  'okavango/reeds_a': 2.5,
  'okavango/reeds_b': 2.5,
  'okavango/reeds_c': 2.5,
  'okavango/reeds_d': 2.5,
  'okavango/mokoro_pole': 3,
  'okavango/sausage_tree': 12,
  'okavango/hippo': 1.0,
  'okavango/lily_frog': null,
};

/** Design px per metre on a plane, from the drawn standing guineafowl there. */
export const pxPerMetre = (birdStandingPx: number): number => birdStandingPx / GUINEAFOWL_M;

/** The on-screen height real proportions give an object of `metres` beside that bird. */
export const targetPx = (metres: number, birdStandingPx: number): number =>
  metres * pxPerMetre(birdStandingPx);

/**
 * How many times too big the bird is drawn next to an object: (bird / object as drawn) over
 * (bird / object in life). 1 = true proportions; 2 = the bird looks twice as big as it should.
 */
export const birdOversize = (birdPx: number, objectPx: number, objectM: number): number =>
  birdPx / objectPx / (GUINEAFOWL_M / objectM);
