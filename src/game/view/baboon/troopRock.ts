// v1.8b (D-062, screenshot review round 1): the rock outcrop drawn under a troop whose ridge has no
// high ground of its own where its seats must be (the Okavango's far bank is a thin treeline there,
// and the troop seemed to float). Pure: the art (tools/art/baboons.ts), the seats in the biome file
// (placed on this top) and the "nothing floating" test all read the same profile. Ridge px at 1×;
// dx from the troop's middle, y up from the rock's base (negative).

/** Half the rock's width at its base, and its height in the middle. */
export const ROCK_HALF_W = 214;
export const ROCK_H = 100;

/** The rock's top at dx (≤ 0: above the base; 0 past its ends). A low dome with a few knobs. */
export function rockTop(dx: number): number {
  const u = dx / ROCK_HALF_W;
  if (Math.abs(u) >= 1) return 0;
  const dome = Math.pow(1 - u * u, 0.55);
  // Boulder knobs on the crest (fixed: the same rock every hunt).
  const knobs = 0.07 * Math.sin(u * 9.1 + 0.6) + 0.05 * Math.sin(u * 17.3 + 1.9);
  return -ROCK_H * dome * (1 + knobs * dome);
}
