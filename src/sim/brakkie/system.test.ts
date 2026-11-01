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
  };
}

function rig(seed = 3, homeSide: 1 | -1 = -1): Rig {
  const events: SimEvent[] = [];
  const threats: Rig['threats'] = [];
  const flushes: Rig['flushes'] = [];
  const state: Rig['state'] = {
    tick: 0,
    cameraX: 2560,
    gunUp: false,
    busy: () => false,
    barkFlock: null,
    penalty: 0,
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
    busyNear: (plane, x, px) => state.busy(plane, x, px),
    barkTarget: () => state.barkFlock,
    threaten: (flockId, fromX) => {
      threats.push({ flockId, fromX, tick: state.tick });
    },
    flush: (x, size) => {
      flushes.push({ x, size, tick: state.tick });
      return 99;
    },
  };
  const sys = createBrakkieSystem(
    content,
    {
      layers: { near: { id: NEAR, scrollFactor: 1 }, mid: { id: MID, scrollFactor: 0.6 } },
      planeScale: { near: 1, mid: 0.42 },
      groundY: { near: B.groundY, mid: 760 },
      homeSide,
      durationTicks: secondsToTicks(90),
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
  return { sys, events, threats, flushes, run, until, state };
}

/** A shot aimed at his body centre (layer coords → the aim point on every layer). */
function aimAtHim(v: BrakkieView): (layerId: string) => { x: number; y: number } {
  const box = v.pose === 'lie' || v.pose === 'dig' ? B.hitboxes.low : B.hitboxes.stand;
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

  it('a flush digs, then one flock of flush.size bursts up on the mid plane', () => {
    const r = rig(10);
    r.run(60 * 88);
    const flushed = r.events.filter((e) => e.type === 'brakkieFlushed');
    expect(flushed.length).toBe(r.flushes.length);
    expect(r.flushes.length).toBeGreaterThan(0);
    for (const f of r.flushes) {
      expect(f.size).toBeGreaterThanOrEqual(B.flush.size[0]);
      expect(f.size).toBeLessThanOrEqual(B.flush.size[1]);
    }
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
