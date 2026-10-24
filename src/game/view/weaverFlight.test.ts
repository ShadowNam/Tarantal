import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeel } from '../../content/feel';
import { burstBirds, burstCount, burstSeed, weaverPose, type WeaverTuning } from './weaverFlight';

const feel = parseFeel(
  JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'content/client/feel.json'), 'utf8'),
  ),
);
if (!feel.ok) throw new Error('feel.json invalid');
const t: WeaverTuning = feel.feel.juice.weavers;
const nest = { ox: 0, oy: -78, rx: 150, ry: 46 };

describe('angry weavers (v1.4 B, D-039)', () => {
  it('a burst is fixed by the nest and the event tick', () => {
    const a = burstBirds(t, 'near', burstSeed('weaver_camelthorn', 600), nest, 44);
    const b = burstBirds(t, 'near', burstSeed('weaver_camelthorn', 600), nest, 44);
    const c = burstBirds(t, 'near', burstSeed('weaver_camelthorn', 601), nest, 44);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('8–15 birds on a near nest, fewer on mid and far', () => {
    for (let tick = 0; tick < 200; tick++) {
      const seed = burstSeed('nest', tick);
      const near = burstCount(t, 'near', seed);
      expect(near).toBeGreaterThanOrEqual(8);
      expect(near).toBeLessThanOrEqual(15);
      expect(burstCount(t, 'mid', seed)).toBeLessThan(near + 1);
      expect(burstCount(t, 'far', seed)).toBeLessThanOrEqual(t.count.far[1]);
      expect(t.count.far[1]).toBeLessThan(t.count.near[0]);
    }
  });

  it('they come out, and settle back into the holes after about 3–4 s', () => {
    const birds = burstBirds(t, 'near', burstSeed('nest', 90), nest, 44);
    const swirlEnd = (t.outMs + t.swirlMs) / 1000;
    const out = (s: number): number =>
      birds.filter((b) => weaverPose(t, b, s, swirlEnd, Math.round(s * 60)).visible).length;
    expect(out(0)).toBeLessThan(birds.length);
    expect(out(1.5)).toBe(birds.length);
    const settled = swirlEnd + t.settleMs / 1000 + 0.5;
    expect(settled).toBeGreaterThanOrEqual(3);
    expect(settled).toBeLessThanOrEqual(4.5);
    expect(out(settled)).toBe(0);
  });

  it('a hit while they are out keeps them out', () => {
    const birds = burstBirds(t, 'near', burstSeed('nest', 90), nest, 44);
    const swirlEnd = (t.outMs + t.swirlMs) / 1000;
    const late = swirlEnd + t.settleMs / 1000 + 0.5;
    // A second hit 2 s in pushes the swirl's end 2 s later: still out at the first burst's end.
    const pushed = 2 + swirlEnd;
    const outLate = birds.filter((b) => weaverPose(t, b, late, pushed, 0).visible).length;
    expect(outLate).toBe(birds.length);
  });

  it('a few near birds dart toward the camera (they grow)', () => {
    let darts = 0;
    for (let tick = 0; tick < 40; tick++)
      darts += burstBirds(t, 'near', burstSeed('nest', tick), nest, 44).filter(
        (b) => b.dart !== null,
      ).length;
    expect(darts).toBeGreaterThan(0);
    const far = burstBirds(t, 'far', burstSeed('nest', 3), nest, 10);
    expect(far.every((b) => b.dart === null)).toBe(true);
  });
});
