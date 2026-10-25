// v1.7 (D-044): the meerkat colonies' content checks on every map a biome can play.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { colonyIssues } from './colonyChecks';
import type { Biome } from './schemas';

const content = loadContent();
const biome = (id: string): Biome => {
  const b = content.biomes.find((x) => x.id === id);
  if (b === undefined) throw new Error(id);
  return b;
};
/** The Kalahari with its Monday layout's colonies changed by `f`. */
function kalahariWith(f: (cols: NonNullable<Biome['colonies']>) => Biome['colonies']): Biome {
  const b = structuredClone(biome('kalahari-summer'));
  const mon = b.layouts[0];
  if (mon?.colonies === undefined) throw new Error('no Monday colonies');
  const layouts = b.layouts.map((l, i) => (i === 0 ? { ...l, colonies: f(mon.colonies ?? []) } : l));
  return { ...b, layouts };
}
const issues = (b: Biome): string[] => colonyIssues(content, b);

describe('meerkat colony checks (v1.7, D-044)', () => {
  it('the shipped desert maps pass; the other biomes have no colonies', () => {
    for (const b of content.biomes) expect(issues(b), b.id).toEqual([]);
    expect(biome('karoo-autumn').colonies).toBeUndefined();
  });

  it('counts the highest mound: a sentinel on it must not stand in front of the mid birds', () => {
    // Monday's near colony sits at 966 so that its tallest mound (28 px) keeps clear; at 950 the
    // sentinel on that mound would reach into the mid birds' band (review of v1.7).
    const lower = kalahariWith((cols) =>
      cols.map((c) => (c.layer === 'near' ? { ...c, y: 950 } : c)),
    );
    expect(issues(lower).join('\n')).toMatch(/stands in front of the mid plane's birds/);
    const flat = kalahariWith((cols) =>
      cols.map((c) =>
        c.layer === 'near'
          ? { ...c, y: 950, burrows: c.burrows.map((b) => ({ ...b, mound: 6 })) }
          : c,
      ),
    );
    expect(issues(flat)).toEqual([]);
  });

  it('rejects a colony on a non-plane layer, one off its layer, one over a prop, and a map without', () => {
    const sky = kalahariWith((cols) => cols.map((c) => ({ ...c, layer: 'sky' })));
    expect(issues(sky).join('\n')).toMatch(/not the near or mid plane/);
    const edge = kalahariWith((cols) => cols.map((c) => ({ ...c, u: 0 })));
    expect(issues(edge).join('\n')).toMatch(/runs off its layer/);
    // Monday's props are the biome's own: the windpomp sign stands at mid u 0.46.
    const sign = kalahariWith((cols) =>
      cols.map((c) => (c.layer === 'mid' ? { ...c, u: 0.46 } : c)),
    );
    expect(issues(sign).join('\n')).toMatch(/overlaps prop "windpomp_sign"/);
    const none = kalahariWith(() => []);
    expect(issues(none).join('\n')).toMatch(/layout "mon" has no meerkat colony/);
  });
});
