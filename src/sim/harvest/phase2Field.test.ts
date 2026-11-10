// v1.18 (D-081, review): Phase 2 has the field to itself. The workers are out of the line of fire
// from the moment it unlocks (gone by the banner's end, never hittable while they walk off).
import { describe, expect, it } from 'vitest';
import { ofType } from '../../../tools/simHarness';
import { loadContent } from '../../../tools/testContent';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import { createRng } from '../rng';
import { createSim } from '../Sim';
import { createHarvestSystem, type HarvestHost } from './system';

const base = loadContent();
const H = base.modes.modes.harvest;
const P = H.phase2;
const INTRO = secondsToTicks(H.intro.seconds);
const RUSH = secondsToTicks(H.huntSeconds);
const BANNER = secondsToTicks(P.bannerSeconds);

type Harvest = typeof H;
function withHarvest(over: (h: Harvest) => Harvest) {
  return {
    ...base,
    modes: { ...base.modes, modes: { ...base.modes.modes, harvest: over(H) } },
  };
}
/** Phase 2 always unlocks; nothing eats the rush's crop (unless `rushDrain`). */
const unlocked = (rushDrain = false) =>
  withHarvest((h) => ({
    ...h,
    crop: rushDrain
      ? h.crop
      : { ...h.crop, drainPerSecond: { guineafowl: 0, warthog: 0, baboon: 0 } },
    phase2: { ...h.phase2, unlockScore: 0 },
  }));

/** The Harvest system on its own, with a host that records what it is given. */
function unit(opts: { score?: number; harvest?: Harvest; awardMul?: number } = {}) {
  const oes = base.biomes.find((b) => b.id === 'oes');
  if (oes === undefined) throw new Error('no oes');
  const content = opts.harvest === undefined ? base : withHarvest(() => opts.harvest ?? H);
  let tick = 0;
  let penalties = 0;
  let added = 0;
  const awards: { bonus: string; base: number }[] = [];
  const events: SimEvent[] = [];
  const host: HarvestHost = {
    tick: () => tick,
    emit: (e) => {
      events.push(e);
    },
    // The hunt's awardBonus multiplies (Frenzy): here × awardMul.
    awardBonus: (bonus, b) => {
      awards.push({ bonus, base: b });
      return b * (opts.awardMul ?? 1);
    },
    basePoints: () => 10,
    penalty: (p) => {
      penalties += p;
    },
    addScore: (p) => {
      added += p;
    },
    eatingBirds: () => 0,
    eatingRaiders: () => 0,
    flocksOn: () => 0,
    gapFlock: () => false,
    scatterFlocks: () => {},
    score: () => opts.score ?? 1_000_000,
    extendBy: () => {},
    endAt: () => {},
    phase2Rng: createRng(4).stream('harvestPhase2'),
    baboonTuning: base.birds.baboons,
  };
  const sys = createHarvestSystem(
    oes,
    content,
    { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    { near: 0, mid: 0, far: 18, ver: 10 },
    H.huntSeconds,
    createRng(4).stream('harvest'),
    host,
  );
  if (sys === null) throw new Error('no harvest');
  const step = (): void => {
    sys.step();
    tick++;
  };
  const ids = (): number[] => {
    const out: number[] = [];
    sys.extras((_l, e) => {
      if (e.kind === 'harvest') out.push(e.harvestId);
    });
    return out;
  };
  return {
    sys,
    events,
    step,
    ids,
    tick: () => tick,
    penalties: () => penalties,
    added: () => added,
    awards,
  };
}

describe('the workers in Phase 2 (v1.18, D-081, review)', () => {
  it('content: they are gone by the end of the banner', () => {
    expect(H.workers.leaveSeconds).toBeLessThanOrEqual(P.bannerSeconds);
  });

  it('are never hittable once Phase 2 unlocks, and are gone before its clock starts', () => {
    const u = unit();
    const workerIds = u.sys.view().workers.map((w) => w.id);
    expect(workerIds.length).toBeGreaterThan(0);
    // Up to the unlock (the rush's last tick) they are at the gap, hittable.
    while (ofType(u.events, 'phase2Unlocked').length === 0) {
      if (u.tick() > INTRO + RUSH + 10) throw new Error('no unlock');
      u.step();
    }
    let started = false;
    for (let i = 0; i < BANNER + 60 * 5; i++) {
      // Not one hit shape for a worker from the unlock on.
      expect(u.ids().filter((id) => workerIds.includes(id))).toEqual([]);
      // A pellet on one costs nothing and makes nobody duck.
      for (const w of u.sys.view().workers)
        u.sys.shot(1, [w.id], false, () => ({ x: w.x, y: w.y - 300 }));
      if (u.sys.view().phase === 'defend' && !started) {
        started = true;
        // The clock starts with the field empty of workers.
        expect(u.sys.view().workers).toEqual([]);
      }
      u.step();
    }
    expect(started).toBe(true);
    expect(u.penalties()).toBe(0);
    expect(ofType(u.events, 'harvestBystanderHit').filter((e) => e.who === 'worker')).toEqual([]);
  });

  it('in the hunt (no test flag): no worker on the field from the first tick of the clock', () => {
    const s = createSim({
      seed: 3,
      content: unlocked(),
      mode: { id: 'harvest' },
      inputKind: 'pointer',
    });
    let checked = 0;
    for (let i = 0; i < 20000 && !s.isOver(); i++) {
      s.step([]);
      s.drainEvents();
      const h = s.snapshot().harvest;
      if (h?.phase === 'defend') {
        expect(h.workers).toEqual([]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });
});

describe('Phase 2 has the field to itself (v1.18, D-081, review)', () => {
  it('no raid, flock or pop-up starts in the banner or Phase 2; the raid in hand runs off', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createSim({
        seed,
        content: unlocked(),
        mode: { id: 'harvest' },
        inputKind: 'pointer',
      });
      const during: SimEvent[] = [];
      let defend = 0;
      for (let i = 0; i < 20000 && !s.isOver(); i++) {
        s.step([]);
        const ev = s.drainEvents();
        const h = s.snapshot().harvest;
        if (h?.phase2 === null || h?.phase2 === undefined) continue;
        // After the unlock's tick (the rush's last) on: the banner, Phase 2 and its outro.
        if (ofType(ev, 'phase2Unlocked').length === 0) during.push(...ev);
        if (h.phase === 'defend') {
          defend++;
          // Past the first seconds nothing of the rush is left at the field.
          if (defend > 60 * 3) {
            const raiders = s.snapshot().baboons?.raiders ?? [];
            expect(raiders.filter((r) => r.phase === 'approach' || r.phase === 'act')).toEqual([]);
            expect(s.snapshot().flocks).toEqual([]);
          }
        }
      }
      const at = `seed ${String(seed)}`;
      expect(defend, at).toBeGreaterThan(60 * 10);
      expect(ofType(during, 'baboonRaidWarned'), at).toEqual([]);
      expect(ofType(during, 'baboonRaidStarted'), at).toEqual([]);
      expect(ofType(during, 'flockSpawned'), at).toEqual([]);
      expect(
        ofType(during, 'birdSpawned').filter((e) => e.motion === 'popup'),
        at,
      ).toEqual([]);
    }
  });
});

/** Steps the unit to Phase 2's clock. */
function toDefend(u: ReturnType<typeof unit>): void {
  while (u.sys.view().phase !== 'defend') {
    if (u.tick() > INTRO + RUSH + BANNER + 10) throw new Error('no Phase 2');
    u.step();
  }
}

/** The body ellipse's centre of a harvest actor (as extras() adds it). */
function bodyOf(u: ReturnType<typeof unit>, id: number): { x: number; y: number } {
  const at: { x: number; y: number }[] = [];
  u.sys.extras((_l, e) => {
    if (e.kind === 'harvest' && e.harvestId === id) at.push({ x: e.x, y: e.y });
  });
  const body = at[0];
  if (body === undefined) throw new Error(`no shapes for ${String(id)}`);
  return body;
}

describe('Phase 2 piglets in the tally (v1.18, D-081, review)', () => {
  it('a piglet aimed at in Phase 2 counts in "Workers and piglets": the row is the score drop', () => {
    const u = unit();
    toDefend(u);
    expect(u.sys.view().bystanderPenalty).toBe(0);
    let shot = 0;
    for (let i = 0; i < 60 * 30 && shot < 3; i++) {
      const pig = u.sys.view().phase2?.animals.find((a) => a.kind === 'piglet' && a.phase === 'go');
      if (pig !== undefined) {
        const at = bodyOf(u, pig.id);
        u.sys.shot(++shot, [pig.id], false, () => at);
      }
      u.step();
    }
    expect(shot).toBeGreaterThan(0);
    expect(u.penalties()).toBe(-shot * H.warthogs.pigletPenalty);
    expect(u.sys.view().bystanderPenalty).toBe(-u.penalties());
  });
});

describe('Phase 2 points reach the score (v1.18, D-081, review)', () => {
  it("a bag pays through the hunt's awardBonus (× Frenzy); the end bonuses through addScore", () => {
    // Nothing eats (the crop stays: a crop bonus and the perfect bonus at the end).
    const u = unit({
      awardMul: 3,
      harvest: {
        ...H,
        crop: { ...H.crop, drainPerSecond: { guineafowl: 0, warthog: 0, baboon: 0 } },
        phase2: { ...P, drainPerSecond: { warthog: 0, piglet: 0, baboon: 0 } },
      },
    });
    toDefend(u);
    const before = u.added();
    let bagged = false;
    for (let i = 0; i < 60 * 40 && u.sys.view().phase === 'defend'; i++) {
      const hog = bagged
        ? undefined
        : u.sys.view().phase2?.animals.find((a) => a.kind === 'warthog' && a.phase === 'eat');
      if (hog !== undefined) {
        // Two hits bag it (the first one drives it out; it is still in reach on the next tick).
        u.sys.shot(1, [hog.id], false, () => bodyOf(u, hog.id));
        u.sys.shot(2, [hog.id], false, () => bodyOf(u, hog.id));
        bagged = true;
      }
      u.step();
    }
    const bag = ofType(u.events, 'warthogBagged')[0];
    const base = Math.round(10 * H.warthogs.pointsMul);
    expect(u.awards).toContainEqual({ bonus: 'warthog', base });
    expect(bag?.points).toBe(3 * base);
    // Phase 2's end: its bonuses all go to the score.
    for (let i = 0; i < 60 * 5; i++) u.step();
    const end = ofType(u.events, 'phase2Ended')[0];
    if (end === undefined) throw new Error('Phase 2 never ended');
    const paid = end.cropBonus + end.perfectBonus + end.clearBonus;
    expect(paid).toBeGreaterThan(0);
    expect(u.added() - before).toBe(paid);
  });

  it('in the hunt: the score jumps by the end bonuses the tick Phase 2 ends', () => {
    const quietPhase2 = withHarvest((h) => ({
      ...h,
      crop: { ...h.crop, drainPerSecond: { guineafowl: 0, warthog: 0, baboon: 0 } },
      phase2: { ...h.phase2, unlockScore: 0, drainPerSecond: { warthog: 0, piglet: 0, baboon: 0 } },
    }));
    const s = createSim({
      seed: 4,
      content: quietPhase2,
      mode: { id: 'harvest' },
      inputKind: 'pointer',
    });
    let last = 0;
    let checked = false;
    for (let i = 0; i < 20000 && !s.isOver(); i++) {
      s.step([]);
      const end = ofType(s.drainEvents(), 'phase2Ended')[0];
      const score = s.snapshot().score;
      if (end !== undefined) {
        const paid = end.cropBonus + end.perfectBonus + end.clearBonus;
        expect(paid).toBeGreaterThan(0);
        expect(score - last).toBe(paid);
        checked = true;
      }
      last = score;
    }
    expect(checked).toBe(true);
  });
});
