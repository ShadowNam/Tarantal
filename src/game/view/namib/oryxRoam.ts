// v1.7d (D-059, GDD §11.3c) The oryx (gemsbok) herd that roams the far pan through the mirage:
// where it is and which way it faces at a sim tick (a pure function of the tick, so a held frame
// holds and every device shows the same herd), and how strongly the heat shimmers. View-only:
// the sim never sees the herd.
import type { FaunaHerd } from '../faunaHerds';

export interface OryxRoam {
  /** The herd as FaunaView draws it (anchored at u 0: the view moves its holder). */
  readonly herd: FaunaHerd;
  /** Share of the layer's core width it walks between, there and back. */
  readonly spanU: readonly [number, number];
  readonly pxPerSec: number;
  /** It walks for walkSeconds, then stands for pauseSeconds, and so on. */
  readonly walkSeconds: number;
  readonly pauseSeconds: number;
  /** Seconds into its cycle at tick 0 (where the hunt finds it). */
  readonly phaseSeconds: number;
  /** The mirror image on the shimmer band: its gap below the feet, squash and alpha at full heat. */
  readonly reflect: { readonly gapPx: number; readonly squash: number; readonly alpha: number };
}

/** The roaming herds per biome (the Namibië far pan): the gemsbok sheet's walking look. */
export const ORYX_ROAMS: Readonly<Record<string, readonly OryxRoam[]>> = {
  namibie: [
    {
      herd: {
        key: 'fauna/namibie_oryx',
        sheet: 'fauna/namibie_gemsbok',
        layer: 'far_veld',
        u: 0,
        y: 596,
        animals: [
          { species: 'gemsbok', pose: 'walk', variant: 'm', x: -110, dy: 2, facing: 1, s: 0.97 },
          { species: 'gemsbok', pose: 'walk', variant: 'm', x: -45, dy: -3, facing: 1, s: 0.93 },
          { species: 'gemsbok', pose: 'walk', variant: 'm', x: 15, dy: 3, facing: 1, s: 1 },
          { species: 'gemsbok', pose: 'walk', variant: 'm', x: 80, dy: -1, facing: 1, s: 0.95 },
          { species: 'gemsbok', pose: 'walk', variant: 'm', x: 140, dy: 1, facing: 1, s: 0.9 },
        ],
      },
      spanU: [0.3, 0.78],
      pxPerSec: 9,
      walkSeconds: 14,
      pauseSeconds: 6,
      phaseSeconds: 40,
      reflect: { gapPx: 2, squash: 0.45, alpha: 0.32 },
    },
  ],
};

/** The herd's anchor x (layer px) and facing at sim second `t`, on a layer `core` px wide. */
export function roamAt(r: OryxRoam, t: number, core: number): { x: number; facing: 1 | -1 } {
  const x0 = r.spanU[0] * core;
  const span = Math.max(1, (r.spanU[1] - r.spanU[0]) * core);
  const cycle = r.walkSeconds + r.pauseSeconds;
  const s = Math.max(0, t + r.phaseSeconds);
  const walked = Math.floor(s / cycle) * r.walkSeconds + Math.min(s % cycle, r.walkSeconds);
  const d = (walked * r.pxPerSec) % (2 * span);
  return d < span ? { x: x0 + d, facing: 1 } : { x: x0 + 2 * span - d, facing: -1 };
}

/** Light presets with no heat on the pan (cool dawn, dusk, cloud): no shimmer, no reflection. */
const COOL_LIGHTS = ['dawn_mist', 'dusk', 'overcast'];

/** How strongly the pan shimmers (0 … 1): full with the mirage on, half on other hot maps. */
export function heatOf(mirage: boolean, lightIds: readonly string[]): number {
  if (mirage) return 1;
  return lightIds.some((l) => COOL_LIGHTS.includes(l)) ? 0 : 0.5;
}

/**
 * The shimmer at sim second `t` and heat `h`: a sideways waver of the herd and its reflection
 * (px), the reflection's squash wobble and alpha factor. A slow breathe (≥ 3 s, never a flash);
 * still with reduce motion or reduce flashes (the reflection stays, at its mean alpha).
 */
export function shimmerAt(
  t: number,
  h: number,
  still: boolean,
): { herdDx: number; mirrorDx: number; squash: number; alpha: number } {
  if (h <= 0) return { herdDx: 0, mirrorDx: 0, squash: 1, alpha: 0 };
  if (still) return { herdDx: 0, mirrorDx: 0, squash: 1, alpha: h * 0.7 };
  return {
    herdDx: 0.8 * h * Math.sin(t * 2.7),
    mirrorDx: 2.2 * h * Math.sin(t * 1.9 + 1.1),
    squash: 1 + 0.12 * h * Math.sin(t * 2.3),
    alpha: h * (0.55 + 0.45 * Math.sin(t * 2.1)),
  };
}
