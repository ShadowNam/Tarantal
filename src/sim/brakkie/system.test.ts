// v1.12 (D-069): Brakkie's sim system against a stub hunt — his day (arrive, roam, rest), the fetch
// path after a bag on the near and the mid plane, the bark's one threat, the flush's one flock,
// the aimed-at hit rule with the nest's cooldown, and that he is never hurt or removed.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import { createRng } from '../rng';
import type { BrakkieView } from '../types';
import { createBrakkieSystem, type BrakkieHost } from './system';

const content = loadContent();
const B = content.brakkie;
const NEAR = 'near';
const MID = 'mid';

interface Rig {
  readonly sys: ReturnType<typeof createBrakkieSystem>;
  readonly events: SimEvent[];
  readonly threats: { flockId: number; fromX: number; tick: number }[];
  readonly flushes: { x: number; size: number; tick: number }[];
  /** Advance n ticks. */
  run(n: number): void;
  /** Advance until `pred` holds (at most `max` ticks); the tick it took. */
  until(pred: (v: BrakkieView) => boolean, max?: number): number;
  readonly state: {
    tick: number;
    cameraX: number;
    gunUp: boolean;
    busy: (plane: 'near' | 'mid', x: number, px: number) => boolean;
    barkFlock: { flockId: number; x: number } | null;
    penalty: number;
    canFlush: boolean;
    /** v1.20 (D-085): guineafowl on the ground for the Jag card (layer x; walking: foraging). */
    prey: { birdId: number; plane: 'near' | 'mid'; x: number; walking: boolean }[];
    caught: number[];
    jagEnded: number;
    /** Wide gun out. */
    wide: boolean;
  };
  bonuses: { id: string; base: number; tick: number }[];
}

function rig(seed = 3, homeSide: 1 | -1 = -1): Rig {
  const events: SimEvent[] = [];
  const threats: Rig['threats'] = [];
  const flushes: Rig['flushes'] = [];
  const bonuses: Rig['bonuses'] = [];
  const state: Rig['state'] = {
    tick: 0,
    cameraX: 2560,
    gunUp: false,
    busy: () => false,
    barkFlock: null,
    penalty: 0,
    canFlush: true,
    prey: [],
    caught: [],
    jagEnded: 0,
    wide: false,
  };
  const host: BrakkieHost = {
    tick: () => state.tick,
    emit: (e) => {
      events.push(e);
    },
    penalty: (p) => {
      state.penalty += p;
    },
    cameraX: () => state.cameraX,
    gunUp: () => state.gunUp,
    wideGun: () => state.wide,
    busyNear: (plane, x, px) => state.busy(plane, x, px),
    midBirdNear: (x, px) => state.busy('mid', x, px),
    busyAt: (plane, x, px) => (state.busy(plane, x, px) ? x + 1 : null),
    barkTarget: () => state.barkFlock,
    threaten: (flockId, fromX) => {
      threats.push({ flockId, fromX, tick: state.tick });
    },
    flush: (x, size) => {
      flushes.push({ x, size, tick: state.tick });
      return 99;
    },
    canFlush: () => state.canFlush,
    bonus: (id, base) => {
      bonuses.push({ id, base, tick: state.tick });
      return base;
    },
    jagTarget: () => {
      const p = state.prey.find((b) => b.walking);
      return p === undefined ? null : { birdId: p.birdId, plane: p.plane, x: p.x };
    },
    jagBird: (birdId) => {
      const p = state.prey.find((b) => b.birdId === birdId);
      return p === undefined ? null : { plane: p.plane, x: p.x };
    },
    jagCatch: (birdId) => {
      const i = state.prey.findIndex((b) => b.birdId === birdId);
      if (i < 0) return null;
      state.prey.splice(i, 1);
      state.caught.push(birdId);
      return { creature: 'tarentaal', y: 900, points: 10, flockId: 7 };
    },
    jagEnded: () => {
      state.jagEnded++;
    },
  };
  const sys = createBrakkieSystem(
    content,
    {
      layers: { near: { id: NEAR, scrollFactor: 1 }, mid: { id: MID, scrollFactor: 0.6 } },
      planeScale: { near: 1, mid: 0.42 },
      groundY: { near: B.groundY, mid: 760 },
      homeSide,
      durationTicks: secondsToTicks(180),
    },
    createRng(seed).stream('dog'),
    host,
  );
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) {
      state.tick++;
      sys.step();
    }
  };
  const until = (pred: (v: BrakkieView) => boolean, max = 60 * 60): number => {
    for (let i = 0; i < max; i++) {
      if (pred(sys.view())) return state.tick;
      run(1);
    }
    throw new Error(`not reached in ${max} ticks: ${JSON.stringify(sys.view())}`);
  };
  return { sys, events, threats, flushes, bonuses, run, until, state };
}

/** A shot aimed at his body centre (layer coords → the aim point on every layer). */
function aimAtHim(v: BrakkieView): (layerId: string) => { x: number; y: number } {
  const box =
    v.pose === 'point'
      ? B.hitboxes.point
      : v.pose === 'lie' || v.pose === 'dig'
        ? B.hitboxes.low
        : B.hitboxes.stand;
  return () => ({
    x: v.x + box.body.ox * v.scale * v.facing,
    y: v.y + box.body.oy * v.scale,
  });
}

describe('Brakkie (D-069)', () => {
  it('starts away at the bakkie and trots in within enterSeconds, onto the near plane in view', () => {
    const r = rig();
    expect(r.sys.view().present).toBe(false);
    const t = r.until((v) => v.present);
    expect(t).toBeLessThanOrEqual(secondsToTicks(B.enterSeconds[1]) + 1);
    const v = r.sys.view();
    expect(v.plane).toBe('near');
    expect(v.y).toBe(B.groundY);
    expect(v.x).toBeLessThan(0); // from the bakkie side (left), off the panorama
    expect(r.events.some((e) => e.type === 'brakkieArrived')).toBe(true);
    r.until((v2) => v2.phase === 'rest');
    // His spot is in view (within roam.viewHalfPx of the camera's centre on the near layer).
    expect(Math.abs(r.sys.view().x - r.state.cameraX)).toBeLessThanOrEqual(B.roam.viewHalfPx);
  });

  it('comes from the right on a map whose bakkie stands on the right', () => {
    const r = rig(3, 1);
    r.until((v) => v.present);
    expect(r.sys.view().x).toBeGreaterThan(5120);
  });

  it('is deterministic: the same seed gives the same day', () => {
    const a = rig(11);
    const b = rig(11);
    a.run(60 * 60);
    b.run(60 * 60);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.sys.view()).toEqual(b.sys.view());
  });

  it('never picks a spot where something a player aims at is near (lesson 21)', () => {
    const r = rig(4);
    // Everything right of the camera's centre is busy.
    r.state.busy = (_p, x) => x > r.state.cameraX;
    for (let i = 0; i < 40; i++) {
      r.until((v) => v.phase === 'trot' || v.phase === 'away', 60 * 30);
      const v = r.sys.view();
      if (v.phase === 'trot' && v.t === 0) continue;
      r.run(1);
      const goalView = r.sys.view();
      if (goalView.phase === 'rest') expect(goalView.x).toBeLessThanOrEqual(r.state.cameraX);
      r.run(30);
    }
    r.until((v) => v.phase === 'rest');
    expect(r.sys.view().x).toBeLessThanOrEqual(r.state.cameraX);
  });

  it('holds still while the gun is up', () => {
    const r = rig(5);
    r.until((v) => v.phase === 'rest');
    r.state.gunUp = true;
    const x = r.sys.view().x;
    r.run(60 * 12);
    const v = r.sys.view();
    // No new trot (a bark or a dig happens where he stands).
    expect(['rest', 'bark', 'dig']).toContain(v.phase);
    expect(v.x).toBe(x);
  });

  it('fetches a near-plane bag: run to the bird, pick it up, carry it home, back later', () => {
    const r = rig(6);
    r.until((v) => v.phase === 'rest');
    const birdX = r.sys.view().x + 300;
    // fetch.chance < 1: keep bagging until he takes one.
    let took = false;
    for (let i = 0; i < 40 && !took; i++) {
      r.sys.bagged('near', birdX);
      r.run(secondsToTicks(B.fetch.delaySeconds) + 20);
      took = r.events.some((e) => e.type === 'brakkieFetchStarted');
      if (!took) r.until((v) => v.phase === 'rest' || v.phase === 'trot');
    }
    expect(took).toBe(true);
    r.until((v) => v.phase === 'pickup');
    expect(r.sys.view().x).toBeCloseTo(birdX, 5);
    r.until((v) => v.phase === 'carry');
    expect(r.sys.view().carrying).toBe(true);
    r.until((v) => v.phase === 'away');
    expect(r.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['brakkieFetchStarted', 'brakkiePickedUp', 'brakkieFetched']),
    );
    expect(r.sys.view().fetches).toBe(1);
    r.until((v) => v.present);
  });

  it('a mid-plane fetch crosses there, picks it up, and crosses back before carrying it home', () => {
    const r = rig(7);
    r.until((v) => v.phase === 'rest');
    const phases: string[] = [];
    let took = false;
    for (let i = 0; i < 40 && !took; i++) {
      r.sys.bagged('mid', 0.6 * (r.state.cameraX - 960) + 960 + 100);
      r.run(secondsToTicks(B.fetch.delaySeconds) + 20);
      took = r.events.some((e) => e.type === 'brakkieFetchStarted');
      if (!took) r.until((v) => v.phase === 'rest' || v.phase === 'trot');
    }
    expect(took).toBe(true);
    for (let i = 0; i < 60 * 30; i++) {
      const v = r.sys.view();
      if (phases.at(-1) !== `${v.phase}:${v.plane}`) phases.push(`${v.phase}:${v.plane}`);
      if (v.phase === 'away') break;
      // Never hittable while crossing; on the mid plane only while picking up (lesson 21).
      if (v.phase === 'cross') expect(v.hittable).toBe(false);
      if (v.plane === 'mid') expect(['cross', 'pickup']).toContain(v.phase);
      r.run(1);
    }
    expect(phases).toEqual(
      expect.arrayContaining(['cross:near', 'pickup:mid', 'cross:mid', 'carry:near', 'away:near']),
    );
  });

  it("doesn't fetch while the spot is busy, and gives up after waitSeconds", () => {
    const r = rig(8);
    r.until((v) => v.phase === 'rest');
    r.state.busy = (_p, x) => x > r.sys.view().x + 200;
    for (let i = 0; i < 30; i++) {
      r.sys.bagged('near', r.sys.view().x + 400);
      r.run(secondsToTicks(B.fetch.delaySeconds + B.fetch.waitSeconds) + 10);
    }
    expect(r.events.some((e) => e.type === 'brakkieFetchStarted')).toBe(false);
  });

  it('v1.16 (D-078): birds that fall while he is busy queue up; he fetches them one at a time, in order', () => {
    const r = rig(6);
    r.until((v) => v.phase === 'rest');
    const x0 = r.sys.view().x;
    const n = B.fetch.queueMax;
    // queueMax birds down in a row (v1.17: every one joins: the ready rule, no chance roll).
    for (let i = 0; i < n; i++) r.sys.bagged('near', x0 + 250 + i * 10);
    expect(r.sys.view().queued).toBe(n);
    // The queue is capped at queueMax.
    for (let i = 0; i < 10; i++) r.sys.bagged('near', x0 + 300);
    expect(r.sys.view().queued).toBe(n);
    const picked: number[] = [];
    let maxCarry = 0;
    for (let i = 0; i < 60 * 60 && r.sys.view().fetches < n; i++) {
      r.run(1);
      const v = r.sys.view();
      if (v.phase === 'pickup' && v.t === 1) picked.push(v.x);
      maxCarry = Math.max(maxCarry, v.carrying ? 1 : 0);
    }
    expect(r.sys.view().fetches).toBe(n);
    expect(picked).toHaveLength(n);
    // One at a time, in the order they fell (each a different bird).
    expect(maxCarry).toBe(1);
    expect([...picked].sort((a, b) => a - b)).toEqual(picked);
    // Back out quickly between fetches (backSeconds, not awaySeconds).
    const fetched = r.events.filter((e) => e.type === 'brakkieFetched').map((e) => e.tick);
    const arrived = r.events.filter((e) => e.type === 'brakkieArrived').map((e) => e.tick);
    const back = arrived.find((t) => t > (fetched[0] ?? 0));
    expect(back).toBeDefined();
    expect((back ?? 0) - (fetched[0] ?? 0)).toBeLessThanOrEqual(
      secondsToTicks(B.fetch.backSeconds[1]) + 2,
    );
  });

  it('v1.16 (D-078): a hit empties his queue (he fetches nothing while he bolts)', () => {
    const r = rig(6);
    r.until((v) => v.phase === 'rest');
    for (let i = 0; i < 40 && r.sys.view().queued < 2; i++)
      r.sys.bagged('near', r.sys.view().x + 260);
    expect(r.sys.view().queued).toBeGreaterThan(0);
    r.sys.shot(1, false, aimAtHim(r.sys.view()));
    expect(r.sys.view().queued).toBe(0);
    r.sys.bagged('near', r.sys.view().x + 260);
    expect(r.sys.view().queued).toBe(0);
  });

  it('v1.16 (D-078): livelier — he runs about between rests and fetches most birds in reach', () => {
    const r = rig(4);
    r.until((v) => v.phase === 'rest');
    let runs = 0;
    let trots = 0;
    let last = '';
    for (let i = 0; i < 60 * 80; i++) {
      r.run(1);
      const v = r.sys.view();
      const now = `${v.phase}:${v.pose}`;
      if (now !== last && v.phase === 'trot') {
        if (v.pose === 'run') runs++;
        else trots++;
      }
      last = now;
    }
    expect(runs).toBeGreaterThan(0);
    expect(runs + trots).toBeGreaterThanOrEqual(8);
    // Of 20 birds bagged one by one in reach, he queues most.
    const r2 = rig(5);
    r2.until((v) => v.phase === 'rest');
    let queued = 0;
    for (let i = 0; i < 20; i++) {
      const before = r2.sys.view().queued;
      r2.sys.bagged('near', r2.state.cameraX + 120);
      if (r2.sys.view().queued > before) queued++;
      r2.until((v) => v.queued === 0 && (v.phase === 'rest' || v.phase === 'trot'), 60 * 60);
    }
    expect(queued).toBeGreaterThanOrEqual(14);
  });

  it('a bark gives exactly one threat to the flock it barked at', () => {
    const r = rig(9);
    r.state.barkFlock = { flockId: 7, x: 2000 };
    r.run(60 * 80);
    const barks = r.events.filter((e) => e.type === 'brakkieBarked');
    expect(barks.length).toBeGreaterThan(0);
    expect(r.threats.length).toBe(barks.length);
    for (const t of r.threats) expect(t.flockId).toBe(7);
    // At most one threat a tick.
    expect(new Set(r.threats.map((t) => t.tick)).size).toBe(r.threats.length);
  });

  it('no flock to bark at: no bark, no threat', () => {
    const r = rig(9);
    r.run(60 * 80);
    expect(r.events.some((e) => e.type === 'brakkieBarked')).toBe(false);
    expect(r.threats.length).toBe(0);
  });

  it('a flush is a point, then one flock of point.size bursts up on the mid plane', () => {
    const r = rig(3);
    r.run(60 * 175);
    const flushed = r.events.filter((e) => e.type === 'brakkieFlushed');
    expect(flushed.length).toBe(r.flushes.length);
    expect(r.flushes.length).toBeGreaterThan(0);
    for (const f of r.flushes) expect(f.size).toBe(B.point.size);
    expect(new Set(r.flushes.map((f) => f.tick)).size).toBe(r.flushes.length);
  });

  it('a shot aimed at him costs the penalty once per cooldown; he yelps, bolts and comes back', () => {
    const r = rig(12);
    r.until((v) => v.phase === 'rest');
    r.sys.shot(1, false, aimAtHim(r.sys.view()));
    expect(r.state.penalty).toBe(-B.hit.penalty);
    expect(r.sys.view().phase).toBe('yelp');
    // A second shot inside the cooldown: no points off.
    r.run(10);
    r.sys.shot(2, false, aimAtHim(r.sys.view()));
    expect(r.state.penalty).toBe(-B.hit.penalty);
    const points = r.events.flatMap((e) => (e.type === 'brakkieHit' ? [e.points] : []));
    expect(points).toEqual([-B.hit.penalty, 0]);
    r.until((v) => v.phase === 'bolt');
    r.until((v) => v.phase === 'away');
    // Never removed: back out after hit.awaySeconds.
    r.until((v) => v.present, secondsToTicks(B.hit.awaySeconds[1]) + 60);
    expect(r.sys.view().hits).toBe(2);
  });

  it('a stray pellet (the aim point off him) or a shot that hit a target costs nothing', () => {
    const r = rig(13);
    r.until((v) => v.phase === 'rest');
    const v = r.sys.view();
    r.sys.shot(1, false, () => ({ x: v.x + 500, y: v.y - 300 }));
    expect(r.state.penalty).toBe(0);
    const r2 = rig(13);
    r2.until((w) => w.phase === 'rest');
    r2.sys.shot(1, true, aimAtHim(r2.sys.view()));
    expect(r2.state.penalty).toBe(0);
    const e = r2.events.find((x) => x.type === 'brakkieHit');
    expect(e?.type === 'brakkieHit' && e.aimed).toBe(false);
    // Either way he yelps and bolts.
    expect(r.sys.view().phase).toBe('yelp');
  });

  it('has no hit shapes while away or crossing', () => {
    const r = rig(14);
    const shapes = (): number => {
      let n = 0;
      r.sys.extras(() => {
        n++;
      });
      return n;
    };
    expect(shapes()).toBe(0);
    r.until((v) => v.present);
    expect(shapes()).toBe(2);
  });
});

/** A spot 200 px from him towards the view's centre (always in reach). */
function towardCentre(r: Rig): number {
  const x = r.sys.view().x;
  return x + (x > r.state.cameraX ? -200 : 200);
}

/** Has him fetch and deliver one bird bagged just beside him (he must be idle on the near plane). */
function deliverOne(r: Rig): void {
  r.until((v) => v.present && v.phase === 'rest' && v.plane === 'near');
  r.sys.bagged('near', towardCentre(r));
  r.until((v) => v.phase === 'carry', 60 * 30);
  r.until((v) => v.phase === 'away', 60 * 30);
}

describe('Brakkie the companion (v1.17, D-079)', () => {
  it('"Bring!": every delivery pays bring.points; every bring.streakEvery-th in a row the streak bonus', () => {
    const r = rig(21);
    for (let i = 0; i < B.bring.streakEvery; i++) deliverOne(r);
    const ids = r.bonuses.map((b) => b.id);
    expect(ids.filter((id) => id === 'bring').length).toBe(B.bring.streakEvery);
    expect(ids.filter((id) => id === 'bringStreak').length).toBe(1);
    expect(r.bonuses.find((b) => b.id === 'bring')?.base).toBe(B.bring.points);
    expect(r.bonuses.find((b) => b.id === 'bringStreak')?.base).toBe(B.bring.streakPoints);
    const v = r.sys.view();
    expect(v.streak).toBe(B.bring.streakEvery);
    expect(v.bestStreak).toBe(B.bring.streakEvery);
    expect(v.points).toBe(B.bring.points * B.bring.streakEvery + B.bring.streakPoints);
    const last = r.events.filter((e) => e.type === 'brakkieFetched').at(-1);
    expect(last?.type === 'brakkieFetched' ? last.streak : -1).toBe(B.bring.streakEvery);
  });

  it('the ready rule: every bird in reach is fetched (no chance roll)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = rig(seed);
      deliverOne(r);
      expect(r.sys.view().fetches).toBe(1);
    }
  });

  it('the streak breaks when he is hit', () => {
    const r = rig(22);
    deliverOne(r);
    deliverOne(r);
    expect(r.sys.view().streak).toBe(2);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.shot(5, true, () => ({ x: -9999, y: -9999 }));
    expect(r.sys.view().streak).toBe(0);
    expect(r.sys.view().bestStreak).toBe(2);
    const broke = r.events.find((e) => e.type === 'brakkieStreakBroken');
    expect(broke?.type === 'brakkieStreakBroken' && broke.why).toBe('hit');
  });

  it('the streak breaks for a shot aimed close by while he carries, not for one far off', () => {
    const r = rig(23);
    deliverOne(r);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.bagged('near', towardCentre(r));
    r.until((v) => v.carrying, 60 * 30);
    // Far off: nothing.
    r.sys.aimed(() => ({ x: r.sys.view().x + 2000, y: 0 }), false);
    expect(r.sys.view().streak).toBe(1);
    // Close by: broken.
    r.sys.aimed(aimAtHim(r.sys.view()), false);
    expect(r.sys.view().streak).toBe(0);
    const broke = r.events.find((e) => e.type === 'brakkieStreakBroken');
    expect(broke?.type === 'brakkieStreakBroken' && broke.why).toBe('aim');
    // Not carrying: an aim close by breaks nothing.
    r.until((v) => v.phase === 'away', 60 * 30);
    expect(r.sys.view().streak).toBe(1);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.aimed(aimAtHim(r.sys.view()), false);
    expect(r.sys.view().streak).toBe(1);
  });

  it('"Staan!": the flush is a point (marker ahead), then a flock of 5 bursts up there', () => {
    const r = rig(3);
    r.until((v) => v.phase === 'point', 60 * 175);
    const v = r.sys.view();
    expect(v.pose).toBe('point');
    expect(v.point).not.toBeNull();
    expect(v.point?.layerId).toBe(MID);
    const pointed = r.events.find((e) => e.type === 'brakkiePointed');
    expect(pointed).toBeDefined();
    const t0 = r.state.tick;
    r.until((x) => x.phase !== 'point', 60 * 10);
    expect(r.state.tick - t0).toBeGreaterThanOrEqual(secondsToTicks(B.point.seconds) - 2);
    expect(r.flushes.length).toBe(1);
    expect(r.flushes[0]?.size).toBe(B.point.size);
    expect(r.flushes[0]?.x).toBeCloseTo(v.point?.x ?? NaN, 6);
    expect(r.sys.view().point).toBeNull();
  });

  it('points only when a flock can be there (the flock cap)', () => {
    const r = rig(3);
    r.state.canFlush = false;
    r.run(60 * 175);
    expect(r.events.some((e) => e.type === 'brakkiePointed')).toBe(false);
  });

  it('"Mooi punt!": 3 of the pointed flock bagged in its flush pay goodPoint once', () => {
    const r = rig(3);
    r.until((v) => v.phase === 'point', 60 * 175);
    r.until((v) => v.phase !== 'point', 60 * 10);
    // The stub host gives every flush flock id 99.
    r.sys.bagged('mid', 0, 99);
    r.sys.bagged('mid', 0, 99);
    expect(r.bonuses.some((b) => b.id === 'goodPoint')).toBe(false);
    r.sys.bagged('far', 0, 99);
    r.sys.bagged('mid', 0, 99);
    expect(r.bonuses.filter((b) => b.id === 'goodPoint').length).toBe(1);
    expect(r.bonuses.find((b) => b.id === 'goodPoint')?.base).toBe(B.point.goodPoint.points);
    expect(r.sys.view().goodPoints).toBe(1);
  });

  it('no Mooi punt for birds of another flock or after the window', () => {
    const r = rig(3);
    r.until((v) => v.phase === 'point', 60 * 175);
    r.until((v) => v.phase !== 'point', 60 * 10);
    for (let i = 0; i < 3; i++) r.sys.bagged('mid', 0, 7);
    r.run(secondsToTicks(B.point.goodPoint.withinSeconds) + 1);
    for (let i = 0; i < 3; i++) r.sys.bagged('mid', 0, 99);
    expect(r.bonuses.some((b) => b.id === 'goodPoint')).toBe(false);
  });

  it('"Fluit!": on point the whistle springs the flock now', () => {
    const r = rig(3);
    r.until((v) => v.phase === 'point', 60 * 175);
    expect(r.sys.view().whistle).toBe('spring');
    r.run(5);
    r.sys.whistle();
    expect(r.flushes.length).toBe(1);
    const f = r.events.find((e) => e.type === 'brakkieFlushed');
    expect(f?.type === 'brakkieFlushed' && f.whistled).toBe(true);
    const w = r.events.find((e) => e.type === 'brakkieWhistled');
    expect(w?.type === 'brakkieWhistled' && w.action).toBe('spring');
  });

  it('roaming: "Hier!" — to heel on the bakkie side, sits heelSeconds; "Soek!" sends him back', () => {
    const r = rig(24, -1);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    expect(r.sys.view().whistle).toBe('heel');
    const w0 = r.state.tick;
    r.sys.whistle();
    // The cooldown: nothing for cooldownSeconds.
    expect(r.sys.view().whistle).toBeNull();
    r.until((v) => v.phase === 'heel', 60 * 10);
    const v = r.sys.view();
    expect(v.pose).toBe('sit');
    expect(v.x).toBeCloseTo(r.state.cameraX - B.whistle.heelDxPx, 5);
    r.run(Math.max(0, w0 + secondsToTicks(B.whistle.cooldownSeconds) - r.state.tick));
    expect(r.sys.view().whistle).toBe('seek');
    r.sys.whistle();
    expect(['trot', 'rest']).toContain(r.sys.view().phase);
    const actions = r.events.flatMap((e) => (e.type === 'brakkieWhistled' ? [e.action] : []));
    expect(actions).toEqual(['heel', 'seek']);
  });

  it('heel ends by itself after heelSeconds', () => {
    const r = rig(24, 1);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.whistle();
    r.until((v) => v.phase === 'heel', 60 * 10);
    const t0 = r.state.tick;
    r.until((v) => v.phase !== 'heel', secondsToTicks(B.whistle.heelSeconds) + 5);
    expect(r.state.tick - t0).toBe(secondsToTicks(B.whistle.heelSeconds));
  });

  it('the whistle does nothing while he carries, bolts or is away, and within the cooldown', () => {
    const r = rig(25);
    expect(r.sys.view().whistle).toBeNull();
    r.sys.whistle();
    expect(r.events.some((e) => e.type === 'brakkieWhistled')).toBe(false);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.bagged('near', towardCentre(r));
    r.until((v) => v.carrying, 60 * 30);
    expect(r.sys.view().whistle).toBeNull();
    r.sys.whistle();
    expect(r.events.some((e) => e.type === 'brakkieWhistled')).toBe(false);
  });

  it('reactions: a proud hop from idle, at most one per minGapSeconds, never while busy', () => {
    const r = rig(26);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.cheer();
    expect(r.sys.view().phase).toBe('react');
    expect(r.sys.view().react).toBe('proud');
    r.until((v) => v.phase !== 'react', 60 * 5);
    // Within the gap: nothing.
    r.until((v) => v.phase === 'rest' || v.phase === 'trot', 60 * 5);
    r.sys.cheer();
    expect(r.sys.view().reactions).toBe(1);
    r.run(secondsToTicks(B.react.minGapSeconds));
    r.until((v) => v.present && (v.phase === 'rest' || v.phase === 'trot'), 60 * 30);
    r.sys.cheer();
    expect(r.sys.view().reactions).toBe(2);
    const kinds = r.events.flatMap((e) => (e.type === 'brakkieReacted' ? [e.kind] : []));
    expect(kinds).toEqual(['proud', 'proud']);
  });

  it('the head tilt after react.tiltMisses clean misses in a row (a hit resets the count)', () => {
    const r = rig(27);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    const far = (): { x: number; y: number } => ({ x: -9999, y: -9999 });
    for (let i = 0; i < B.react.tiltMisses - 1; i++) r.sys.aimed(far, true);
    r.sys.aimed(far, false);
    r.sys.aimed(far, true);
    expect(r.sys.view().reactions).toBe(0);
    for (let i = 0; i < B.react.tiltMisses - 1; i++) r.sys.aimed(far, true);
    expect(r.sys.view().react).toBe('tilt');
    expect(r.sys.view().pose).toBe('tilt');
  });

  it('a reaction is short (react.seconds)', () => {
    const r = rig(28);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.cheer();
    const t0 = r.state.tick;
    r.until((v) => v.phase !== 'react', 60 * 5);
    expect(r.state.tick - t0).toBe(secondsToTicks(B.react.seconds));
  });
});

describe('Brakkie fetches sooner (v1.20, D-085)', () => {
  it('runs out fetch.delaySeconds (~1.5 s) after a bag while the shooting goes on', () => {
    expect(B.fetch.delaySeconds).toBeGreaterThanOrEqual(1);
    expect(B.fetch.delaySeconds).toBeLessThanOrEqual(2);
    const r = rig(31);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.state.gunUp = true;
    const t0 = r.state.tick;
    r.sys.bagged('near', towardCentre(r));
    expect(r.sys.view().queued).toBe(1);
    // Not before the bird's delay…
    r.run(secondsToTicks(B.fetch.delaySeconds) - 2);
    expect(r.events.some((e) => e.type === 'brakkieFetchStarted')).toBe(false);
    // …and within a clear check after it, the gun up all the while.
    const t = r.until((v) => v.phase === 'fetch', 60 * 2);
    const late = t - t0 - secondsToTicks(B.fetch.delaySeconds);
    expect(late).toBeGreaterThanOrEqual(0);
    expect(late).toBeLessThanOrEqual(secondsToTicks(B.clear.checkSeconds) + 1);
  });

  it('shots every 0.4 s after the bag (misses: a head tilt) never hold him: out by T + delay', () => {
    const r = rig(38);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    const T = r.state.tick;
    r.sys.bagged('near', towardCentre(r));
    const sky = (): { x: number; y: number } => ({ x: -9999, y: -9999 });
    let fetchAt = -1;
    for (let i = 0; i < 60 * 4 && fetchAt < 0; i++) {
      // The gun is up the whole time and a missed shot goes off every 0.4 s.
      r.state.gunUp = true;
      // From 0.5 s after the bag: the third miss (a head tilt) lands across his 1.5-s mark.
      if (i >= 30 && (i - 30) % secondsToTicks(0.4) === 0) r.sys.aimed(sky, true);
      r.run(1);
      if (r.sys.view().phase === 'fetch') fetchAt = r.state.tick;
    }
    expect(r.sys.view().reactions, 'the misses made him tilt his head').toBeGreaterThan(0);
    expect(fetchAt - T).toBeGreaterThanOrEqual(secondsToTicks(B.fetch.delaySeconds));
    expect(fetchAt - T).toBeLessThanOrEqual(
      secondsToTicks(B.fetch.delaySeconds) + secondsToTicks(B.clear.checkSeconds) + 2,
    );
  });

  it('queues up to 3 birds (fetch.queueMax)', () => {
    expect(B.fetch.queueMax).toBe(3);
    const r = rig(33);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.state.gunUp = true;
    for (let i = 0; i < 6; i++) r.sys.bagged('near', towardCentre(r) + i * 5);
    expect(r.sys.view().queued).toBe(3);
  });

  /** He rests at screen dx −540 (the view moved, not him); a bird down at screen dx +640. */
  function farSpot(r: Rig): { dogX: number; spot: number } {
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    const dogX = r.sys.view().x;
    r.state.cameraX = dogX + 540;
    return { dogX, spot: r.state.cameraX + 640 };
  }

  it('the spot rule while shooting: a live bird near the spot holds him, then the bird is left', () => {
    const r = rig(34);
    const { spot } = farSpot(r);
    r.state.gunUp = true;
    // Only round the spot (the path is clear).
    r.state.busy = (_p, x, px) => Math.abs(x - (spot + 300)) <= px && px > B.clear.pathPx;
    r.sys.bagged('near', spot);
    r.run(secondsToTicks(B.fetch.delaySeconds + B.fetch.waitSeconds) + 30);
    expect(r.events.some((e) => e.type === 'brakkieFetchStarted')).toBe(false);
    expect(r.sys.view().queued).toBe(0);
  });

  it('the path rule while shooting: a live bird between him and a clear spot holds him', () => {
    const r = rig(35);
    const { dogX, spot } = farSpot(r);
    r.state.gunUp = true;
    // A bird 400 px ahead of him: clear of him (> clear.aimPx) and of the spot (> fetch.clearPx),
    // but on his way.
    const bird = dogX + 400;
    expect(spot - bird).toBeGreaterThan(B.fetch.clearPx);
    expect(bird - dogX).toBeGreaterThan(B.clear.aimPx);
    r.state.busy = (_p, x, px) => Math.abs(x - bird) <= px;
    r.sys.bagged('near', spot);
    r.run(secondsToTicks(B.fetch.delaySeconds + B.fetch.waitSeconds) + 30);
    expect(r.events.some((e) => e.type === 'brakkieFetchStarted')).toBe(false);
    // The control: the same bag with the way clear sends him.
    const c = rig(35);
    const far = farSpot(c);
    c.sys.bagged('near', far.spot);
    c.until((v) => v.phase === 'fetch', 60 * 5);
  });

  it('the run rule: a live mid-plane bird over his way on screen holds him (pellets fall on him)', () => {
    const r = rig(37);
    const { dogX, spot } = farSpot(r);
    r.state.gunUp = true;
    // The mid layer x over near x (near sf 1, mid sf 0.6): the view's mid centre + the screen dx.
    const midOver = (x: number): number =>
      0.6 * (r.state.cameraX - 960) + 960 + (x - r.state.cameraX);
    const bird = midOver(dogX + 500);
    r.state.busy = (plane, x, px) => plane === 'mid' && Math.abs(x - bird) <= px;
    r.sys.bagged('near', spot);
    r.run(secondsToTicks(B.fetch.delaySeconds + B.fetch.waitSeconds) + 30);
    expect(r.events.some((e) => e.type === 'brakkieFetchStarted')).toBe(false);
  });

  it('a run out that meets something aimed at is given up: the bird goes back to the queue', () => {
    const r = rig(36);
    const { spot } = farSpot(r);
    r.sys.bagged('near', spot);
    r.until((v) => v.phase === 'fetch', 60 * 5);
    // A pop-up comes up just ahead of him.
    const at = r.sys.view().x + 300;
    r.state.busy = (_p, x, px) => Math.abs(x - at) <= px;
    r.run(secondsToTicks(B.clear.checkSeconds) + 2);
    expect(r.sys.view().phase).not.toBe('fetch');
    expect(r.sys.view().queued).toBe(1);
  });

  it('"Soek!": with a bird down the whistle sends him for it at once, gun busy or not', () => {
    const r = rig(32);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.state.gunUp = true;
    expect(r.sys.view().whistle).toBe('heel');
    r.sys.bagged('near', towardCentre(r));
    expect(r.sys.view().whistle).toBe('seek');
    r.sys.whistle();
    expect(r.sys.view().phase).toBe('fetch');
    const w = r.events.find((e) => e.type === 'brakkieWhistled');
    expect(w?.type === 'brakkieWhistled' && w.action).toBe('seek');
  });
});

describe('the Jag, Brakkie! card (v1.20, D-085)', () => {
  const J = B.jag;
  /** Three foraging guineafowl on the near plane, spread out in view. */
  function withPrey(r: Rig, plane: 'near' | 'mid' = 'near'): void {
    const sf = plane === 'near' ? 1 : 0.6;
    const centre = sf * (r.state.cameraX - 960) + 960;
    for (let i = 0; i < 5; i++)
      r.state.prey.push({ birdId: 10 + i, plane, x: centre - 300 + i * 150, walking: true });
  }

  it('he sprints at a foraging guineafowl, pounces, catches it and carries it home (Bring!)', () => {
    const r = rig(41);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r);
    r.sys.jag(3);
    expect(r.events.some((e) => e.type === 'brakkieJagStarted')).toBe(true);
    r.until((v) => v.phase === 'hunt', 60);
    r.until((v) => v.phase === 'pounce', 60 * 5);
    expect(r.sys.view().pose).toBe('pounce');
    r.until((v) => v.carrying, 60 * 2);
    expect(r.state.caught).toHaveLength(1);
    const c = r.events.find((e) => e.type === 'brakkieCaught');
    expect(c?.type === 'brakkieCaught' && c.catches).toBe(1);
    expect(r.sys.view().jag).toEqual({ catches: 1, maxCatches: 3 });
    // The clock holds while he carries it home.
    expect(r.sys.jagHeld()).toBe(true);
    r.until((v) => v.phase === 'away', 60 * 20);
    expect(r.bonuses.filter((b) => b.id === 'bring')).toHaveLength(1);
    expect(r.sys.view().streak).toBe(1);
  });

  it("the caught bird's flock hears alarmThreats threats from the catch, alarmEverySeconds apart", () => {
    const r = rig(51);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r);
    r.sys.jag(1);
    r.until((v) => v.carrying, 60 * 10);
    const caughtAt = r.events.find((e) => e.type === 'brakkieCaught')?.tick ?? -1;
    r.run(secondsToTicks(J.alarmEverySeconds * J.alarmThreats) + 5);
    const t = r.threats.filter((x) => x.flockId === 7).map((x) => x.tick);
    expect(J.alarmThreats).toBe(3);
    expect(t).toEqual(
      Array.from(
        { length: J.alarmThreats },
        (_, i) => caughtAt + i * secondsToTicks(J.alarmEverySeconds),
      ),
    );
  });

  it('catches at most maxCatches, then the card ends (jagEnded); the streak counts them', () => {
    const r = rig(42);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r);
    r.sys.jag(3);
    for (let i = 0; i < 60 * 90 && r.sys.view().fetches < 3; i++) r.run(1);
    expect(r.state.caught).toHaveLength(3);
    expect(r.state.jagEnded).toBe(1);
    expect(r.sys.view().jag).toBeNull();
    const end = r.events.find((e) => e.type === 'brakkieJagEnded');
    expect(end?.type === 'brakkieJagEnded' && end.why).toBe('max');
    // 3 deliveries in a row: they count toward Goeie hond! (every bring.streakEvery in a row).
    expect(r.sys.view().streak).toBe(3);
    expect(r.bonuses.filter((b) => b.id === 'bring')).toHaveLength(3);
    expect(r.bonuses.filter((b) => b.id === 'bringStreak')).toHaveLength(
      Math.floor(3 / B.bring.streakEvery),
    );
    // Two birds left foraging: never a 4th.
    r.run(60 * 20);
    expect(r.state.caught).toHaveLength(3);
    expect(r.sys.view().catches).toBe(3);
  });

  it('only foraging birds: one that took off (not walking) is never a target', () => {
    const r = rig(43);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r);
    for (const p of r.state.prey) p.walking = false;
    r.sys.jag(3);
    r.run(60 * 8);
    expect(r.events.some((e) => e.type === 'brakkiePounced')).toBe(false);
    expect(r.state.caught).toHaveLength(0);
  });

  it('a bird that leaves the ground mid-chase is let go', () => {
    const r = rig(44);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r);
    r.sys.jag(3);
    r.until((v) => v.phase === 'hunt', 60);
    // Every bird is up in the air now.
    r.state.prey.length = 0;
    r.run(2);
    expect(['hunt', 'pounce']).not.toContain(r.sys.view().phase);
    expect(r.state.caught).toHaveLength(0);
  });

  it('crosses to the mid ground for a mid bird and comes back across with it', () => {
    const r = rig(45);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r, 'mid');
    r.sys.jag(1);
    const phases: string[] = [];
    for (let i = 0; i < 60 * 30; i++) {
      const v = r.sys.view();
      if (phases.at(-1) !== `${v.phase}:${v.plane}`) phases.push(`${v.phase}:${v.plane}`);
      if (v.phase === 'away') break;
      r.run(1);
    }
    expect(phases).toEqual(
      expect.arrayContaining(['cross:near', 'hunt:mid', 'pounce:mid', 'cross:mid', 'carry:near']),
    );
    expect(r.state.caught).toHaveLength(1);
  });

  it('a shot aimed at him while he hunts costs −25 and ends the card', () => {
    const r = rig(46);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    withPrey(r);
    r.sys.jag(3);
    r.until((v) => v.phase === 'hunt', 60);
    r.run(3);
    r.sys.shot(1, false, aimAtHim(r.sys.view()));
    expect(r.state.penalty).toBe(-B.hit.penalty);
    expect(r.state.jagEnded).toBe(1);
    expect(r.sys.view().jag).toBeNull();
    const end = r.events.find((e) => e.type === 'brakkieJagEnded');
    expect(end?.type === 'brakkieJagEnded' && end.why).toBe('hit');
    r.run(60 * 10);
    expect(r.state.caught).toHaveLength(0);
  });

  it('time out (jagStop) stops the chase; canJag is false once bolted or with a wide gun', () => {
    const r = rig(47);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    expect(r.sys.canJag()).toBe(true);
    withPrey(r);
    r.sys.jag(3);
    r.until((v) => v.phase === 'hunt', 60);
    r.sys.jagStop();
    expect(r.state.jagEnded).toBe(0);
    expect(r.sys.view().phase).not.toBe('hunt');
    r.run(60 * 5);
    expect(r.state.caught).toHaveLength(0);
    r.state.wide = true;
    expect(r.sys.canJag()).toBe(false);
    r.state.wide = false;
    r.until((v) => v.hittable && v.plane === 'near', 60 * 10);
    r.sys.shot(2, true, () => ({ x: -9999, y: -9999 }));
    expect(r.sys.canJag()).toBe(false);
  });

  it('the clock counts his hunting time: it runs while he looks and chases, holds while he fetches', () => {
    const r = rig(49);
    r.until((v) => v.present && v.phase === 'rest', 60 * 30);
    r.sys.jag(3);
    // Looking round (no prey yet): the clock runs.
    expect(r.sys.jagHeld()).toBe(false);
    // A shot bird: he fetches it, the card's clock holds.
    r.sys.bagged('near', towardCentre(r));
    r.until((v) => v.phase === 'fetch', 60 * 5);
    expect(r.sys.jagHeld()).toBe(true);
    r.until((v) => v.phase === 'away', 60 * 20);
    expect(r.sys.jagHeld()).toBe(true);
    // Back out with prey about: the chase counts.
    withPrey(r);
    r.until((v) => v.phase === 'hunt', 60 * 20);
    expect(r.sys.jagHeld()).toBe(false);
  });

  it('a wide-spread gun ends the card in any phase (chasing, or away at the bakkie)', () => {
    for (const where of ['hunt', 'away'] as const) {
      const r = rig(50);
      r.until((v) => v.present && v.phase === 'rest', 60 * 30);
      withPrey(r);
      r.sys.jag(3);
      if (where === 'hunt') r.until((v) => v.phase === 'hunt', 60);
      else r.until((v) => v.phase === 'away', 60 * 40);
      r.state.wide = true;
      r.run(2);
      expect(r.sys.view().jag, where).toBeNull();
      expect(r.sys.jagHeld()).toBe(false);
      const end = r.events.find((e) => e.type === 'brakkieJagEnded');
      expect(end?.type === 'brakkieJagEnded' && end.why).toBe('gun');
      expect(r.state.jagEnded).toBe(1);
    }
  });

  it('is deterministic: the same seed and prey give the same events', () => {
    const go = (): string => {
      const r = rig(48);
      r.until((v) => v.present && v.phase === 'rest', 60 * 30);
      withPrey(r);
      r.sys.jag(3);
      r.run(60 * 40);
      return JSON.stringify(r.events);
    };
    expect(go()).toBe(go());
    expect(J.sprintPx).toBeGreaterThan(B.speeds.runPx);
  });
});
