import { describe, expect, it } from 'vitest';
import { base } from '../../../tools/simHarness';
import {
  CALM_HEADING,
  secretOwnsRotor,
  stepPump,
  targetHeading,
  vaneScaleX,
  WIND_HEADING,
  wheelSquash,
} from './windpompMotion';

describe('windpomp motion (v1.6, D-042)', () => {
  it('faces into the wind: dir +1 blows left → right, so the wheel faces left, vane right', () => {
    expect(targetHeading({ dir: 1, strength: 0.5 })).toBe(WIND_HEADING);
    expect(vaneScaleX(WIND_HEADING)).toBeLessThan(0);
    expect(targetHeading({ dir: -1, strength: 0.5 })).toBe(-WIND_HEADING);
    expect(vaneScaleX(-WIND_HEADING)).toBeGreaterThan(0);
    expect(targetHeading(null)).toBe(CALM_HEADING);
  });

  it('swings smoothly and holds still on a held frame', () => {
    const m0 = { heading: CALM_HEADING, angle: 1 };
    expect(stepPump(m0, { dir: 1, strength: 1 }, 0)).toBe(m0);
    const m1 = stepPump(m0, { dir: 1, strength: 1 }, 0.5);
    expect(m1.heading).toBeGreaterThan(CALM_HEADING);
    expect(m1.heading).toBeLessThan(WIND_HEADING);
    let m = m0;
    for (let k = 0; k < 600; k++) m = stepPump(m, { dir: 1, strength: 1 }, 1 / 60);
    expect(m.heading).toBeCloseTo(WIND_HEADING, 2);
  });

  it('spins fast in wind, a few degrees a second when calm', () => {
    const calm = stepPump({ heading: 0, angle: 0 }, null, 1);
    expect((calm.angle * 180) / Math.PI).toBeCloseTo(4, 5);
    const windy = stepPump({ heading: 0, angle: 0 }, { dir: 1, strength: 1 }, 0.5);
    expect((windy.angle * 180) / Math.PI).toBeCloseTo(180, 5);
  });

  it('squashes the wheel as it turns away', () => {
    expect(wheelSquash(0)).toBe(1);
    expect(wheelSquash(WIND_HEADING)).toBeGreaterThan(0.4);
    expect(wheelSquash(WIND_HEADING)).toBeLessThan(0.6);
  });
});

describe('secretOwnsRotor', () => {
  it('is true only for a multi-hit secret with a rotor (the Karoo windpomp)', () => {
    const prop = (biome: string, id: string) =>
      base.biomes.find((b) => b.id === biome)?.props.find((p) => p.id === id);
    const karoo = prop('karoo-autumn', 'windpomp');
    const kalahari = prop('kalahari-summer', 'windpomp_sign');
    expect(secretOwnsRotor(karoo?.secret)).toBe(true);
    // The Kalahari sign's single-hit secret must not hide the windpomp's wheel.
    expect(secretOwnsRotor(kalahari?.secret)).toBe(false);
    expect(secretOwnsRotor(undefined)).toBe(false);
  });
});
