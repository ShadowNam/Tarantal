// v1.17b (D-080): the far herds load in a background group of their own per area.
import { describe, expect, it } from 'vitest';
import index from '../../../public/assets/asset-index.json' with { type: 'json' };
import { backgroundGroup, groupForBiome } from './AssetManifest';
import { faunaGroupOf, isFaunaGroup } from './assetIndex';

describe('the far herds’ groups (D-080)', () => {
  it('an area loads its own herds in the background, never another area’s', () => {
    const g = faunaGroupOf('namibie');
    expect(isFaunaGroup(g)).toBe(true);
    expect(groupForBiome(g, 'namibie')).toBe(true);
    expect(groupForBiome(g, 'bushveld-winter')).toBe(false);
    expect(backgroundGroup(g)).toBe(true);
  });

  it('every far-plane herd sheet is in its area’s fauna group (the waterhole with the Ver)', () => {
    const herds = Object.entries(index.images).filter(([k]) => k.startsWith('fauna/'));
    expect(herds.length).toBeGreaterThan(10);
    for (const [k, e] of herds)
      expect(isFaunaGroup(e.group) || (k.endsWith('waterhole') && e.group === 'ver'), k).toBe(true);
  });
});
