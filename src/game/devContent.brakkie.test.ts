// v1.12 (D-069): Brakkie's test flags — the real content (and hash) under plain ?e2e and
// ?brakkie=content, none with ?brakkie=0, the preview with ?brakkie=1 / ?brakkiePreview=.
import { describe, expect, it } from 'vitest';
import { base } from '../../tools/simHarness';
import { loadContentHash } from '../../tools/testContent';
import { contentHash } from '../content/hash';
import { createSim } from '../sim/Sim';
import { withBrakkieParams, withWindParams } from './devContent';

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
    expect(c.brakkie.enterSeconds).toEqual([0.5, 0.5]);
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

  it('?brakkiePreview=bark,fetch combines both (the perf spec): barks every 3–4 s and the demo fetch', () => {
    const c = withBrakkieParams(base, new URLSearchParams('brakkie=1&brakkiePreview=bark,fetch'));
    expect(c.brakkie.bark.everySeconds).toEqual([3, 4]);
    expect(c.brakkie.demoFetchSeconds).toBe(3);
    expect(c.brakkie.flush).toEqual(base.brakkie.flush);
    // An unknown name in the list is ignored.
    expect(
      withBrakkieParams(base, new URLSearchParams('brakkiePreview=nope,fetch')).brakkie
        .demoFetchSeconds,
    ).toBe(3);
  });

  it('?brakkiePreview=fetch fetches a bird placed beside him within seconds (no bag)', () => {
    const c = withBrakkieParams(base, new URLSearchParams('brakkiePreview=fetch'));
    expect(c.brakkie.demoFetchSeconds).toBe(3);
    const s = createSim({ seed: 4, content: c, mode, inputKind: 'pointer' });
    let carrying = -1;
    while (!s.isOver() && s.tick < 60 * 12 && carrying < 0) {
      s.step([]);
      s.drainEvents();
      if (s.snapshot().brakkie?.phase === 'carry') carrying = s.tick;
    }
    expect(carrying).toBeGreaterThan(0);
    expect(carrying).toBeLessThan(60 * 8);
    // Never in shipped content.
    expect(base.brakkie.demoFetchSeconds).toBeUndefined();
  });
});

describe('v1.17 (D-079) test flags', () => {
  const run = (q: string, seconds: number, stop: (s: ReturnType<typeof createSim>) => boolean) => {
    const c = withBrakkieParams(base, new URLSearchParams(q));
    const s = createSim({ seed: 3, content: c, mode, inputKind: 'pointer' });
    while (!s.isOver() && s.tick < 60 * seconds && !stop(s)) s.step([]);
    return s;
  };

  it('?brakkiePreview=point: on point within seconds, held 8 s with the marker', () => {
    const s = run('brakkiePreview=point', 30, (x) => x.snapshot().brakkie?.phase === 'point');
    const d = s.snapshot().brakkie;
    expect(d?.phase).toBe('point');
    expect(d?.point).not.toBeNull();
    expect(d?.dur).toBe(8 * 60);
  });

  it('?brakkiePreview=react: a proud hop a few seconds in that lasts 6 s', () => {
    const s = run('brakkiePreview=react', 30, (x) => x.snapshot().brakkie?.react === 'proud');
    const d = s.snapshot().brakkie;
    expect(d?.react).toBe('proud');
    expect(d?.dur).toBe(6 * 60);
  });

  it('?wind=strong: full wind and a gust up on the wind maps; nothing without the flag', () => {
    expect(withWindParams(base, new URLSearchParams('e2e=1'))).toBe(base);
    const c = withWindParams(base, new URLSearchParams('wind=strong'));
    const s = createSim({
      seed: 3,
      content: c,
      mode: { id: 'classic', biome: 'karoo-autumn', omen: true },
      inputKind: 'pointer',
    });
    for (let i = 0; i < 120; i++) s.step([]);
    const w = s.snapshot().wind;
    expect(w?.strength).toBeGreaterThanOrEqual(0.95);
    expect(w?.gust).toBeGreaterThan(0);
  });
});
