import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../../tools/testContent';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import { falconAt, lovebirdsAt, weaverAt, type ColonyNest } from './colonyFlight';
import { COLONY_FRAMES } from './colonySheet';

const t = loadFeel().treeLife.colony;
const S = TICKS_PER_SECOND;
// The Kalahari colony (mid plane): nest 150 × 46 at (0, −78), the foot at y 260.
const nest: ColonyNest = {
  ox: 0,
  oy: -78,
  rx: 150,
  ry: 46,
  foot: 260,
  scale: 0.42,
  birds: t.birds.mid,
  lovebirds: false,
  salt: 1,
};

const visible = (tick: number, n = nest, reduced = false, seed = 42): number => {
  let c = 0;
  for (let i = 0; i < n.birds; i++) if (weaverAt(t, n, seed, i, tick, null, reduced)) c++;
  return c;
};

describe('weaver colony life (D-057)', () => {
  it('is a pure function of the tick and the seed', () => {
    for (let tick = 0; tick < 600; tick += 37)
      for (let i = 0; i < nest.birds; i++)
        expect(weaverAt(t, nest, 7, i, tick, null, false)).toEqual(
          weaverAt(t, nest, 7, i, tick, null, false),
        );
  });

  it('keeps 6–12 weavers in sight most of the time', () => {
    const counts: number[] = [];
    for (let tick = 0; tick < 90 * S; tick += 15) counts.push(visible(tick));
    const inRange = counts.filter((c) => c >= 6 && c <= 12).length / counts.length;
    expect(inRange).toBeGreaterThan(0.75);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
  });

  it('reduce motion: fewer birds', () => {
    const r = { ...nest, birds: Math.round(nest.birds * t.reducedCountMul) };
    let a = 0;
    let b = 0;
    for (let tick = 0; tick < 60 * S; tick += 20) {
      a += visible(tick);
      b += visible(tick, r, true);
    }
    expect(b).toBeLessThan(a * 0.7);
  });

  it('flies short darts and loops near the tree', () => {
    for (let tick = 0; tick < 60 * S; tick += 7)
      for (let i = 0; i < nest.birds; i++) {
        const p = weaverAt(t, nest, 3, i, tick, null, false);
        if (p === null) continue;
        expect(Math.abs(p.x)).toBeLessThan(nest.rx * 1.6 + 120);
        expect(p.y).toBeGreaterThan(nest.oy - nest.ry * 2 - 80);
        expect(p.y).toBeLessThanOrEqual(nest.foot + 1);
      }
  });

  it('perches and hops on the ground as well as flying', () => {
    const frames = new Set<string>();
    for (let tick = 0; tick < 90 * S; tick += 5)
      for (let i = 0; i < nest.birds; i++) {
        const p = weaverAt(t, nest, 5, i, tick, null, false);
        if (p !== null) frames.add(p.frame);
      }
    for (const f of ['weaver_perch', 'weaver_hop', 'weaver_peck', 'weaver_fly_a', 'weaver_glide'])
      expect(frames.has(f), f).toBe(true);
    const names = new Set<string>(COLONY_FRAMES.map((f) => f.name));
    for (const f of frames) expect(names.has(f)).toBe(true);
  });

  it('a near shot scatters them; they trickle back after a few seconds', () => {
    const at = 30 * S;
    const sc = { start: at, end: at + Math.round(t.scatterSeconds * S) };
    const count = (tick: number): number => {
      let c = 0;
      for (let i = 0; i < nest.birds; i++) if (weaverAt(t, nest, 42, i, tick, sc, false)) c++;
      return c;
    };
    expect(count(at)).toBeGreaterThan(0);
    // Flying off right after the shot, away from the nest.
    const before = weaverAt(t, nest, 42, 0, at, null, false);
    const after = weaverAt(t, nest, 42, 0, at + 20, sc, false);
    // Out sideways, away from the nest (a bird on the ground climbs as it goes).
    if (before !== null && after !== null) {
      expect(Math.abs(after.x - nest.ox)).toBeGreaterThan(Math.abs(before.x - nest.ox));
      expect(after.y).toBeLessThan(before.y);
    }
    // All gone a moment later; the first back once the scatter ends; most back later.
    expect(count(at + 2 * S)).toBe(0);
    let firstBack = -1;
    for (let tick = sc.end; tick < sc.end + (t.trickleSeconds + 2) * S; tick++)
      if (count(tick) > 0) {
        firstBack = tick;
        break;
      }
    expect(firstBack).toBeGreaterThanOrEqual(sc.end);
    expect(visible(sc.end + (t.trickleSeconds + 4) * S)).toBeGreaterThan(0);
  });

  it('the pygmy falcon visits now and then; a forced preview keeps it there', () => {
    let seeds = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let seen = false;
      for (let tick = 0; tick < 90 * S && !seen; tick += 10)
        seen = falconAt(t, nest, seed, tick, null) !== null;
      if (seen) seeds++;
    }
    expect(seeds).toBeGreaterThan(20);
    let out = 0;
    for (let tick = 0; tick < 30 * S; tick += 10) if (falconAt(t, nest, 1, tick, null, true)) out++;
    expect(out / (30 * 6)).toBeGreaterThan(0.8);
  });

  it('lovebirds only in Namibië, a pair', () => {
    expect(lovebirdsAt(t, nest, 1, 100, null)).toEqual([]);
    const nam = { ...nest, lovebirds: true, scale: 1 };
    for (let tick = 0; tick < 30 * S; tick += 30)
      expect(lovebirdsAt(t, nam, 1, tick, null)).toHaveLength(2);
  });
});

describe('review R4–R5: alive against the sky', () => {
  it('several weavers are in flight in the open sky under the nest at any moment', () => {
    let total = 0;
    let samples = 0;
    for (let tick = 0; tick < 90 * S; tick += 30) {
      let sky = 0;
      for (let i = 0; i < nest.birds; i++) {
        const p = weaverAt(t, nest, 42, i, tick, null, false);
        if (p !== null && p.frame !== 'weaver_perch' && p.y > nest.oy + nest.ry) sky++;
      }
      total += sky;
      samples++;
    }
    expect(total / samples).toBeGreaterThanOrEqual(3);
  });

  it('the previewed falcon sits on its perch the whole visit, at every held tick', async () => {
    const { COLONY_FALCON_PERCH } = await import('./colonyFlight');
    const perch = COLONY_FALCON_PERCH['kalahari/weaver_camelthorn'];
    if (perch === undefined) throw new Error('perch');
    const n = { ...nest, falcon: perch };
    for (let tick = 0; tick < 60 * S; tick += 300) {
      const f = falconAt(t, n, 42, tick, null, true);
      expect(f, `tick ${tick}`).not.toBeNull();
      expect(f?.frame).toMatch(/^falcon_(perch|look)$/);
      expect([f?.x, f?.y]).toEqual(perch);
    }
  });
});
