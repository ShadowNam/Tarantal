// v1.12 (D-069): Brakkie's test flags — the real content (and hash) under plain ?e2e and
// ?brakkie=content, none with ?brakkie=0, the preview with ?brakkie=1 / ?brakkiePreview=.
import { describe, expect, it } from 'vitest';
import { base } from '../../tools/simHarness';
import { loadContentHash } from '../../tools/testContent';
import { contentHash } from '../content/hash';
import { createSim } from '../sim/Sim';
import { withBrakkieParams } from './devContent';

const mode = { id: 'classic' as const, biome: 'karoo-autumn' };

describe('Brakkie test flags (D-069)', () => {
  it("?e2e alone and ?brakkie=content keep the content and its hash equal to Node's", () => {
    for (const q of ['e2e=1', 'e2e=1&seed=42&layout=none&ftue=0', 'e2e=1&brakkie=content']) {
      const b = withBrakkieParams(base, new URLSearchParams(q));
      expect(b).toBe(base);
      expect(contentHash(b)).toBe(loadContentHash());
    }
  });

  it('?brakkie=0 has no Brakkie on any map', () => {
    const c = withBrakkieParams(base, new URLSearchParams('brakkie=0'));
    expect(c.brakkie.areas).toEqual([]);
    expect(createSim({ seed: 1, content: c, mode, inputKind: 'pointer' }).snapshot().brakkie).toBe(
      null,
    );
  });

  it('?brakkie=1 brings him out half a second in; ?brakkiePreview=bark barks within seconds', () => {
    const c = withBrakkieParams(base, new URLSearchParams('brakkie=1&brakkiePreview=bark'));
    expect(c.brakkie.fetch.chance).toBe(1);
    const s = createSim({ seed: 2, content: c, mode, inputKind: 'pointer' });
    let arrived = -1;
    let barked = -1;
    while (!s.isOver() && s.tick < 60 * 20 && barked < 0) {
      s.step([]);
      for (const e of s.drainEvents()) {
        if (e.type === 'brakkieArrived' && arrived < 0) arrived = e.tick;
        if (e.type === 'brakkieBarked') barked = e.tick;
      }
    }
    expect(arrived).toBeGreaterThan(0);
    expect(arrived).toBeLessThanOrEqual(31);
    expect(barked).toBeGreaterThan(0);
  });

  it('?brakkiePreview=flush digs a flock out within 15 s', () => {
    const c = withBrakkieParams(base, new URLSearchParams('brakkiePreview=flush'));
    const s = createSim({ seed: 3, content: c, mode, inputKind: 'pointer' });
    let flushed = false;
    while (!s.isOver() && s.tick < 60 * 15 && !flushed)
      for (const e of (s.step([]), s.drainEvents()))
        if (e.type === 'brakkieFlushed' && e.flockId !== null) flushed = true;
    expect(flushed).toBe(true);
  });
});
