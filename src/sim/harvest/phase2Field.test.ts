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
function unit(opts: { score?: number; harvest?: Harvest } = {}) {
  const oes = base.biomes.find((b) => b.id === 'oes');
  if (oes === undefined) throw new Error('no oes');
  const content = opts.harvest === undefined ? base : withHarvest(() => opts.harvest ?? H);
  let tick = 0;
  let penalties = 0;
  let added = 0;
  const events: SimEvent[] = [];
  const host: HarvestHost = {
    tick: () => tick,
    emit: (e) => {
      events.push(e);
    },
    awardBonus: (_b, b) => b,
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
