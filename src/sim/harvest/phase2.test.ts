// v1.18 (D-081): Die Oes, Phase 2 — "Defend the field". The unlock threshold; the wave list is
// fixed and seeded (deterministic); the crossings (a warthog jumps the fence, a piglet squeezes
// under it, a baboon climbs over the posts); the stopping rules (a first hit drives one out, two
// bag a warthog; piglets are never targets: a shot near one scares it out, aimed at one costs
// 15); the end conditions (all stopped, the clock, the crop gone) and the bonuses.
import { describe, expect, it } from 'vitest';
import { ofType } from '../../../tools/simHarness';
import { loadContent } from '../../../tools/testContent';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import { createRng } from '../rng';
import { createSim } from '../Sim';
import type { Phase2AnimalView } from '../types';
import {
  createPhase2,
  jumpLift,
  phase2Bonuses,
  waveSchedule,
  type Phase2Geometry,
  type Phase2System,
} from './phase2';

const base = loadContent();
const H = base.modes.modes.harvest;
const P = H.phase2;
const INTRO = secondsToTicks(H.intro.seconds);
const RUSH = secondsToTicks(H.huntSeconds);
const OUTRO = secondsToTicks(H.outroSeconds);
const BANNER = secondsToTicks(P.bannerSeconds);
const SECONDS = secondsToTicks(P.seconds);

function withPhase2(over: Partial<typeof P>, harvest: Partial<typeof H> = {}) {
  return {
    ...base,
    modes: {
      ...base.modes,
      modes: { ...base.modes.modes, harvest: { ...H, ...harvest, phase2: { ...P, ...over } } },
    },
  };
}

function runSim(content: ReturnType<typeof withPhase2>, seed = 5) {
  const s = createSim({ seed, content, mode: { id: 'harvest' }, inputKind: 'pointer' });
  const ev: SimEvent[] = [];
  for (let i = 0; i < 20000 && !s.isOver(); i++) {
    s.step([]);
    ev.push(...s.drainEvents());
  }
  return { s, ev };
}

const geo: Phase2Geometry = {
  fenceY: 700,
  postPx: H.fence.postPx,
  mid: {
    layerId: 'mid',
    plane: 'mid',
    width: 3840,
    scale: 0.42,
    minHitRadius: 0,
    digSpots: [
      { x: 1037, y: 750 },
      { x: 2700, y: 760 },
    ],
    mielies: [{ x: 1344, y: 752 }],
  },
  near: {
    layerId: 'near',
    plane: 'near',
    width: 5120,
    scale: 1,
    minHitRadius: 0,
    digSpots: [{ x: 1843, y: 1045 }],
    mielies: [],
  },
};

function standalone(waves: typeof P.waves = P.waves, seed = 9) {
  let tick = 0;
  let penalty = 0;
  let next = 100;
  const events: SimEvent[] = [];
  const sys: Phase2System = createPhase2(
    { ...H, phase2: { ...P, waves, jitterSeconds: 0 } },
    base.birds.baboons,
    geo,
    createRng(seed).stream('harvestPhase2'),
    {
      tick: () => tick,
      emit: (e) => {
        events.push(e);
      },
      awardBonus: (_b, b) => b,
      basePoints: () => 10,
      penalty: (p) => {
        penalty += p;
      },
    },
    () => next++,
  );
  sys.start(80);
  const step = (n = 1): readonly Phase2AnimalView[] => {
    for (let i = 0; i < n; i++) {
      sys.step();
      tick++;
    }
    return sys.view();
  };
  return { sys, events, step, penalty: () => penalty, tick: () => tick };
}

describe('Phase 2 unlock (v1.18, D-081)', () => {
  it('a rush under unlockScore ends with the normal tally (no Phase 2)', () => {
    const { ev } = runSim(withPhase2({ unlockScore: 1_000_000 }));
    expect(ofType(ev, 'phase2Unlocked')).toHaveLength(0);
    expect(ofType(ev, 'huntEnded')[0]?.tick).toBe(INTRO + RUSH + OUTRO);
  });

  it('review: a rush that lost the whole crop never unlocks it, whatever the score', () => {
    const { ev } = runSim(
      withPhase2(
        { unlockScore: 0 },
        { crop: { ...H.crop, drainPerSecond: { guineafowl: 5, warthog: 50, baboon: 50 } } },
      ),
    );
    expect(ofType(ev, 'harvestFenceClosed')[0]?.crop).toBe(0);
    expect(ofType(ev, 'phase2Unlocked')).toHaveLength(0);
    expect(ofType(ev, 'huntEnded')[0]?.tick).toBe(INTRO + RUSH + OUTRO);
  });

  it('at or over unlockScore: the banner, then Phase 2 on its clock; the hunt runs longer', () => {
    const { ev } = runSim(
      withPhase2(
        { unlockScore: 0, drainPerSecond: { warthog: 0, piglet: 0, baboon: 0 } },
        { crop: { ...H.crop, drainPerSecond: { guineafowl: 0, warthog: 0, baboon: 0 } } },
      ),
    );
    const u = ofType(ev, 'phase2Unlocked')[0];
    const closed = ofType(ev, 'harvestFenceClosed')[0];
    expect(u?.tick).toBe(closed?.tick);
    const started = ofType(ev, 'phase2Started')[0];
    expect(started?.tick).toBe((u?.tick ?? 0) + BANNER);
    expect(started?.endTick).toBe((started?.tick ?? 0) + SECONDS);
    const ended = ofType(ev, 'phase2Ended')[0];
    expect(ended?.reason).toBe('time');
    expect(ended?.tick).toBe(started?.endTick);
    expect(ofType(ev, 'huntEnded')[0]?.tick).toBe((ended?.tick ?? 0) + OUTRO);
    // Nothing ate: the crop as the rush left it, the perfect bonus, no clear bonus.
    expect(ended?.crop).toBe(closed?.crop);
    expect(ended?.perfectBonus).toBe(P.perfectBonus);
    expect(ended?.clearBonus).toBe(0);
  });

  it('the test flag starts Phase 2 at once: the fence whole, no workers, the crop at 100', () => {
    const c = withPhase2({ direct: true });
    const s = createSim({ seed: 3, content: c, mode: { id: 'harvest' }, inputKind: 'pointer' });
    s.step([]);
    const h = s.snapshot().harvest;
    expect(h?.phase).toBe('banner');
    expect(h?.repair).toBe(1);
    expect(h?.hole?.patched).toBe(true);
    expect(h?.workers).toHaveLength(0);
    expect(h?.crop).toBe(100);
    expect(h?.phase2?.left).toBe(P.waves.length);
    expect(h?.clockTicksLeft).toBe(SECONDS);
    const ev = s.drainEvents();
    expect(ofType(ev, 'harvestFenceBroken')).toHaveLength(0);
  });

  it('no shooting in the banner', () => {
    const c = withPhase2({ direct: true });
    const s = createSim({ seed: 3, content: c, mode: { id: 'harvest' }, inputKind: 'pointer' });
    s.step([]);
    s.step([{ t: 'fire', dx: 0, sy: 700 }]);
    expect(ofType(s.drainEvents(), 'shotFired')).toHaveLength(0);
  });
});

describe('the wave list (v1.18, D-081)', () => {
  it('is the content list, jittered by the seed, the same for the same seed', () => {
    const a = waveSchedule(P, createRng(1).stream('harvestPhase2'));
    const b = waveSchedule(P, createRng(1).stream('harvestPhase2'));
    const c = waveSchedule(P, createRng(2).stream('harvestPhase2'));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(P.waves.length);
    a.forEach((x, i) => {
      const w = P.waves[i];
      if (w === undefined) throw new Error('no wave');
      expect(Math.abs(x.at - secondsToTicks(w.at))).toBeLessThanOrEqual(
        secondsToTicks(P.jitterSeconds) + 1,
      );
      const r = P.crossU[w.from];
      expect(x.crossU).toBeGreaterThanOrEqual(r[0]);
      expect(x.crossU).toBeLessThanOrEqual(r[1]);
    });
  });

  it('about two dozen animals in 30 s, from every side; piglets, warthogs and baboons', () => {
    expect(P.waves.length).toBeGreaterThanOrEqual(20);
    expect(P.seconds).toBe(30);
    for (const k of ['warthog', 'piglet', 'baboon'] as const)
      expect(P.waves.some((w) => w.kind === k)).toBe(true);
    for (const f of ['left', 'right', 'back'] as const)
      expect(P.waves.some((w) => w.from === f)).toBe(true);
    expect(P.waves.some((w) => w.plane === 'near')).toBe(true);
    expect(Math.max(...P.waves.map((w) => w.at))).toBeLessThan(P.seconds);
  });

  it('two runs of the same seed are identical', () => {
    const c = withPhase2({ direct: true });
    const a = runSim(c, 8).ev;
    const b = runSim(c, 8).ev;
    expect(a).toEqual(b);
  });
});

describe('over and under the fence (v1.18, D-081)', () => {
  it('a warthog jumps it, a piglet squeezes under, a baboon climbs a post and drops in', () => {
    const waves = [
      { at: 0, kind: 'warthog', from: 'left', plane: 'mid' },
      { at: 0, kind: 'piglet', from: 'right', plane: 'mid' },
      { at: 0, kind: 'baboon', from: 'back', plane: 'mid' },
    ] as const;
    const { step } = standalone([...waves]);
    const top = geo.fenceY - H.fence.postPx * geo.mid.scale;
    const seen = {
      jumpHigh: false,
      squeezeLow: true,
      squeezed: false,
      climbTop: false,
      drop: false,
    };
    for (let i = 0; i < 60 * 20; i++)
      for (const a of step()) {
        if (a.kind === 'warthog' && a.phase === 'jump' && a.y < geo.fenceY - 200)
          seen.jumpHigh = true;
        if (a.kind === 'piglet' && a.phase === 'squeeze') {
          seen.squeezed = true;
          if (a.y < geo.fenceY - 30) seen.squeezeLow = false;
        }
        if (a.kind === 'baboon' && a.phase === 'climb' && a.y <= top + 8) seen.climbTop = true;
        if (a.kind === 'baboon' && a.phase === 'drop') seen.drop = true;
      }
    expect(seen).toEqual({
      jumpHigh: true,
      squeezeLow: true,
      squeezed: true,
      climbTop: true,
      drop: true,
    });
  });

  it('the jump is a parabola peaking halfway', () => {
    expect(jumpLift(0, 100)).toBe(0);
    expect(jumpLift(1, 100)).toBe(0);
    expect(jumpLift(0.5, 100)).toBe(100);
  });
});

describe('stopping them (v1.18, D-081)', () => {
  const one = (kind: 'warthog' | 'piglet' | 'baboon') =>
    [{ at: 0, kind, from: 'left', plane: 'mid' }] as typeof P.waves;
  const aimAt = (a: Phase2AnimalView) => () => ({ x: a.x, y: a.y - 20 });

  it('a warthog: the first hit drives it out (stopped), the second bags it', () => {
    const r = standalone(one('warthog'));
    const a = r.step(120)[0];
    if (a === undefined) throw new Error('no warthog');
    r.sys.shot(1, [a.id], false, aimAt(a));
    expect(r.sys.left()).toBe(0);
    expect(r.step()[0]?.phase).toBe('flee');
    r.sys.shot(2, [a.id], false, aimAt(a));
    expect(ofType(r.events, 'warthogBagged')).toHaveLength(1);
    expect(r.step()[0]?.phase).toBe('tumble');
    expect(r.sys.left()).toBe(0);
    expect(r.sys.cleared()).toBe(true);
  });

  it('a baboon is a raider: hitsToBag hits bag it; the first drives it out', () => {
    const r = standalone(one('baboon'));
    const a = r.step(60)[0];
    if (a === undefined) throw new Error('no baboon');
    r.sys.shot(1, [a.id], false, aimAt(a));
    expect(ofType(r.events, 'baboonHit')[0]?.hitsLeft).toBe(base.birds.baboons.hit.hitsToBag - 1);
    expect(r.sys.left()).toBe(0);
  });

  it('a piglet is never a target: a shot near it scares it out, free; aimed at it costs 15', () => {
    const r = standalone(one('piglet'));
    const a = r.step(120)[0];
    if (a === undefined) throw new Error('no piglet');
    // Lands near it, misses it.
    r.sys.landed(() => ({ x: a.x + 100, y: a.y }));
    expect(ofType(r.events, 'phase2Scared')).toHaveLength(1);
    expect(r.penalty()).toBe(0);
    expect(r.sys.left()).toBe(0);
    const r2 = standalone(one('piglet'));
    const b = r2.step(120)[0];
    if (b === undefined) throw new Error('no piglet');
    r2.sys.shot(1, [b.id], false, () => ({
      x: b.x,
      y: b.y + H.warthogs.hitboxes.trot.body.oy * b.scale,
    }));
    expect(r2.penalty()).toBe(-H.warthogs.pigletPenalty);
    expect(r2.sys.left()).toBe(0);
    // Not bagged.
    expect(r2.sys.finish('clear', 50).bagged).toBe(0);
  });

  it('a stray pellet on a piglet behind a warthog it hit costs nothing', () => {
    const r = standalone(one('piglet'));
    const b = r.step(120)[0];
    if (b === undefined) throw new Error('no piglet');
    r.sys.shot(1, [b.id], true, () => ({ x: b.x, y: b.y - 15 }));
    expect(r.penalty()).toBe(0);
  });
});

describe('the end and the bonuses (v1.18, D-081)', () => {
  it('pays crop × cropBonusPerPercent, perfect if the crop held, clear if all stopped in time', () => {
    expect(phase2Bonuses(P, 80, 80, true, 'clear')).toEqual({
      cropBonus: 80 * P.cropBonusPerPercent,
      perfectBonus: P.perfectBonus,
      clearBonus: P.clearBonus,
    });
    expect(phase2Bonuses(P, 80, 61.7, false, 'time')).toEqual({
      cropBonus: 61 * P.cropBonusPerPercent,
      perfectBonus: 0,
      clearBonus: 0,
    });
    expect(phase2Bonuses(P, 80, 0, false, 'eaten')).toEqual({
      cropBonus: 0,
      perfectBonus: 0,
      clearBonus: 0,
    });
  });

  it('the crop gone ends it early ("They ate the lot!"): the hunt ends after the outro', () => {
    const { ev } = runSim(
      withPhase2({ direct: true, drainPerSecond: { warthog: 50, piglet: 50, baboon: 50 } }),
    );
    const end = ofType(ev, 'phase2Ended')[0];
    expect(end?.reason).toBe('eaten');
    expect(end?.crop).toBe(0);
    const started = ofType(ev, 'phase2Started')[0];
    expect(end?.tick).toBeLessThan(started?.endTick ?? 0);
    expect(ofType(ev, 'huntEnded')[0]?.tick).toBe((end?.tick ?? 0) + OUTRO);
  });

  it('all stopped before the clock: clear (the rest of the time is not played)', () => {
    const r = standalone(
      [
        { at: 0, kind: 'warthog', from: 'left', plane: 'mid' },
        { at: 0, kind: 'piglet', from: 'right', plane: 'mid' },
      ],
      3,
    );
    const v = r.step(60);
    for (const a of v) r.sys.shot(1, [a.id], false, () => ({ x: a.x, y: a.y - 15 }));
    expect(r.sys.cleared()).toBe(true);
    const res = r.sys.finish('clear', 80);
    expect(res.clearBonus).toBe(P.clearBonus);
    expect(res.stopped).toBe(2);
  });
});
