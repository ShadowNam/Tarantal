// Quality tiers (Tech §5, feel.json quality): Settings → quality picks low/medium/high, or "auto"
// picks from the device. M9 adds a frame-time benchmark to auto. Pure.
import type { Feel } from '../../content/schemas';
import type { Settings } from '../../meta/saveSchema';

export type QualityTier = 'low' | 'medium' | 'high';

export interface DeviceHints {
  readonly coarsePointer: boolean;
  /** navigator.hardwareConcurrency (0 when unknown). */
  readonly cores: number;
}

export function resolveTier(setting: Settings['quality'], feel: Feel, d: DeviceHints): QualityTier {
  if (setting !== 'auto') return setting;
  if (d.coarsePointer && d.cores > 0 && d.cores <= feel.quality.lowTierMaxCores) return 'low';
  return feel.quality.auto;
}
