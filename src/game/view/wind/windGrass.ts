// v1.17 (D-079): how the near grass tufts bow in the wind — pure, so the lean matches the sim's
// drift rule (strength ^ strengthExponent: a breeze barely bends them, a gust lays them over).
export interface GrassLean {
  /** Radians, signed downwind. */
  readonly lean: number;
  /** Radians of flutter amplitude. */
  readonly flutter: number;
}

export function grassLean(dir: 1 | -1, strength: number, exponent: number): GrassLean {
  const s = Math.max(0, Math.min(1, strength));
  const shaped = s ** exponent;
  return { lean: dir * (0.06 + 0.5 * shaped), flutter: 0.03 + 0.12 * s };
}
