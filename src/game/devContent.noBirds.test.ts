// v1.7 (D-044): ?birds=0 for the meerkat previews — no birds or world events, colonies unchanged.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { createSim } from '../sim/Sim';
import { withNoBirds } from './devContent';

describe('?birds=0 (withNoBirds)', () => {
  it('a hunt with no birds, events or crates, whose colonies behave exactly as before', () => {
    const base = loadContent();
    const quiet = withNoBirds(base);
    const mode = {
      id: 'classic' as const,
      biome: 'kalahari-summer',
      layout: 'mon',
      huntSeconds: 20,
    };
    const a = createSim({ seed: 33, content: base, mode, inputKind: 'pointer' });
    const b = createSim({ seed: 33, content: quiet, mode, inputKind: 'pointer' });
    let near = 0;
    let flocks = 0;
    for (let t = 0; t < 600; t++) {
      a.step([]);
      b.step([]);
      // (The director's opening far fly-over still crosses the far sky, behind the colonies.)
      near += b.snapshot().birds.filter((x) => x.plane === 'near' || x.plane === 'mid').length;
      flocks += b.snapshot().flocks.length;
      // Until a fly-over sets off an alarm, the colonies match tick for tick.
      if (t < 300) expect(b.snapshot().meerkats).toEqual(a.snapshot().meerkats);
    }
    expect(near).toBe(0);
    expect(flocks).toBe(0);
    expect(b.snapshot().crates).toEqual([]);
  });
});
