import { describe, expect, it } from 'vitest';
import { createRng, createStream, fnv1a32 } from './rng';

function take(n: number, f: () => number): number[] {
  return Array.from({ length: n }, f);
}

describe('rng', () => {
  it('fnv1a32 matches published test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('reproduces the same sequence for the same seed', () => {
    const a = createRng(42).stream('spawns');
    const b = createRng(42).stream('spawns');
    expect(take(100, a.u32)).toEqual(take(100, b.u32));
  });

  it('pins the first outputs for seed 42 (catches accidental generator changes)', () => {
    const s = createStream(42);
    expect(take(4, s.u32)).toMatchInlineSnapshot(`
      [
        3825871779,
        1851418855,
        1383259262,
        890322987,
      ]
    `);
  });

  it('gives different sequences for different seeds and different streams', () => {
    const a = take(8, createRng(1).stream('spawns').u32);
    const b = take(8, createRng(2).stream('spawns').u32);
    const c = take(8, createRng(1).stream('pellets').u32);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('keeps streams independent: drawing from one does not shift another', () => {
    const quiet = createRng(7);
    const busy = createRng(7);
    take(1000, busy.stream('spawns').u32);
    expect(take(50, busy.stream('pellets').u32)).toEqual(take(50, quiet.stream('pellets').u32));
  });

  it('returns the same stream object for the same name', () => {
    const rng = createRng(3);
    expect(rng.stream('birds')).toBe(rng.stream('birds'));
  });

  it('next() stays in [0, 1) and int() covers its inclusive range uniformly', () => {
    const s = createStream(99);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) {
      const f = s.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const k = s.int(0, 5);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });

  it('weightedIndex follows the weights and skips zero weights', () => {
    const s = createStream(5);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) {
      const k = s.weightedIndex([1, 0, 2]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(counts[1]).toBe(0);
    expect(Math.abs((counts[2] ?? 0) / (counts[0] ?? 1) - 2)).toBeLessThan(0.15);
    expect(s.weightedIndex([0, 0])).toBe(-1);
  });
});
