// v1.8c (D-063): Die Oes in the sim — the same seed gives the same run; the intro (the fence
// breaks, the warthog family barges in) runs before the 30-s clock and a tap skips it; two hits
// bag a warthog; piglets and workers are never targets and cost points only from a shot aimed at
// them; the crop meter's maths; the fence closes at 30 s and the hunt ends after the outro.
import { describe, expect, it } from 'vitest';
import { ofType, quiet, type Content } from '../../../tools/simHarness';
import { loadContent } from '../../../tools/testContent';
import { planeToDx } from '../camera';
import { secondsToTicks } from '../clock';
import type { SimEvent } from '../events';
import { hashEvents } from '../events';
import { createRng } from '../rng';
import { createSim, type Sim } from '../Sim';
import type { Command } from '../types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../world';
import { createHarvestSystem, cropBonus, cropDrainPerTick, rushRate } from './system';

const content = loadContent();
const H = content.modes.modes.harvest;
const INTRO = secondsToTicks(H.intro.seconds);
const RUSH = secondsToTicks(H.huntSeconds);
const OUTRO = secondsToTicks(H.outroSeconds);

function harvestSim(c: Content | typeof content = content, seed = 7): Sim {
  return createSim({ seed, content: c, mode: { id: 'harvest' }, inputKind: 'pointer' });
}

function runAll(s: Sim, cmds: (tick: number) => Command[] = () => []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 20000 && !s.isOver(); i++) {
    s.step(cmds(i));
    out.push(...s.drainEvents());
  }
  return out;
}

function sf(c: Content | typeof content, layerId: string): number {
  const b = c.biomes.find((x) => x.id === 'oes');
  const l = b?.layers.find((x) => x.id === layerId);
  if (l === undefined) throw new Error(`no layer ${layerId}`);
  return l.scrollFactor;
}

/** Camera on a layer point and a shot at it. */
function aimAt(f: number, x: number, y: number): Command[] {
  const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (x - 960) / f + 960));
  const q = Math.round(cx * 2) / 2;
  return [
    { t: 'cameraTarget', cx: q },
    { t: 'fire', dx: planeToDx(q, f, x), sy: y },
  ];
}

describe('the Harvest hunt (D-063)', () => {
  it('the same seed and commands give the same run', () => {
    const cmds = (i: number): Command[] =>
      i % 37 === 0 ? [{ t: 'fire', dx: ((i * 53) % 1400) - 700, sy: 500 + ((i * 29) % 450) }] : [];
    const a = runAll(harvestSim(content, 11), cmds);
    const b = runAll(harvestSim(content, 11), cmds);
    expect(a.length).toBeGreaterThan(100);
    expect(hashEvents(a)).toBe(hashEvents(b));
    const c = runAll(harvestSim(content, 12), cmds);
    expect(hashEvents(c)).not.toBe(hashEvents(a));
  });

  it('the intro breaks the fence, the family barges in, then 30 s, the fence closes, the outro', () => {
    const ev = runAll(harvestSim());
    const broken = ofType(ev, 'harvestFenceBroken')[0];
    expect(broken?.tick).toBe(Math.round(INTRO * H.intro.breakAt));
    const family = ofType(ev, 'warthogEntered')[0];
    expect(family?.piglets).toBe(H.intro.piglets);
    const intro = ofType(ev, 'harvestIntroEnded')[0];
    expect(intro).toMatchObject({ tick: INTRO, skipped: false, rushEndTick: INTRO + RUSH });
    const closed = ofType(ev, 'harvestFenceClosed')[0];
    expect(closed?.tick).toBe(INTRO + RUSH);
    expect(closed?.bonus).toBe(cropBonus(closed?.crop ?? 0, H.crop.bonusPerPercent));
    const end = ofType(ev, 'huntEnded')[0];
    expect(end?.tick).toBe(INTRO + RUSH + OUTRO);
    // Warthogs keep coming in the rush.
    expect(ofType(ev, 'warthogEntered').length).toBeGreaterThan(3);
  });

  it('a tap in the intro skips it (no shot) and the clock still runs 30 s', () => {
    const ev = runAll(harvestSim(), (i) => (i === 20 ? [{ t: 'fire', dx: 0, sy: 600 }] : []));
    expect(ofType(ev, 'shotFired')).toHaveLength(0);
    const intro = ofType(ev, 'harvestIntroEnded')[0];
    expect(intro?.skipped).toBe(true);
    const at = intro?.tick ?? -1;
    expect(at).toBe(20);
    // The fence broke on the skip, the family came in.
    expect(ofType(ev, 'harvestFenceBroken')[0]?.tick).toBe(20);
    expect(ofType(ev, 'harvestFenceClosed')[0]?.tick).toBe(at + RUSH);
    expect(ofType(ev, 'huntEnded')[0]?.tick).toBe(at + RUSH + OUTRO);
  });

  it('no shot in the outro', () => {
    const ev = runAll(harvestSim(), (i) =>
      i === INTRO + RUSH + 10 ? [{ t: 'fire', dx: 0, sy: 600 }] : [],
    );
    expect(ofType(ev, 'shotFired')).toHaveLength(0);
  });

  it('two hits bag a warthog (an event bonus); the first sends it running', () => {
    const c = quiet('oes');
    const s = harvestSim(c, 3);
    const ev: SimEvent[] = [];
    // Through the intro: the family's sow trots in and digs.
    for (let i = 0; i < INTRO + 240; i++) {
      s.step([]);
      ev.push(...s.drainEvents());
    }
    const midF = sf(c, 'mid');
    for (let shot = 0; shot < 12 && ofType(ev, 'warthogBagged').length === 0; shot++) {
      const w = s.snapshot().harvest?.warthogs.find((x) => x.phase !== 'tumble');
      if (w === undefined) break;
      const box = w.phase === 'dig' ? H.warthogs.hitboxes.dig : H.warthogs.hitboxes.trot;
      const f = w.layerId === 'mid' ? midF : 1;
      s.step(aimAt(f, w.x + box.body.ox * w.scale * w.facing, w.y + box.body.oy * w.scale));
      ev.push(...s.drainEvents());
      for (let k = 0; k < 40; k++) {
        s.step([{ t: 'reload' }]);
        ev.push(...s.drainEvents());
      }
    }
    const hits = ofType(ev, 'warthogHit');
    expect(hits[0]?.hitsLeft).toBe(H.warthogs.hitsToBag - 1);
    const bag = ofType(ev, 'warthogBagged')[0];
    expect(bag).toBeDefined();
    expect(bag?.points).toBe(Math.round(content.scoring.planes.mid.base * H.warthogs.pointsMul));
    expect(s.snapshot().harvest?.warthogsBagged).toBe(1);
  });
});

describe('workers and piglets are never targets (aimed-at rule)', () => {
  const oes = content.biomes.find((b) => b.id === 'oes');
  function setup() {
    if (oes === undefined) throw new Error('no oes');
    let tick = 0;
    let penalty = 0;
    const events: SimEvent[] = [];
    const sys = createHarvestSystem(
      oes,
      content,
      { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
      { near: 0, mid: 0, far: 18, ver: 10 },
      H.huntSeconds,
      createRng(4).stream('harvest'),
      {
        tick: () => tick,
        emit: (e) => {
          events.push(e);
        },
        awardBonus: (_b, base) => base,
        basePoints: () => 10,
        penalty: (p) => {
          penalty += p;
        },
        addScore: () => {},
        eatingBirds: () => 0,
        eatingRaiders: () => 0,
        scatterFlocks: () => {},
      },
    );
    if (sys === null) throw new Error('no harvest');
    for (; tick < INTRO + 60; tick++) sys.step();
    return { sys, events, penalty: () => penalty };
  }
  function shapesOf(sys: NonNullable<ReturnType<typeof createHarvestSystem>>, id: number) {
    const out: { x: number; y: number }[] = [];
    sys.extras((_l, e) => {
      if (e.kind === 'harvest' && e.harvestId === id) out.push({ x: e.x, y: e.y });
    });
    const body = out[0];
    if (body === undefined) throw new Error('no shapes');
    return body;
  }

  it('a shot aimed at a worker costs the penalty (once per cooldown); the worker ducks', () => {
    const s = setup();
    const w = s.sys.view().workers[0];
    if (w === undefined) throw new Error('no worker');
    expect(w.phase).toBe('work');
    const body = shapesOf(s.sys, w.id);
    s.sys.shot(1, [w.id], false, () => body);
    expect(s.penalty()).toBe(-H.workers.penalty);
    expect(s.sys.view().workers[0]?.phase).toBe('duck');
    s.sys.shot(2, [w.id], false, () => body);
    expect(s.penalty()).toBe(-H.workers.penalty);
    const hits = ofType(s.events, 'harvestBystanderHit');
    expect(hits.map((h) => h.points)).toEqual([-H.workers.penalty, 0]);
  });

  it('a stray pellet on a worker (aimed elsewhere) only makes them duck', () => {
    const s = setup();
    const w = s.sys.view().workers[1];
    if (w === undefined) throw new Error('no worker');
    s.sys.shot(1, [w.id], false, () => ({ x: w.x + 600, y: w.y - 100 }));
    expect(s.penalty()).toBe(0);
    expect(s.sys.view().workers[1]?.phase).toBe('duck');
    expect(ofType(s.events, 'harvestBystanderHit')[0]).toMatchObject({ aimed: false, points: 0 });
  });

  it('aimed at a worker but the shot hit a target in front: no penalty', () => {
    const s = setup();
    const w = s.sys.view().workers[0];
    if (w === undefined) throw new Error('no worker');
    s.sys.shot(1, [w.id], true, () => shapesOf(s.sys, w.id));
    expect(s.penalty()).toBe(0);
  });

  it('a piglet is never bagged; aimed at it costs its penalty, a stray one is free', () => {
    const s = setup();
    const p = s.sys.view().piglets[0];
    if (p === undefined) throw new Error('no piglet');
    s.sys.shot(1, [p.id], false, () => ({ x: p.x + 900, y: p.y }));
    expect(s.penalty()).toBe(0);
    const q = s.sys.view().piglets[1];
    if (q === undefined) throw new Error('no second piglet');
    s.sys.shot(2, [q.id], false, () => shapesOf(s.sys, q.id));
    expect(s.penalty()).toBe(-H.warthogs.pigletPenalty);
    expect(ofType(s.events, 'warthogBagged')).toHaveLength(0);
    expect(s.sys.view().warthogsBagged).toBe(0);
  });

  it('piglets never come in alone: each trails a mother that came in with it', () => {
    const s = setup();
    const v = s.sys.view();
    for (const p of v.piglets) expect(v.warthogs.some((w) => w.id === p.motherId)).toBe(true);
  });
});

describe('the crop meter (D-063)', () => {
  const d = H.crop.drainPerSecond;
  it('drains per eating animal per second', () => {
    expect(cropDrainPerTick(d, 0, 0, 0)).toBe(0);
    expect(cropDrainPerTick(d, 10, 2, 1) * 60).toBeCloseTo(
      10 * d.guineafowl + 2 * d.warthog + d.baboon,
    );
  });
  it('pays bonusPerPercent per whole percent saved', () => {
    expect(cropBonus(87.9, 5)).toBe(435);
    expect(cropBonus(-1, 5)).toBe(0);
  });
  it('ramps the warthog rate over the rush', () => {
    const k = H.rush.keyframes;
    expect(rushRate(k, 0)).toBe(k[0]?.warthogsPerMin);
    expect(rushRate(k, 1)).toBe(k[k.length - 1]?.warthogsPerMin);
    expect(rushRate(k, 0.75)).toBeGreaterThan(rushRate(k, 0.25));
  });
  it('a hunt left alone loses crop, and the crop never goes below 0', () => {
    const s = harvestSim(content, 5);
    const ev = runAll(s);
    const closed = ofType(ev, 'harvestFenceClosed')[0];
    expect(closed).toBeDefined();
    expect(closed?.crop).toBeLessThan(100);
    expect(closed?.crop).toBeGreaterThanOrEqual(0);
  });
});
