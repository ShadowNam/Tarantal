// v1.22.1 (D-086): the size editor's areas (`?admin=1&sizes=<area>`). Tiny: main.ts reads the
// address with it (first download); the knobs and each area's biome are in the lazy chunk
// (sizeKnobs.ts SIZE_AREAS, SIZE_AREA_BIOME).
export type SizeArea = 'karoo' | 'bushveld' | 'kalahari' | 'okavango' | 'namibie' | 'oes';

export const isSizeArea = (s: string | null): s is SizeArea =>
  s !== null && /^(karoo|bushveld|kalahari|okavango|namibie|oes)$/.test(s);

/** The size editor holds its hunt at this tick: the previews have brought everything out (the
 *  cameos at 0.5 s, Brakkie at 0.5 s, the ridge's peeks within 2 s, a raider in by ~6 s). */
export const SIZE_HOLD_TICK = 480;
