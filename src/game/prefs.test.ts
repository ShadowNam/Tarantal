import { describe, expect, it } from 'vitest';
import { parseFeel } from '../content/feel';
import { DEFAULT_SETTINGS } from '../meta/saveSchema';
import { applyPrefs, computePrefs } from './prefs';
import feelJson from '../../content/client/feel.json';

const parsed = parseFeel(feelJson);
if (!parsed.ok) throw new Error('feel.json invalid');
const feel = parsed.feel;
const desktop = {
  feel,
  device: { coarsePointer: false, cores: 8, memoryGb: 8 },
  reducedMotion: false,
};

describe('live prefs from Settings', () => {
  it('auto quality: medium on capable devices, low on small touch devices', () => {
    expect(computePrefs(DEFAULT_SETTINGS, desktop).tier).toBe('medium');
    const phone = { ...desktop, device: { coarsePointer: true, cores: 4, memoryGb: 4 } };
    expect(computePrefs(DEFAULT_SETTINGS, phone).tier).toBe('low');
    expect(computePrefs(DEFAULT_SETTINGS, phone).particleScale).toBe(
      feel.quality.tiers.low.particleScale,
    );
  });

  it('M9: auto follows the benchmark; tiers carry their filters and layer merges', () => {
    const benched = computePrefs(DEFAULT_SETTINGS, { ...desktop, bench: 'low' });
    expect(benched).toMatchObject({
      tier: 'low',
      vignette: null,
      bloom: null,
      mergeLayers: feel.quality.tiers.low.mergeLayers,
    });
    expect(computePrefs(DEFAULT_SETTINGS, { ...desktop, bench: 'high' }).bloom).toEqual(
      feel.quality.tiers.high.bloom,
    );
  });

  it('a quality override wins over auto', () => {
    const phone = { ...desktop, device: { coarsePointer: true, cores: 2, memoryGb: 2 } };
    expect(computePrefs({ ...DEFAULT_SETTINGS, quality: 'high' }, phone)).toMatchObject({
      tier: 'high',
      particleScale: feel.quality.tiers.high.particleScale,
    });
  });

  it('shake follows reduced motion until the player sets it', () => {
    expect(computePrefs(DEFAULT_SETTINGS, desktop).shake).toBe(true);
    expect(computePrefs(DEFAULT_SETTINGS, { ...desktop, reducedMotion: true }).shake).toBe(false);
    expect(
      computePrefs({ ...DEFAULT_SETTINGS, screenShake: true }, { ...desktop, reducedMotion: true })
        .shake,
    ).toBe(true);
  });

  it('reduce flashes dims flashes; left-handed passes through; applied in place', () => {
    const p = computePrefs(DEFAULT_SETTINGS, desktop);
    const ref = p;
    applyPrefs(p, { ...DEFAULT_SETTINGS, reduceFlashes: true, leftHanded: true }, desktop);
    expect(ref.flashAlpha).toBe(feel.accessibility.reducedFlashAlpha);
    expect(ref.leftHanded).toBe(true);
  });
});
