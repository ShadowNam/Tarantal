// Pacing curves (Tech §3.6): biome keyframes are fractions of hunt length, so one biome works
// for 90 s Classic and 60 s Season Run hunts. The Stampede swaps in the surge profile.
import type { Biome } from '../../content/schemas';

export interface Rates {
  readonly flyoversPerMin: number;
  readonly popupsPerMin: number;
}

/** Linear interpolation of the pacing keyframes at t ∈ [0, 1]. */
export function pacingAt(pacing: Biome['pacing'], t: number, stampede: boolean): Rates {
  if (stampede) return pacing.stampede;
  const keys = pacing.keyframes;
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (a === undefined || b === undefined) continue;
    if (clamped <= b.t) {
      const k = b.t === a.t ? 1 : (clamped - a.t) / (b.t - a.t);
      return {
        flyoversPerMin: a.flyoversPerMin + (b.flyoversPerMin - a.flyoversPerMin) * k,
        popupsPerMin: a.popupsPerMin + (b.popupsPerMin - a.popupsPerMin) * k,
      };
    }
  }
  const last = keys[keys.length - 1];
  return { flyoversPerMin: last?.flyoversPerMin ?? 0, popupsPerMin: last?.popupsPerMin ?? 0 };
}
