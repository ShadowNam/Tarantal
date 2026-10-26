// v1.8 (D-050): the generic juggle body — knocked away from the hit side, higher and faster with
// every air hit up to the cap, one bounce, then lying for good; out of the top it is gone.
import { describe, expect, it } from 'vitest';
import { cos } from '../detmath';
import { createStream } from '../rng';
import { airborne, kick, restingBody, stepBody, type JuggleTuning } from './body';

const T: JuggleTuning = {
  gravityPxPerSec2: 1100,
  kickUpPxPerSec: 555,
  kickSidePxPerSec: 170,
  minSideShare: 0.35,
  spinDegPerSec: 540,
  upGrowth: 0.1,
  spinGrowthDegPerSec: 140,
  jitterPxPerSec: 0,
  jitterGrowthPxPerSec: 0,
  growthCapHits: 4,
  pelletBonus: 0.05,
  pelletCap: 1.2,
  bounce: { restitution: 0.3, keep: 0.5 },
  goneMarginPx: 20,
  wegChain: 99,
};

const body = () => restingBody(500, 600, 700, 20);

describe('juggle body (D-050)', () => {
  it('flies away from the hit side, up, spinning the way it flies', () => {
    const left = body();
    expect(kick(left, T, -0.8, 1, createStream(1))?.kind).toBe('knock');
    expect(left.vx).toBeGreaterThan(0);
    expect(left.vy).toBeLessThan(0);
    expect(left.spin).toBeGreaterThan(0);
    const right = body();
    kick(right, T, 0.8, 1, createStream(1));
    expect(right.vx).toBeLessThan(0);
    expect(right.spin).toBeLessThan(0);
    // A hit on the edge pushes harder sideways than one near the centre line.
    const centre = body();
    kick(centre, T, -0.05, 1, createStream(1));
    expect(Math.abs(centre.vx)).toBeLessThan(Math.abs(left.vx));
    expect(Math.abs(centre.vx)).toBeGreaterThan(0);
  });

  it('every air hit kicks it higher and spins it faster, up to the cap', () => {
    const b = body();
    kick(b, T, 0.5, 1, createStream(2));
    const ups: number[] = [-b.vy];
    const spins: number[] = [Math.abs(b.spin)];
    for (let n = 1; n <= 7; n++) {
      expect(kick(b, T, 0.5, 1, createStream(2))).toEqual({ kind: 'juggle', chain: n });
      ups.push(-b.vy);
      spins.push(Math.abs(b.spin));
    }
    for (let n = 1; n <= T.growthCapHits; n++) {
      expect(ups[n]).toBeGreaterThan(ups[n - 1] ?? Infinity);
      expect(spins[n]).toBeGreaterThan(spins[n - 1] ?? Infinity);
    }
    // Past the cap the kick stops growing (the height doesn't: it keeps climbing).
    expect(ups[7]).toBeCloseTo(ups[T.growthCapHits] ?? 0, 9);
  });

  it('more pellets kick harder, capped', () => {
    const one = body();
    kick(one, T, 0.5, 1, createStream(3));
    const five = body();
    kick(five, T, 0.5, 5, createStream(3));
    const many = body();
    kick(many, T, 0.5, 40, createStream(3));
    expect(-five.vy).toBeGreaterThan(-one.vy);
    expect(-many.vy).toBeCloseTo(-one.vy * T.pelletCap, 9);
  });

  it('bounces once on the ground, then lies on its side and cannot be kicked', () => {
    const b = body();
    kick(b, T, 0.5, 1, createStream(4));
    const seen: string[] = [];
    for (let i = 0; i < 600 && airborne(b); i++) {
      const r = stepBody(b, T, 0);
      if (r !== null) seen.push(r);
    }
    expect(seen).toEqual(['bounced', 'landed']);
    expect(b.y).toBe(700);
    expect(Math.abs(cos(b.angle))).toBeLessThan(1e-9);
    expect(kick(b, T, 0.5, 1, createStream(4))).toBeNull();
  });

  it('a long chain always ends out of the top of the view', () => {
    const b = body();
    const rng = createStream(5);
    kick(b, T, 0.3, 1, rng);
    let gone = false;
    for (let i = 0; i < 60 * 60 && !gone; i++) {
      // Hit it again each time it starts to fall.
      if (b.vy > 0 && airborne(b)) kick(b, T, 0.3, 1, rng);
      gone = stepBody(b, T, 0) === 'gone';
    }
    expect(gone).toBe(true);
    expect(b.state).toBe('gone');
  });

  it('the wegChain-th air hit always sends it out of the top of the view (Weg!)', () => {
    const t = { ...T, wegChain: 3, kickUpPxPerSec: 120 };
    const b = restingBody(500, 900, 950, 20);
    const rng = createStream(6);
    kick(b, t, 0.2, 1, rng);
    let out: string | null = null;
    for (let i = 0; i < 60 * 30 && out === null; i++) {
      // Hit it at the top of every arc: small kicks would keep it in view for ever.
      if (b.vy > 0 && b.state === 'air') expect(kick(b, t, 0.2, 1, rng)).not.toBeNull();
      const r = stepBody(b, t, 0);
      if (r === 'gone' || r === 'landed') out = r;
    }
    expect(out).toBe('gone');
    expect(b.chain).toBe(3);
  });
});
