// Quality tiers (Tech §5, feel.json quality): Settings → quality picks low/medium/high, or "auto"
// picks from the device. M9: auto uses the title-screen frame benchmark (benchmarkTier) once it
// has run on this device; before that, the device hints. Pure.
import type { Feel } from '../../content/schemas';
import type { Settings } from '../../meta/saveSchema';

export type QualityTier = 'low' | 'medium' | 'high';

export interface DeviceHints {
  readonly coarsePointer: boolean;
  /** navigator.hardwareConcurrency (0 when unknown). */
  readonly cores: number;
  /** navigator.deviceMemory in GB (0 when unknown: Safari and Firefox don't tell). */
  readonly memoryGb: number;
}

/** A coarse-pointer device with few cores is low whatever its benchmark says (thermal limits). */
function weakPhone(feel: Feel, d: DeviceHints): boolean {
  return d.coarsePointer && d.cores > 0 && d.cores <= feel.quality.lowTierMaxCores;
}

export function resolveTier(
  setting: Settings['quality'],
  feel: Feel,
  d: DeviceHints,
  bench: QualityTier | null = null,
): QualityTier {
  if (setting !== 'auto') return setting;
  if (weakPhone(feel, d)) return 'low';
  return bench ?? feel.quality.auto;
}

export interface BenchmarkResult {
  readonly tier: QualityTier;
  /** Average frame time of the measured frames (ms). */
  readonly avgMs: number;
}

/**
 * The tier the title-screen benchmark points to: `frameMs` are rAF-to-rAF times, the first
 * `warmupFrames` are skipped. Slow → low; fast on a fine pointer with enough cores and memory →
 * high; otherwise medium. Null until enough frames were measured.
 */
export function benchmarkTier(
  frameMs: readonly number[],
  feel: Feel,
  d: DeviceHints,
): BenchmarkResult | null {
  const b = feel.quality.benchmark;
  const samples = frameMs.slice(b.warmupFrames, b.warmupFrames + b.frames);
  if (samples.length < b.frames) return null;
  const avgMs = samples.reduce((a, x) => a + x, 0) / samples.length;
  let tier: QualityTier = 'medium';
  if (avgMs > b.lowAboveMs) tier = 'low';
  else if (
    avgMs <= b.highBelowMs &&
    !d.coarsePointer &&
    d.cores >= b.highMinCores &&
    (d.memoryGb === 0 || d.memoryGb >= b.highMinMemoryGb)
  )
    tier = 'high';
  return { tier, avgMs: Math.round(avgMs * 100) / 100 };
}
