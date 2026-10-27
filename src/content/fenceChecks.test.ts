// v1.8 (D-050): the Blikkies fences' content checks on every map a biome can play.
import { describe, expect, it } from 'vitest';
import { resolveMap } from '../sim/maps';
import { loadContent } from '../../tools/testContent';
import { fenceIssues } from './fenceChecks';
import type { Biome, Fence } from './schemas';

const content = loadContent();
const biome = (id: string): Biome => {
  const b = content.biomes.find((x) => x.id === id);
  if (b === undefined) throw new Error(id);
  return b;
};
/** The Karoo with Tuesday's fence changed by `f`. */
function karooWith(f: (fence: Fence) => Fence): Biome {
  const b = structuredClone(biome('karoo-autumn'));
  const layouts = b.layouts.map((l) =>
    l.id === 'tue' && l.fence !== undefined ? { ...l, fence: f(l.fence) } : l,
  );
  return { ...b, layouts };
}
const issues = (b: Biome): string[] => fenceIssues(content, b);

describe('Blikkies fence checks (v1.8, D-050)', () => {
  it('the shipped maps pass; 3–4 layouts of each farm area have a fence, the Okavango none', () => {
    for (const b of content.biomes) expect(issues(b), b.id).toEqual([]);
    for (const id of ['karoo-autumn', 'bushveld-winter', 'kalahari-summer', 'namibie']) {
      const n = biome(id).layouts.filter((l) => l.fence !== undefined).length;
      expect(n, id).toBeGreaterThanOrEqual(3);
      expect(n, id).toBeLessThanOrEqual(4);
      // The distance varies by day.
      const planes = new Set(biome(id).layouts.flatMap((l) => (l.fence ? [l.fence.plane] : [])));
      expect(planes.size, id).toBeGreaterThanOrEqual(2);
    }
    expect(biome('okavango-spring').layouts.some((l) => l.fence !== undefined)).toBe(false);
  });

  it('the bonus maps push the fence back: Verder one plane, Nog Verder far, Die Verste Ver', () => {
    const b = biome('karoo-autumn');
    const day = b.layouts.find((l) => l.fence?.plane === 'mid');
    if (day === undefined) throw new Error('no mid fence');
    expect(resolveMap(b, day.id, undefined).fence?.plane).toBe('mid');
    expect(resolveMap(b, day.id, 'verder').fence?.plane).toBe('far');
    expect(resolveMap(b, day.id, 'nogVerder').fence?.plane).toBe('far');
    expect(resolveMap(b, day.id, 'dieVerste').fence?.plane).toBe('ver');
    expect(resolveMap(b, 'mon', undefined).fence).toBeNull();
  });

  it('a can must stand on a post of its fence, one per post', () => {
    const off = karooWith((f) => ({ ...f, cans: [...f.cans, { post: 9, type: 'food' }] }));
    expect(issues(off).join('\n')).toMatch(/can on post 9, which it doesn't have/);
    const two = karooWith((f) => ({ ...f, cans: [{ post: 0, type: 'food' }, { post: 0, type: 'paint' }] }));
    expect(issues(two).join('\n')).toMatch(/two cans on post 0/);
  });

  it('a resting can never stands in front of the birds of a plane behind', () => {
    // Tall posts on the near plane lift the cans into the mid plane's bird band.
    const tall = karooWith((f) => ({ ...f, plane: 'near', posts: f.posts.map((p) => ({ ...p, h: 120 })) }));
    expect(issues(tall).join('\n')).toMatch(/stands in front of the mid plane's birds/);
  });
});
