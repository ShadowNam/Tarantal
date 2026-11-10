// v1.22.1 (D-086): the size editor's areas (`?admin=1&sizes=<area>`), each the biome it plays.
// Tiny: main.ts reads the address with it (first download); the knobs are in the lazy chunk.
export const SIZE_AREAS = ['karoo', 'bushveld', 'kalahari', 'okavango', 'namibie', 'oes'] as const;
export type SizeArea = (typeof SIZE_AREAS)[number];

export const SIZE_AREA_BIOME: Readonly<Record<SizeArea, string>> = {
  karoo: 'karoo-autumn',
  bushveld: 'bushveld-winter',
  kalahari: 'kalahari-summer',
  okavango: 'okavango-spring',
  namibie: 'namibie',
  oes: 'oes',
};

export const isSizeArea = (s: string | null): s is SizeArea =>
  s !== null && (SIZE_AREAS as readonly string[]).includes(s);

/** The size editor holds its hunt at this tick: the previews have brought everything out (the
 *  cameos at 0.5 s, Brakkie at 0.5 s, the ridge's peeks within 2 s, a raider in by ~6 s). */
export const SIZE_HOLD_TICK = 480;
