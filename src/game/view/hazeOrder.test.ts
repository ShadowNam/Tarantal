import { describe, expect, it } from 'vitest';
import feel from '../../../content/client/feel.json' with { type: 'json' };
import { hazeBelowProps } from './hazeOrder';

describe('hazeBelowProps (D-057)', () => {
  it('puts mist bands with an edge under the props and whole-layer haze over them', () => {
    expect(hazeBelowProps({ top: 520 })).toBe(true);
    expect(hazeBelowProps({ bottom: 400 })).toBe(true);
    expect(hazeBelowProps({})).toBe(false);
  });

  it('keeps the dawn mist on the mid plane (the band across the baobab) under the props', () => {
    const mist = feel.lights.dawn_mist.haze.find((h) => h.layer === 'mid');
    expect(mist).toBeDefined();
    expect(hazeBelowProps(mist ?? {})).toBe(true);
  });
});
