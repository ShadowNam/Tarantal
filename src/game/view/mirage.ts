// v1.4 B (D-039): the Namibië mirage strips' look per frame, as a pure function of sim time (a
// held frame holds them). A slow breathe (≥ 3 s per cycle, never a flash) and a gentle sideways
// ripple; with "reduce flashes" or reduced motion the strips hold still at their base alpha.

/** Radians per second of the breathe (2π / 2.1 ≈ a 3 s cycle). */
export const MIRAGE_BREATHE = 2.1;

export interface MirageStrip {
  /** Phase offset (radians) and resting alpha of one strip. */
  readonly phase: number;
  readonly base: number;
}

/** A strip's alpha and horizontal scale factor at `simSeconds`. */
export function mirageLook(
  strip: MirageStrip,
  simSeconds: number,
  still: boolean,
): { readonly alpha: number; readonly scaleX: number } {
  if (still) return { alpha: strip.base, scaleX: 1 };
  return {
    alpha: strip.base * (0.6 + 0.4 * Math.sin(simSeconds * MIRAGE_BREATHE + strip.phase)),
    scaleX: 1 + 0.08 * Math.sin(simSeconds * 1.3 + strip.phase * 0.7),
  };
}
