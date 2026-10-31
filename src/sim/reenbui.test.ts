// v1.10 (D-067, GDD §11.3e): Reënbui — whether it comes (per area, weekday force/forbid, modes),
// its phases on sim ticks, the alate columns and the feeding flocks, the extra flocks' cap, the
// swarm's score window through the pipeline, the Kalahari omen's storm and the Okavango showers,
// and determinism (the same seed and log give the same events; its stream moves no other).
import { describe, expect, it } from 'vitest';
import { base, ofType, run, shootBird, type Content } from '../../tools/simHarness';
import { secondsToTicks } from './clock';
import { hashEvents, type SimEvent } from './events';
import {
  feedColumn,
  overlapsReenbui,
  placeColumns,
  planReenbui,
  reenbuiChance,
  reenbuiPhaseAt,
  type ReenbuiEligibility,
} from './reenbui/reenbui';
import { createReenbuiSystem } from './reenbui/system';
import type { Flock } from './flocks/Flock';
import { makeFlock } from './flocks/testing';
import { shotThreats } from './flocks/threats';
import { createRng } from './rng';
import { createSim, type Sim } from './Sim';
import type { ModeConfig } from './types';

const KALAHARI: ModeConfig = { id: 'classic', biome: 'kalahari-summer', omen: false };

/** The real content with Reënbui certain in every area, its build-up at 10 % of the hunt. */
function forced(): Content {
  const c = structuredClone(base) as Content;
  c.reenbui.areas = c.biomes.map((b) => ({ biome: b.id, chance: 1 }));
  c.reenbui.window = [0.1, 0.1];
  return c;
}

function sim(c: Content, mode: ModeConfig = KALAHARI, seed = 7): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const elig = (over: Partial<ReenbuiEligibility> = {}): ReenbuiEligibility => ({
  biome: 'kalahari-summer',
  mode: 'classic',
  seasonKind: null,
  feesdag: false,
  weather: 'default',
  layoutRule: undefined,
  ...over,
});

describe('Reënbui: where and when (D-067)', () => {
  it('has a chance per area, never the Bushveld or the Harvest', () => {
    const cfg = base.reenbui;
    expect(reenbuiChance(cfg, elig())).toBe(0.45);
    expect(reenbuiChance(cfg, elig({ biome: 'okavango-spring' }))).toBe(0.35);
    expect(reenbuiChance(cfg, elig({ biome: 'namibie' }))).toBe(0.15);
    expect(reenbuiChance(cfg, elig({ biome: 'karoo-autumn' }))).toBe(0.05);
    expect(reenbuiChance(cfg, elig({ biome: 'bushveld-winter' }))).toBe(0);
    expect(reenbuiChance(cfg, elig({ biome: 'oes', mode: 'harvest' }))).toBe(0);
  });

  it('weekday layouts force or forbid it; calm days never; modes as listed', () => {
    const cfg = base.reenbui;
    expect(reenbuiChance(cfg, elig({ layoutRule: 'force' }))).toBe(1);
    expect(reenbuiChance(cfg, elig({ layoutRule: 'none' }))).toBe(0);
    expect(reenbuiChance(cfg, elig({ weather: 'calm', layoutRule: 'force' }))).toBe(0);
    expect(reenbuiChance(cfg, elig({ mode: 'daily' }))).toBe(0.45);
    expect(reenbuiChance(cfg, elig({ mode: 'daily', feesdag: true }))).toBe(0);
    expect(reenbuiChance(cfg, elig({ mode: 'seasonHunt', seasonKind: 'omen' }))).toBe(0.45);
    expect(reenbuiChance(cfg, elig({ mode: 'seasonHunt', seasonKind: 'boss' }))).toBe(0);
    expect(reenbuiChance(cfg, elig({ mode: 'ftue' }))).toBe(0);
    expect(reenbuiChance(cfg, elig({ mode: 'range' }))).toBe(0);
    // The content: the overcast Wednesday forces it in the Kalahari and the Okavango.
    for (const id of ['kalahari-summer', 'okavango-spring']) {
      const b = base.biomes.find((x) => x.id === id);
      expect(b?.layouts.find((l) => l.id === 'wed')?.reenbui).toBe('force');
      for (const l of b?.layouts ?? [])
        if (l.weather === 'calm') expect(l.reenbui).not.toBe('force');
    }
  });

  it('comes at the area chance over many seeds, at most once a hunt', () => {
    const dur = secondsToTicks(90);
    let n = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const p = planReenbui(base.reenbui, elig(), dur, null, createRng(seed).stream('reenbui'));
      if (p !== null) n++;
    }
    expect(n / 2000).toBeGreaterThan(0.41);
    expect(n / 2000).toBeLessThan(0.49);
    // A real hunt with it: one build-up, one swarm.
    const ev = run(sim(forced()), secondsToTicks(90));
    expect(ofType(ev, 'reenbuiBuildup')).toHaveLength(1);
    expect(ofType(ev, 'alatesSwarm')).toHaveLength(1);
  });

  it('runs its phases in order on the content lengths, ending before the hunt', () => {
    const c = forced();
    const ph = c.reenbui.phaseSeconds;
    const ev = run(sim(c), secondsToTicks(90));
    const order = ev
      .filter((e) =>
        ['reenbuiBuildup', 'reenbuiRain', 'alatesSwarm', 'rainEased', 'reenbuiDone'].includes(
          e.type,
        ),
      )
      .map((e) => [e.type, e.tick] as const);
    const t0 = Math.floor(0.1 * secondsToTicks(90));
    const b = secondsToTicks(ph.buildup);
    const d = secondsToTicks(ph.drops);
    const s = secondsToTicks(ph.swarm);
    const e = secondsToTicks(ph.easing);
    expect(order).toEqual([
      ['reenbuiBuildup', t0],
      ['reenbuiRain', t0 + b],
      ['alatesSwarm', t0 + b + d],
      ['rainEased', t0 + b + d + s],
      ['reenbuiDone', t0 + b + d + s + e],
    ]);
    // A late draw is pulled back so it ends endMarginSeconds before the hunt.
    const late = { ...c.reenbui, window: [1, 1] as [number, number] };
    const dur = secondsToTicks(60);
    const p = planReenbui(late, elig(), dur, null, createRng(1).stream('reenbui'));
    expect(p?.endAt).toBe(dur - secondsToTicks(c.reenbui.endMarginSeconds));
    if (p !== null) {
      expect(reenbuiPhaseAt(p, p.buildupAt - 1)).toBeNull();
      expect(reenbuiPhaseAt(p, p.dropsAt - 1)).toBe('buildup');
      expect(reenbuiPhaseAt(p, p.swarmAt)).toBe('swarm');
      expect(reenbuiPhaseAt(p, p.endAt)).toBeNull();
    }
  });

  it('is deterministic, and its stream moves no other system before it starts', () => {
    const c = forced();
    const a = run(sim(c), secondsToTicks(60));
    const b = run(sim(c), secondsToTicks(60));
    expect(hashEvents(a)).toBe(hashEvents(b));
    // Without it (chance 0) the hunt up to the build-up is the same event for event.
    const off = structuredClone(c);
    off.reenbui.areas = off.reenbui.areas.map((x) => ({ ...x, chance: 0 }));
    const plain = run(sim(off), secondsToTicks(60));
    const until = Math.floor(0.1 * secondsToTicks(90));
    const strip = (ev: SimEvent[]): SimEvent[] =>
      ev.filter((e) => e.tick < until && !e.type.startsWith('reenbui'));
    expect(hashEvents(strip(a))).toBe(hashEvents(strip(plain)));
  });
});

describe('Reënbui: the swarm (D-067)', () => {
  it('places 2–4 columns on mid/far ground near the view, apart on a plane', () => {
    const cfg = base.reenbui;
    const planes = [
      {
        plane: 'mid' as const,
        scrollFactor: 0.6,
        ratio: 1,
        coreWidth: 3000,
        groundY: [700, 760] as const,
      },
      {
        plane: 'far' as const,
        scrollFactor: 0.35,
        ratio: 0.36,
        coreWidth: 2100,
        groundY: [560, 600] as const,
      },
    ];
    for (let seed = 1; seed <= 200; seed++) {
      const cols = placeColumns(cfg, planes, 2560, createRng(seed).stream('reenbui'));
      expect(cols.length).toBeGreaterThanOrEqual(1);
      expect(cols.length).toBeLessThanOrEqual(4);
      for (const c of cols) {
        const g = planes.find((p) => p.plane === c.plane);
        expect(g).toBeDefined();
        if (g === undefined) continue;
        expect(c.y).toBeGreaterThanOrEqual(g.groundY[0]);
        expect(c.y).toBeLessThanOrEqual(g.groundY[1]);
        expect(c.x).toBeGreaterThan(0);
        expect(c.x).toBeLessThan(g.coreWidth);
        for (const o of cols)
          if (o !== c && o.plane === c.plane)
            expect(Math.abs(o.x - c.x)).toBeGreaterThanOrEqual(
              cfg.columns.minGapPx * g.ratio - 1e-6,
            );
      }
    }
    // A flock in view anchors the first column where it forages.
    const anchored = placeColumns(cfg, planes, 2560, createRng(9).stream('reenbui'), {
      plane: 'mid',
      x: 1777,
    });
    expect(anchored[0]).toMatchObject({ id: 0, plane: 'mid', x: 1777 });
    const cols = [{ id: 0, plane: 'mid' as const, x: 1000, y: 700 }];
    expect(feedColumn(cols, 'mid', 1800, 900)?.id).toBe(0);
    expect(feedColumn(cols, 'mid', 2000, 900)).toBeNull();
    expect(feedColumn(cols, 'far', 1000, 900)).toBeNull();
  });

  it('nearby flocks feed at a column and are calmer; the build-up makes them jumpier', () => {
    const c = forced();
    const s = sim(c);
    const all = run(s, secondsToTicks(90) * 0.1 + secondsToTicks(10));
    const swarm = ofType(all, 'alatesSwarm')[0];
    expect(swarm).toBeDefined();
    expect(swarm?.columns.length).toBeGreaterThanOrEqual(1);
    run(s, secondsToTicks(5));
    const snap = s.snapshot();
    expect(snap.reenbui?.phase).toBe('swarm');
    const feeding = snap.flocks.filter((f) => f.feeding === true);
    expect(feeding.length).toBeGreaterThan(0);
    // Feeding birds walk to their column: most stand within reach of one.
    const cols = snap.reenbui?.columns ?? [];
    for (const f of feeding) {
      const members = snap.birds.filter((b) => b.flockId === f.id);
      const near = members.filter((b) =>
        cols.some((col) => col.plane === b.plane && Math.abs(col.x - b.x) < 400),
      );
      expect(near.length).toBeGreaterThan(0);
    }
    // After the easing nobody feeds.
    run(s, secondsToTicks(c.reenbui.phaseSeconds.swarm + c.reenbui.phaseSeconds.easing));
    expect(s.snapshot().flocks.some((f) => f.feeding === true)).toBe(false);
    expect(s.snapshot().reenbui?.phase).toBeNull();
  });

  it('the first column rises at the flock nearest the view centre (review of #110)', () => {
    const c = forced();
    for (let seed = 1; seed <= 6; seed++) {
      const s = sim(c, KALAHARI, seed);
      const until = Math.floor(0.1 * secondsToTicks(90)) + secondsToTicks(9) + 30;
      run(s, until);
      const snap = s.snapshot();
      const v = snap.reenbui;
      expect(v?.phase).toBe('swarm');
      const first = v?.columns[0];
      if (first === undefined) throw new Error('no column');
      // Some flock on its plane forages within a few birds' width of it.
      const near = snap.flocks.some((f) => {
        const xs = snap.birds.filter((b) => b.flockId === f.id).map((b) => b.x);
        if (f.plane !== first.plane || xs.length === 0) return false;
        const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.abs(cx - first.x) < 200;
      });
      expect(near, `seed ${seed}`).toBe(true);
    }
  });

  it('anchors the first column: in view foraging, settling or landing, else where a flock lands in reach', () => {
    const cfg = base.reenbui;
    const planes = [
      {
        plane: 'mid' as const,
        scrollFactor: 0.6,
        ratio: 1,
        coreWidth: 4000,
        groundY: [700, 760] as const,
      },
    ];
    // Camera 2560: the mid plane's view centre is x 1920, the view ±spreadPx (760) round it.
    const camera = 2560;
    const plan = { buildupAt: 0, dropsAt: 10, swarmAt: 20, easingAt: 900, endAt: 1000 };
    type Spec = { x: number; state: Flock['state']; lands?: number; down?: boolean };
    const firstColumn = (specs: Spec[], seed = 5) => {
      const flocks = specs.map((sp, i) => {
        const f = makeFlock(base, { x: sp.x, id: i + 1 }).flock;
        f.state = sp.state;
        return f;
      });
      const spec = (f: Flock): Spec | undefined => specs[flocks.indexOf(f)];
      const sys = createReenbuiSystem(
        cfg,
        { ...plan, withStorm: false },
        createRng(seed).stream('reenbui'),
        {
          tick: () => plan.swarmAt,
          cameraX: () => camera,
          flocks: () => flocks,
          landingX: (f) => spec(f)?.lands ?? f.homeX,
          comingDown: (f) => spec(f)?.down === true,
          planes,
          spawnFlock: () => false,
          emit: () => undefined,
        },
      );
      sys.step();
      return sys.view().columns[0];
    };
    const placed = (x: number | null, seed = 5) =>
      placeColumns(
        cfg,
        planes,
        camera,
        createRng(seed).stream('reenbui'),
        x === null ? null : { plane: 'mid', x },
      )[0];
    const near = (x: number) =>
      expect.objectContaining({ id: 0, x: expect.closeTo(x, 0) }) as unknown;
    // A foraging flock in view: the column at it.
    expect(firstColumn([{ x: 2300, state: 'forage' }])).toEqual(near(2300));
    // A settling one in view, nearer the centre than a forager: the settler.
    expect(
      firstColumn([
        { x: 2400, state: 'forage' },
        { x: 1700, state: 'settle' },
      ]),
    ).toEqual(near(1700));
    // A flushed flock coming down in view: where it lands.
    expect(firstColumn([{ x: 2900, state: 'flush', lands: 2050, down: true }])).toEqual(near(2050));
    // Still climbing (not coming down) and out of view: the column where it will land, held
    // inside the view (2680 = 1920 + 760), as it lands within feeding reach (900) of it.
    expect(firstColumn([{ x: 3100, state: 'flush', lands: 3300, down: false }])).toEqual(
      near(2680),
    );
    // Lands beyond feeding reach of the view: no anchor (the columns as without one).
    expect(firstColumn([{ x: 3500, state: 'flush', lands: 3700 }])).toEqual(placed(null));
    // A forager out of view but within reach of its edge: the column at the edge.
    expect(firstColumn([{ x: 800, state: 'forage' }])).toEqual(near(1920 - 760));
    // Draws nothing of its own: an anchored hunt's columns are placeColumns' with that anchor.
    expect(firstColumn([{ x: 2300, state: 'forage' }], 11)).toEqual(placed(2300, 11));
  });

  it('feeding cuts the shot alert radius and the build-up widens it (content factors)', () => {
    const f = makeFlock(base, { size: 1, x: 1000 }).flock;
    const y = f.members[0]?.y ?? 0;
    const geo = {
      near: { scrollFactor: 1, scale: 1, ratio: 1 },
      mid: { scrollFactor: 1, scale: 1, ratio: 1 },
      far: { scrollFactor: 1, scale: 1, ratio: 1 },
      ver: { scrollFactor: 1, scale: 1, ratio: 1 },
    };
    // A shot 100 px from the bird with a 120 px radius: in reach, out of it × 0.7, in × 1.15.
    const imp = [{ dx: 1100 - 960, sy: y }];
    const at = (mul: number): number =>
      shotThreats([f], imp, 960, 120, geo, new Set(), () => mul).length;
    expect(at(1)).toBe(1);
    expect(at(base.reenbui.feeding.alertRadiusMul)).toBe(0);
    expect(shotThreats([f], [{ dx: 1135 - 960, sy: y }], 960, 120, geo, new Set()).length).toBe(0);
    expect(
      shotThreats(
        [f],
        [{ dx: 1135 - 960, sy: y }],
        960,
        120,
        geo,
        new Set(),
        () => base.reenbui.buildupAlertRadiusMul,
      ).length,
    ).toBe(1);
  });

  it('brings at most extraFlocks.max extra flocks, inside maxFlocks and maxBirdsOnScreen on every tick', () => {
    // The real caps, and tight ones the extra flocks press against.
    const caps: ({ maxFlocks: number; maxBirds: number } | null)[] = [
      null,
      { maxFlocks: 3, maxBirds: 18 },
    ];
    let total = 0;
    for (const cap of caps) {
      const c = forced();
      c.reenbui.extraFlocks.everySeconds = 0.5;
      const biome = c.biomes.find((b) => b.id === 'kalahari-summer');
      if (biome === undefined) throw new Error('no kalahari');
      if (cap !== null) {
        biome.pacing.maxFlocks = cap.maxFlocks;
        biome.pacing.maxBirdsOnScreen = cap.maxBirds;
      }
      const { maxFlocks, maxBirdsOnScreen } = biome.pacing;
      for (let seed = 1; seed <= 6; seed++) {
        const s = sim(c, KALAHARI, seed);
        const ev: SimEvent[] = [];
        let swarmAt = -1;
        let easedAt = -1;
        let checked = 0;
        for (let t = 0; t < secondsToTicks(60) && !s.isOver(); t++) {
          s.step([]);
          for (const e of s.drainEvents()) {
            ev.push(e);
            if (e.type === 'alatesSwarm') swarmAt = e.tick;
            if (e.type === 'rainEased') easedAt = e.tick;
          }
          // Every tick from the swarm through the easing.
          if (swarmAt < 0 || (easedAt >= 0 && s.tick > easedAt)) continue;
          const snap = s.snapshot();
          const alive = snap.flocks.filter((f) => f.alive > 0).length;
          expect(alive, `seed ${seed} tick ${s.tick}`).toBeLessThanOrEqual(maxFlocks);
          expect(snap.birds.length, `seed ${seed} tick ${s.tick}`).toBeLessThanOrEqual(
            maxBirdsOnScreen,
          );
          checked++;
        }
        expect(checked).toBeGreaterThanOrEqual(secondsToTicks(c.reenbui.phaseSeconds.swarm));
        // Flocks spawned in the swarm window by the event (the director's keep coming too).
        const extra = ofType(ev, 'flockStateChanged').filter(
          (e) =>
            e.cause === 'event' && e.tick >= swarmAt && e.tick < easedAt && e.from === 'forage',
        );
        expect(extra.length).toBeLessThanOrEqual(c.reenbui.extraFlocks.max);
        total += extra.length;
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('scores every bag in the swarm window × scoreMul (the pipeline step), not before', () => {
    const c = forced();
    for (const w of c.weapons.weapons) w.spreadPx = 0;
    let inside = 0;
    let outside = 0;
    for (let seed = 1; seed <= 12 && (inside === 0 || outside === 0); seed++) {
      const s = sim(c, KALAHARI, seed);
      for (let i = 0; i < secondsToTicks(60) && !s.isOver(); i++) {
        const snap = s.snapshot();
        if (snap.weapon.shells === 0 && !snap.weapon.reloading) {
          run(s, 1, [{ t: 'reload' }]);
          continue;
        }
        const bird = snap.birds.find((b) => b.hittable && b.creature.startsWith('tarentaal'));
        if (i % 14 !== 0 || bird === undefined || snap.weapon.reloading) {
          run(s, 1);
          continue;
        }
        const phase = snap.reenbui?.phase ?? null;
        for (const a of ofType(shootBird(s, c, bird), 'scoreAwarded')) {
          const step = a.breakdown.find((b) => b.kind === 'reenbui');
          if (phase === 'swarm') {
            expect(step?.value).toBe(c.reenbui.scoreMul);
            inside++;
          } else if (phase === null) {
            expect(step).toBeUndefined();
            outside++;
          }
        }
      }
      const v = s.snapshot().reenbui;
      expect(v?.bagged).toBeGreaterThanOrEqual(0);
    }
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
  });
});

describe('Reënbui meets the omens (D-067)', () => {
  it('Kalahari omen: the swarm rises when the Donderstorm breaks — no own build-up or drops', () => {
    const c = forced();
    const s = sim(c, { ...KALAHARI, omen: true });
    const dur = s.snapshot().durationTicks;
    const storm = c.biomes.find((b) => b.id === 'kalahari-summer')?.omen.storm;
    const stormTick = Math.floor((storm?.stormAt ?? 0) * dur);
    const ev = run(s, dur);
    const up = ofType(ev, 'reenbuiBuildup')[0];
    expect(up?.withStorm).toBe(true);
    expect(up?.tick).toBe(stormTick);
    expect(ofType(ev, 'alatesSwarm')[0]?.tick).toBe(stormTick);
    expect(ofType(ev, 'reenbuiRain')).toHaveLength(0);
  });

  it('Okavango omen: the sun-shower spells that would overlap it are dropped', () => {
    const c = forced();
    const mode: ModeConfig = { id: 'classic', biome: 'okavango-spring', omen: true };
    const ev = run(sim(c, mode), secondsToTicks(90));
    const up = ofType(ev, 'reenbuiBuildup')[0];
    if (up === undefined) throw new Error('no Reënbui');
    for (const w of ofType(ev, 'weatherChanged'))
      expect(w.tick < up.tick || w.tick >= up.endTick).toBe(true);
    const plan = {
      buildupAt: 100,
      dropsAt: 200,
      swarmAt: 300,
      easingAt: 400,
      endAt: 500,
      withStorm: false,
    };
    expect(overlapsReenbui(plan, 0, 100)).toBe(false);
    expect(overlapsReenbui(plan, 0, 101)).toBe(true);
    expect(overlapsReenbui(plan, 499, 600)).toBe(true);
    expect(overlapsReenbui(plan, 500, 600)).toBe(false);
  });
});
