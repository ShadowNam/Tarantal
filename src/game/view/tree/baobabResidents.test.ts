import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../../tools/testContent';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import { HOLLOWS } from './baobabShape';
import {
  RESIDENT_IDS,
  beeSprites,
  residentPose,
  visitAt,
  type ResidentId,
  type Visit,
} from './baobabResidents';
import { RESIDENT_FRAMES } from './residentSheet';

const t = loadFeel().treeLife;
const S = TICKS_PER_SECOND;
const HUNT = 90 * S;

function visits(id: ResidentId, seed: number, dusk = false, forced = false): Visit[] {
  const out: Visit[] = [];
  for (let tick = 0; tick < HUNT; tick++) {
    const v = visitAt(t, id, seed, tick, dusk, forced);
    if (v !== null && out.at(-1)?.start !== v.start) out.push(v);
  }
  return out;
}

describe('baobab residents (D-057)', () => {
  it('are a pure function of the tick and the seed', () => {
    for (const id of RESIDENT_IDS) {
      expect(visits(id, 42)).toEqual(visits(id, 42));
      const v = visits(id, 42)[0];
      if (v === undefined) continue;
      const tick = v.start + 30;
      expect(residentPose(t, v, tick, null)).toEqual(residentPose(t, v, tick, null));
    }
    expect(visits('owl', 1)).not.toEqual(visits('owl', 2));
  });

  it('show themselves a few times per 90 s hunt each, on average', () => {
    for (const id of RESIDENT_IDS) {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) n += visits(id, seed, id === 'galago').length;
      const mean = n / 40;
      expect(mean, id).toBeGreaterThanOrEqual(1.5);
      expect(mean, id).toBeLessThanOrEqual(9);
    }
  });

  it('the bushbaby comes out more at dusk and dawn than by day', () => {
    let day = 0;
    let dusk = 0;
    for (let seed = 1; seed <= 40; seed++) {
      day += visits('galago', seed).length;
      dusk += visits('galago', seed, true).length;
    }
    expect(dusk).toBeGreaterThan(day * 1.5);
  });

  it('some resident shows within the first 30 s for almost every seed', () => {
    let missing = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let seen = false;
      for (let tick = 0; tick < 30 * S && !seen; tick += 6)
        seen = RESIDENT_IDS.some((id) => visitAt(t, id, seed, tick, false) !== null);
      if (!seen) missing++;
    }
    expect(missing).toBeLessThanOrEqual(2);
  });

  it('a forced preview keeps the resident out nearly all the time', () => {
    for (const id of RESIDENT_IDS) {
      let out = 0;
      for (let tick = 0; tick < 30 * S; tick++) if (visitAt(t, id, 7, tick, false, true)) out++;
      expect(out / (30 * S), id).toBeGreaterThan(0.8);
    }
  });

  it('only uses frames from the sheet', () => {
    const names = new Set<string>(RESIDENT_FRAMES.map((f) => f.name));
    for (const id of RESIDENT_IDS)
      for (const v of visits(id, 9, true, true).slice(0, 2))
        for (let tick = v.start; tick < v.end; tick += 3)
          for (const s of residentPose(t, v, tick, null).sprites)
            expect(names.has(s.frame)).toBe(true);
  });

  it('the bushbaby peeks out of its own hole', () => {
    const v = visits('galago', 3, true, true)[0];
    if (v === undefined) throw new Error('no visit');
    const p = residentPose(t, v, v.start + 2 * S, null);
    expect(p.sprites[0]?.frame).toMatch(/^galago_(out|look)$/);
    expect([p.sprites[0]?.x, p.sprites[0]?.y]).toEqual([HOLLOWS.galago.x, HOLLOWS.galago.y]);
  });

  it('a near shot makes a peeking resident duck back, and an owl fly off', () => {
    for (const id of ['galago', 'owl', 'hornbill', 'squirrel', 'buffaloWeaver'] as const) {
      const v = visits(id, 5, true, true)[0];
      if (v === undefined) throw new Error(id);
      const shot = v.start + Math.round(1.8 * S);
      expect(residentPose(t, v, shot, null).at, id).not.toBeNull();
      // Gone (or leaving, never startled twice) soon after, though the visit runs on.
      const later = residentPose(t, v, shot + Math.round(1.6 * S), shot);
      expect(later.sprites, id).toEqual([]);
      expect(residentPose(t, v, shot + 2, shot).at, id).toBeNull();
    }
    const owl = visits('owl', 5, false, true)[0];
    if (owl === undefined) throw new Error('owl');
    const shot = owl.start + 2 * S;
    expect(residentPose(t, owl, shot + 20, shot).sprites[0]?.frame).toMatch(/^owl_fly_/);
  });

  it('the hornbill feeds the female: her beak tip shows in the slit', () => {
    const v = visits('hornbill', 11, false, true)[0];
    if (v === undefined) throw new Error('no visit');
    let tip = false;
    for (let tick = v.start; tick < v.end; tick += 2)
      tip ||= residentPose(t, v, tick, null).sprites.some((s) => s.frame === 'beak_tip');
    expect(tip).toBe(true);
  });

  it('the bees swirl round their crack and open up after a near shot', () => {
    const spread = (ss: ReturnType<typeof beeSprites>): number =>
      Math.max(...ss.map((s) => Math.hypot(s.x - HOLLOWS.bees.x, s.y - HOLLOWS.bees.y)));
    const calm = beeSprites(t, 3, 600, null, false);
    expect(calm).toHaveLength(t.bees.count);
    expect(spread(calm)).toBeLessThanOrEqual(t.bees.radiusPx[1] + 2);
    expect(spread(beeSprites(t, 3, 630, 600, false))).toBeGreaterThan(spread(calm));
    expect(beeSprites(t, 3, 600, null, true).length).toBeLessThan(t.bees.count);
  });
});

describe('lifeHash', () => {
  it('spreads evenly over [0, 1)', async () => {
    const { lifeHash } = await import('./baobabResidents');
    const xs: number[] = [];
    for (let s = 1; s <= 50; s++) for (let k = 0; k < 20; k++) xs.push(lifeHash(s, 2, k, 1));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const below = xs.filter((x) => x < 0.35).length / xs.length;
    expect(below).toBeGreaterThan(0.28);
    expect(below).toBeLessThan(0.42);
  });
});
