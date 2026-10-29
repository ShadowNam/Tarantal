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
  /** A small step-bob while walking (px), each walker on its own beat. */
  readonly bobPx: number;
  /** The mirror image on the shimmer band: its gap below the feet, squash and alpha at full heat. */
  readonly reflect: { readonly gapPx: number; readonly squash: number; readonly alpha: number };
}

const walker = (
  key: string,
  x: number,
  dy: number,
  s: number,
  pace: { px: number; walk: number; pause: number; phase: number; bob: number },
): OryxRoam => ({
  herd: {
    key,
    sheet: 'fauna/namibie_gemsbok',
    layer: 'far_veld',
    u: 0,
    y: 596 + dy,
    animals: [{ species: 'gemsbok', pose: 'walk', variant: 'm', x, dy: 0, facing: 1, s }],
  },
  spanU: [0.3, 0.78],
  pxPerSec: pace.px,
  walkSeconds: pace.walk,
  pauseSeconds: pace.pause,
  phaseSeconds: pace.phase,
  bobPx: pace.bob,
  reflect: { gapPx: 2, squash: 0.45, alpha: 0.32 },
});

/**
 * The oryx per biome (the Namibië far pan), from the far gemsbok sheet: three walkers, each on
 * its own pace, pauses and phase (so they string out and close up, never in step, a few px apart
 * in depth), and a pair lingering in the mirage band, one grazing and one standing head-up. They
 * replace the old far gemsbok herd while this view runs (`replaces`).
 */
export const ORYX_ROAMS: Readonly<Record<string, readonly OryxRoam[]>> = {
  namibie: [
    walker('fauna/namibie_oryx_a', -115, -3, 0.97, {
      px: 9.2,
      walk: 14,
      pause: 6,
      phase: 41,
      bob: 0.7,
    }),
    walker('fauna/namibie_oryx_b', 0, 2, 1, { px: 8.4, walk: 11, pause: 8, phase: 50.5, bob: 0.6 }),
    walker('fauna/namibie_oryx_c', 92, 5, 0.92, {
      px: 10.1,
      walk: 16,
      pause: 4.5,
      phase: 33,
      bob: 0.8,
    }),
    {
      herd: {
        key: 'fauna/namibie_oryx_pair',
        sheet: 'fauna/namibie_gemsbok',
        layer: 'far_veld',
        u: 0,
        y: 600,
        animals: [
          { species: 'gemsbok', pose: 'graze', variant: 'm', x: -38, dy: 1, facing: 1, s: 0.98 },
          { species: 'gemsbok', pose: 'alert', variant: 'm', x: 27, dy: -4, facing: -1, s: 0.94 },
        ],
      },
      spanU: [0.6, 0.6],
      pxPerSec: 0,
      walkSeconds: 1,
      pauseSeconds: 1,
      phaseSeconds: 0,
      bobPx: 0,
      reflect: { gapPx: 2, squash: 0.45, alpha: 0.32 },
    },
  ],
};

/** The far herd the oryx replace while their view runs (per biome). */
export const ORYX_REPLACE: Readonly<Record<string, string>> = {
  namibie: 'fauna/namibie_gemsbok',
};

export interface RoamPos {
  x: number;
  facing: 1 | -1;
  walking: boolean;
}

/** roamAt into `out` (the view's per-frame call: no allocation). */
export function roamInto(out: RoamPos, r: OryxRoam, t: number, core: number): RoamPos {
  const x0 = r.spanU[0] * core;
  const span = (r.spanU[1] - r.spanU[0]) * core;
  if (span <= 0 || r.pxPerSec <= 0) {
    out.x = x0;
    out.facing = 1;
    out.walking = false;
    return out;
  }
  const cycle = r.walkSeconds + r.pauseSeconds;
  const s = Math.max(0, t + r.phaseSeconds);
  const inCycle = s % cycle;
  const walked = Math.floor(s / cycle) * r.walkSeconds + Math.min(inCycle, r.walkSeconds);
  const d = (walked * r.pxPerSec) % (2 * span);
  out.walking = inCycle < r.walkSeconds;
  out.x = d < span ? x0 + d : x0 + 2 * span - d;
  out.facing = d < span ? 1 : -1;
  return out;
}

/** The herd's anchor x (layer px) and facing at sim second `t`, on a layer `core` px wide. */
export function roamAt(r: OryxRoam, t: number, core: number): RoamPos {
  return roamInto({ x: 0, facing: 1, walking: false }, r, t, core);
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
export interface Shimmer {
  herdDx: number;
  mirrorDx: number;
  squash: number;
  alpha: number;
}

/** shimmerAt into `out` (no allocation). */
export function shimmerInto(out: Shimmer, t: number, h: number, still: boolean): Shimmer {
  if (h <= 0 || still) {
    out.herdDx = 0;
    out.mirrorDx = 0;
    out.squash = 1;
    out.alpha = h <= 0 ? 0 : h * 0.7;
    return out;
  }
  out.herdDx = 0.8 * h * Math.sin(t * 2.7);
  out.mirrorDx = 2.2 * h * Math.sin(t * 1.9 + 1.1);
  out.squash = 1 + 0.12 * h * Math.sin(t * 2.3);
  out.alpha = h * (0.55 + 0.45 * Math.sin(t * 2.1));
  return out;
}

export function shimmerAt(t: number, h: number, still: boolean): Shimmer {
  return shimmerInto({ herdDx: 0, mirrorDx: 0, squash: 1, alpha: 0 }, t, h, still);
}
