// v1.16 (D-078): the troop's calls are rate-limited — a wa-hoo every wahooSeconds while it is on
// the ridge (never more often, however long the hunt), idle calls minGapSeconds apart, the aimed
// bark at most every aimBarkSeconds, nothing while the troop is away.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../../tools/testContent';
import { BaboonCalls } from './baboonCalls';

const T = loadContent().birds.baboons.calls;

/** A fixed pseudo-random source (tests only). */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('baboon calls (D-078)', () => {
  it('a wa-hoo every wahooSeconds while the troop is on its ridge, never more often', () => {
    const c = new BaboonCalls(T, lcg(1));
    const ticks: number[] = [];
    const minutes = 10;
    for (let t = 0; t < minutes * 3600; t++) if (c.wahoo(t, true)) ticks.push(t);
    for (let i = 1; i < ticks.length; i++)
      expect((ticks[i] ?? 0) - (ticks[i - 1] ?? 0)).toBeGreaterThanOrEqual(T.wahooSeconds[0] * 60);
    expect(ticks.length).toBeGreaterThanOrEqual(Math.floor((minutes * 60) / T.wahooSeconds[1]));
    expect(ticks.length).toBeLessThanOrEqual(Math.ceil((minutes * 60) / T.wahooSeconds[0]));
  });

  it('none while the troop is away over the ridge', () => {
    const c = new BaboonCalls(T, lcg(2));
    for (let t = 0; t < 3600 * 5; t++) expect(c.wahoo(t, false)).toBe(false);
  });

  it('the aimed bark at most every aimBarkSeconds, and idle calls keep minGapSeconds apart', () => {
    const c = new BaboonCalls(T, lcg(3));
    const idle: number[] = [];
    for (let t = 0; t < 3600 * 5; t++) {
      // The aim sits on a peeking baboon the whole time, and one comes up every second.
      if (c.aimed(t)) idle.push(t);
      if (t % 60 === 0 && c.cameUp(t, t % 120 === 0) !== null) idle.push(t);
      if (c.wahoo(t, true)) idle.push(t);
    }
    idle.sort((a, b) => a - b);
    for (let i = 1; i < idle.length; i++)
      expect((idle[i] ?? 0) - (idle[i - 1] ?? 0)).toBeGreaterThanOrEqual(T.minGapSeconds * 60);
    expect(c.counts.bark).toBeLessThanOrEqual(Math.ceil((5 * 60) / T.aimBarkSeconds));
    expect(c.counts.bark).toBeGreaterThan(0);
    expect(c.counts.grunt + c.counts.squeal).toBeGreaterThan(0);
  });

  it("a raid's warning always calls and pushes the idle wa-hoo a full gap away", () => {
    const c = new BaboonCalls(T, lcg(4));
    c.wahoo(0, true);
    c.warn(100);
    for (let t = 101; t < 100 + T.wahooSeconds[0] * 60; t++) expect(c.wahoo(t, true)).toBe(false);
    expect(c.counts.wahoo).toBe(1);
  });
});
