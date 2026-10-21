import { describe, expect, it } from 'vitest';
import feelJson from '../../../content/client/feel.json';
import { parseFeel } from '../../content/feel';
import { benchmarkTier, resolveTier, type DeviceHints } from './QualityManager';

const parsed = parseFeel(feelJson);
if (!parsed.ok) throw new Error('feel.json invalid');
const feel = parsed.feel;
const b = feel.quality.benchmark;
const desktop: DeviceHints = { coarsePointer: false, cores: 12, memoryGb: 16 };
const phone: DeviceHints = { coarsePointer: true, cores: 8, memoryGb: 4 };
const frames = (ms: number): number[] => [
  ...Array<number>(b.warmupFrames).fill(200), // warm-up stalls are ignored
  ...Array<number>(b.frames).fill(ms),
];

describe('benchmarkTier (M9: 90 frames on the title)', () => {
  it('needs warm-up + 90 frames', () => {
    expect(benchmarkTier(frames(16).slice(0, -1), feel, desktop)).toBeNull();
  });

  it('slow → low, smooth on a strong desktop → high, otherwise medium', () => {
    expect(benchmarkTier(frames(30), feel, desktop)?.tier).toBe('low');
    expect(benchmarkTier(frames(16.7), feel, desktop)).toEqual({ tier: 'high', avgMs: 16.7 });
    expect(benchmarkTier(frames(20), feel, desktop)?.tier).toBe('medium');
    // Smooth, but a touch device, few cores or little memory stays medium.
    expect(benchmarkTier(frames(16.7), feel, phone)?.tier).toBe('medium');
    expect(benchmarkTier(frames(16.7), feel, { ...desktop, cores: 4 })?.tier).toBe('medium');
    expect(benchmarkTier(frames(16.7), feel, { ...desktop, memoryGb: 4 })?.tier).toBe('medium');
    // Unknown memory (Safari, Firefox) doesn't block high.
    expect(benchmarkTier(frames(16.7), feel, { ...desktop, memoryGb: 0 })?.tier).toBe('high');
  });
});

describe('resolveTier', () => {
  it('a setting wins; auto follows the benchmark, else the device hints', () => {
    expect(resolveTier('high', feel, phone, 'low')).toBe('high');
    expect(resolveTier('auto', feel, desktop, 'high')).toBe('high');
    expect(resolveTier('auto', feel, desktop, null)).toBe(feel.quality.auto);
    // A weak phone is low even when a short benchmark looked fine.
    expect(resolveTier('auto', feel, { ...phone, cores: 4 }, 'high')).toBe('low');
  });
});
