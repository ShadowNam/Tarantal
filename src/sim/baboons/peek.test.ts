// v1.16 (D-078): the troop keeps behind its ridge and looks over it a few at a time — the owner's
// "they need to hide better between the mountains and peek out and then hide again". Same seed →
// same peeks; never more than maxVisible over the edge outside a raid; a hidden or half-risen
// member has no hit shapes (it is behind the ridge); peeks and sentinels both happen, staggered,
// at more than one seat.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createRng } from '../rng';
import type { BaboonsView } from '../types';
import { memberVisible, riseOf } from './baboons';
import { createBaboonSystem } from './system';

const content = loadContent();
const T = content.birds.baboons.troop;
const RISE = Math.round(T.riseSeconds * 60);

function setup(biomeId = 'karoo-autumn', seed = 5) {
  const biome = content.biomes.find((b) => b.id === biomeId);
  if (biome === undefined) throw new Error(biomeId);
  const sys = createBaboonSystem(
    biome,
    content,
    { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    createRng(seed).stream('baboons'),
    {
      tick: () => 0,
      emit: () => undefined,
      awardBonus: () => 0,
      basePoints: () => 10,
      penalty: () => undefined,
      threatenNear: () => [],
      ranged: false,
    },
  );
  if (sys === null) throw new Error(`no troop on ${biomeId}`);
  return sys;
}

/** A compact trace of the ridge: who is where, in which pose, each tick. */
function trace(v: BaboonsView): string {
  return v.troops.map((t) => t.members.map((m) => `${m.id}:${m.pose}:${m.x}`).join(',')).join('|');
}

describe('baboons peek over the ridge and hide again (D-078)', () => {
  it('the same seed gives the same peeks', () => {
    const a = setup();
    const b = setup();
    for (let k = 0; k < 60 * 90; k++) {
      a.step();
      b.step();
      if (k % 30 === 0) expect(trace(a.view())).toBe(trace(b.view()));
    }
  });

  for (const id of ['karoo-autumn', 'namibie', 'bushveld-winter', 'oes', 'okavango-spring'])
    it(`${id}: few over the edge at once, hidden ones have no hit shapes, peeks and sentinels at several seats`, () => {
      const sys = setup(id, 9);
      const poses = new Set<string>();
      const seatsUp = new Set<number>();
      let maxUp = 0;
      let sumUp = 0;
      const ticks = 60 * 240;
      for (let k = 0; k < ticks; k++) {
        sys.step();
        const v = sys.view();
        const raid = v.raid !== null;
        const shaped = new Set<number>();
        sys.extras((_l, e) => {
          if (e.kind === 'baboon') shaped.add(e.baboonId);
        });
        const raiding = new Set(v.raiders.map((r) => r.id));
        for (const t of v.troops) {
          let up = 0;
          for (const m of t.members) {
            // A raider's shapes are down at its spot (the ridge self is out).
            if (raiding.has(m.id)) continue;
            if (memberVisible(m)) up++;
            poses.add(m.pose);
            if (m.pose === 'peek' || m.pose === 'sentinel') seatsUp.add(m.x);
            // Behind the ridge, rising or ducking: never hittable.
            if (riseOf(m, RISE) < 1 || m.pose === 'hide' || m.pose === 'out')
              expect(shaped.has(m.id), `${id} ${m.id} ${m.pose}`).toBe(false);
            else if (m.pose === 'peek' || m.pose === 'sentinel')
              expect(shaped.has(m.id)).toBe(true);
          }
          // A raid's lookout and its raiders come up on top of the idle ones.
          if (!raid) expect(up, `${id} tick ${k}`).toBeLessThanOrEqual(T.maxVisible);
          if (!raid) maxUp = Math.max(maxUp, up);
          sumUp += up;
        }
      }
      expect(poses.has('peek')).toBe(true);
      expect(poses.has('sentinel')).toBe(true);
      expect(poses.has('hide')).toBe(true);
      // Mostly hidden: on average well under half of the troop shows.
      expect(sumUp / ticks).toBeLessThan(T.maxVisible);
      expect(maxUp).toBeGreaterThan(0);
      // Spread out: they look over the edge at three or more different seats.
      expect(seatsUp.size).toBeGreaterThanOrEqual(3);
    });

  it('at the start the whole troop is hidden, and they come up one by one (staggered)', () => {
    const sys = setup();
    const v0 = sys.view();
    expect(v0.troops[0]?.members.every((m) => m.pose === 'hide')).toBe(true);
    const firstUp = new Map<number, number>();
    for (let k = 0; k < 60 * 60; k++) {
      sys.step();
      for (const m of sys.view().troops[0]?.members ?? [])
        if (m.pose === 'peek' || m.pose === 'sentinel')
          if (!firstUp.has(m.id)) firstUp.set(m.id, k);
    }
    const times = [...firstUp.values()];
    expect(times.length).toBeGreaterThanOrEqual(3);
    // Not all at once.
    expect(new Set(times).size).toBe(times.length);
  });

  it('riseOf: up over riseTicks, a peek ducks back over its last riseTicks, down goes to 0', () => {
    expect(riseOf({ pose: 'hide', t: 5, dur: 10 }, 10)).toBe(0);
    expect(riseOf({ pose: 'peek', t: 5, dur: 100 }, 10)).toBe(0.5);
    expect(riseOf({ pose: 'peek', t: 50, dur: 100 }, 10)).toBe(1);
    expect(riseOf({ pose: 'peek', t: 95, dur: 100 }, 10)).toBe(0.5);
    expect(riseOf({ pose: 'bark', t: 50, dur: 60 }, 10)).toBe(1);
    expect(riseOf({ pose: 'down', t: 30, dur: 60 }, 10)).toBe(0.5);
  });
});
