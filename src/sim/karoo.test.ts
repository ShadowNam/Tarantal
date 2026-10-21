// M4: the Karoo biome built from content — secrets, penalties, omen, the Generaal, crates,
// power-ups and crate weapons. Each test starts from a quiet copy of the real content (no flocks,
// fly-overs, pop-ups, events or crates; a spread-free gun) and turns on only what it checks.
import { describe, expect, it } from 'vitest';
import {
  base,
  quiet,
  karooOf,
  newSim,
  run,
  ofType,
  aimAt,
  secretOf,
  shootPart,
  shootBird,
  spawnsOf,
  waitForBird,
  settle,
  withMidFlock,
  eventEntry,
  onlyEvent,
  type Content,
} from '../../tools/simHarness';
import { WORLD_EVENT_HANDLERS } from './director/events';
import type { SimEvent } from './events';
import type { Sim } from './Sim';

describe('world-event handlers', () => {
  it('every world-event id has a handler (Tech §3.6)', () => {
    for (const handler of Object.values(WORLD_EVENT_HANDLERS)) expect(handler).toBeTruthy();
    expect(WORLD_EVENT_HANDLERS.kwevoel).toBe('perch');
    expect(WORLD_EVENT_HANDLERS.bossAppearance).toBe('boss');
    expect(WORLD_EVENT_HANDLERS.carAlarm).toBe('secretReward');
  });
});

describe('secrets (GDD §11.1)', () => {
  it('windpomp: the 4 spinning blades within the window → +100, reservoir flush of 12 birds', () => {
    const c = quiet();
    const sim = newSim(c);
    const angles: number[] = [];
    const all: SimEvent[] = [];
    for (const blade of ['blade_n', 'blade_e', 'blade_s', 'blade_w']) {
      angles.push(secretOf(sim, 'windpomp').angle);
      all.push(...shootPart(sim, c, 'windpomp', blade));
      all.push(...settle(sim));
    }
    expect(new Set(angles).size).toBe(4); // the rotor turns between shots
    expect(ofType(all, 'secretPartHit').map((e) => e.partsLeft)).toEqual([3, 2, 1]);
    expect(ofType(all, 'secretTriggered')).toMatchObject([{ propId: 'windpomp' }]);
    expect(ofType(all, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 100 }]);
    expect(ofType(all, 'worldEvent')).toMatchObject([{ event: 'reservoirFlush' }]);
    const spawned = ofType(all, 'flockSpawned');
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.size).toBe(12);
    // Bursts out at the reservoir (u 0.26 on the mid layer) and goes straight to FLUSH.
    expect(Math.abs((spawned[0]?.x ?? 0) - 0.26 * 3840)).toBeLessThan(200);
    expect(ofType(all, 'flockStateChanged')).toMatchObject([{ to: 'flush', cause: 'event' }]);
    // The burst is the reward: it can't also earn Whole Flock (D-021).
    expect(sim.snapshot().flocks.find((f) => f.id === spawned[0]?.flockId)?.eligible).toBe(false);
    expect(ofType(all, 'miss')).toEqual([]);
    expect(secretOf(sim, 'windpomp')).toMatchObject({ done: true, ready: false });
    expect(sim.result().secrets).toBe(1);
  });

  it('windpomp: the reservoir flush also flushes a flock near it', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c);
    const flockId = sim.snapshot().flocks[0]?.id;
    // Move the flock's area under the windpomp: use the real reservoir radius but a huge one here.
    const pomp = karooOf(c).props.find((p) => p.id === 'windpomp');
    if (pomp?.secret?.type !== 'multiHit' || pomp.secret.reward.reaction === undefined)
      throw new Error('windpomp');
    pomp.secret.reward.reaction.radiusPx = 5000;
    const sim2 = newSim(c);
    const all: SimEvent[] = [];
    for (const blade of ['blade_n', 'blade_e', 'blade_s', 'blade_w']) {
      all.push(...shootPart(sim2, c, 'windpomp', blade), ...settle(sim2));
    }
    expect(flockId).toBeDefined();
    const flushed = ofType(all, 'flockStateChanged').filter((e) => e.to === 'flush');
    expect(flushed.map((e) => e.flockId)).toContain(flockId);
  });

  it('windpomp: marks reset when the window runs out, so the last 3 blades alone do nothing', () => {
    const c = quiet();
    const sim = newSim(c);
    const first = shootPart(sim, c, 'windpomp', 'blade_n');
    expect(ofType(first, 'secretPartHit')).toHaveLength(1);
    expect(secretOf(sim, 'windpomp').windowTicks).toBeGreaterThan(0);
    const wait = run(sim, 8 * 60);
    expect(ofType(wait, 'secretReset')).toMatchObject([{ propId: 'windpomp' }]);
    expect(secretOf(sim, 'windpomp').parts.every((p) => !p.hit)).toBe(true);
    const all: SimEvent[] = [];
    for (const blade of ['blade_e', 'blade_s', 'blade_w']) {
      all.push(...shootPart(sim, c, 'windpomp', blade), ...settle(sim));
    }
    expect(ofType(all, 'secretTriggered')).toEqual([]);
    expect(ofType(all, 'secretPartHit').map((e) => e.partsLeft)).toEqual([3, 2, 1]);
  });

  it('bakkie spare wheel: car alarm flushes every flock (even out of view), +25, once', () => {
    const c = withMidFlock(quiet());
    const sim = newSim(c);
    const flockId = sim.snapshot().flocks[0]?.id;
    const ev = shootPart(sim, c, 'bakkie', 'spare_wheel');
    expect(ofType(ev, 'secretTriggered')).toMatchObject([{ propId: 'bakkie' }]);
    expect(ofType(ev, 'worldEvent')).toMatchObject([{ event: 'carAlarm' }]);
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 25, award: 25 }]);
    expect(ofType(ev, 'flockStateChanged')).toMatchObject([
      { flockId, to: 'flush', cause: 'event' },
    ]);
    // Spent: the wheel is no longer a target; the pellet stops on the bakkie itself.
    settle(sim);
    const again = run(sim, 1, aimAt(0.6, 0.78 * 3840 - 180, 690 - 40));
    expect(ofType(again, 'secretTriggered')).toEqual([]);
    expect(ofType(again, 'pelletImpact')[0]).toMatchObject({ propId: 'bakkie', partId: null });
    expect(sim.result().secrets).toBe(1);
  });

  it('potjie lid: +5 s bonus time once; the end and the Stampede move later', () => {
    const c = quiet();
    const sim = newSim(c);
    const before = sim.snapshot().durationTicks;
    const ev = shootPart(sim, c, 'potjie', 'lid');
    expect(ofType(ev, 'timeAdded')).toMatchObject([
      { ticks: 300, durationTicks: before + 300, stampedeAtTick: before + 300 - 15 * 60 },
    ]);
    expect(sim.snapshot().durationTicks).toBe(before + 300);
    expect(secretOf(sim, 'potjie').done).toBe(true);
    settle(sim);
    const again = run(sim, 1, aimAt(1.0, 0.12 * 5120, 930 - 40));
    expect(ofType(again, 'timeAdded')).toEqual([]);
    // The hunt really runs 95 s, and the Stampede starts 15 s before the new end.
    const rest = run(sim, 100 * 60);
    expect(ofType(rest, 'stampedeStarted')[0]?.tick).toBe(before + 300 - 15 * 60);
    expect(sim.result().ticks).toBe(before + 300);
  });

  it('fence bell: Meerkat Spotter for 8 s, again only after its 30 s cooldown', () => {
    const c = quiet();
    const sim = newSim(c);
    const ev = shootPart(sim, c, 'fence_bell', 'bell');
    expect(ofType(ev, 'powerupStarted')).toMatchObject([
      { powerup: 'meerkat_spotter', source: 'secret' },
    ]);
    expect(sim.snapshot().powerups).toMatchObject([{ id: 'meerkat_spotter', ticksLeft: 479 }]);
    expect(secretOf(sim, 'fence_bell')).toMatchObject({ ready: false, done: false });
    const later = run(sim, 8 * 60);
    expect(ofType(later, 'powerupEnded')).toMatchObject([{ powerup: 'meerkat_spotter' }]);
    const ready = run(sim, 22 * 60);
    expect(ofType(ready, 'secretReady')).toMatchObject([{ propId: 'fence_bell' }]);
    expect(ofType(shootPart(sim, c, 'fence_bell', 'bell'), 'secretTriggered')).toHaveLength(1);
    expect(sim.result().secrets).toBe(2);
  });

  it('secret chain: two secrets within 10 s → +50', () => {
    const c = quiet();
    const sim = newSim(c);
    const all = [...shootPart(sim, c, 'potjie', 'lid'), ...settle(sim)];
    all.push(...shootPart(sim, c, 'fence_bell', 'bell'));
    expect(ofType(all, 'bonusAwarded')).toMatchObject([{ bonus: 'secretChain', base: 50 }]);
  });

  it('a shot that only hits a secret part neither extends nor resets Frenzy, and is no Miss', () => {
    const c = quiet();
    // Fly-overs to build a streak of 2 first.
    for (const k of karooOf(c).pacing.keyframes) k.flyoversPerMin = 60;
    const sim = newSim(c);
    let streak = 0;
    for (let i = 0; i < 4000 && streak < 2; i++) {
      const bird = sim.snapshot().birds.find((b) => b.hittable && b.kind === 'target');
      if (bird === undefined) {
        run(sim, 1);
        continue;
      }
      if (sim.snapshot().weapon.shells === 0) run(sim, 60, [{ t: 'reload' }]);
      shootBird(sim, c, bird);
      streak = sim.snapshot().streak;
      settle(sim);
    }
    expect(streak).toBe(2);
    const ev = shootPart(sim, c, 'fence_bell', 'bell');
    expect(ofType(ev, 'secretTriggered')).toHaveLength(1);
    expect(ofType(ev, 'comboChanged')).toEqual([]);
    expect(ofType(ev, 'miss')).toEqual([]);
    expect(sim.snapshot().streak).toBe(2);
  });
});

describe('secrets come only from the biome JSON (M4 done-when)', () => {
  it('removing a secret from the JSON removes it from the game, with no code change', () => {
    const c = quiet();
    const potjie = karooOf(c).props.find((p) => p.id === 'potjie');
    if (potjie === undefined) throw new Error('potjie');
    delete potjie.secret;
    const sim = newSim(c);
    expect(sim.snapshot().secrets.map((s) => s.propId)).toEqual([
      'windpomp',
      'bakkie',
      'fence_bell',
    ]);
    const before = sim.snapshot().durationTicks;
    // Where the lid was (potjie u 0.12 on the near layer, lid 40 px above the prop's y).
    const ev = run(sim, 1, aimAt(1.0, 0.12 * 5120, 930 - 40));
    expect(ofType(ev, 'secretTriggered')).toEqual([]);
    expect(ofType(ev, 'timeAdded')).toEqual([]);
    expect(ofType(ev, 'miss')).toHaveLength(1);
    expect(sim.snapshot().durationTicks).toBe(before);
    // The other secrets still work.
    settle(sim);
    expect(ofType(shootPart(sim, c, 'bakkie', 'spare_wheel'), 'secretTriggered')).toHaveLength(1);
  });

  it('removing the whole prop removes its secret (and nothing else breaks)', () => {
    const c = quiet();
    karooOf(c).props = karooOf(c).props.filter((p) => p.id !== 'bakkie');
    // The boss perched on the bakkie: point it at the windpomp instead (content only).
    const sim = newSim(c);
    expect(sim.snapshot().secrets.map((s) => s.propId)).not.toContain('bakkie');
    const ev = run(sim, 1, aimAt(0.6, 0.78 * 3840 - 180, 690 - 40));
    expect(ofType(ev, 'worldEvent')).toEqual([]);
    expect(ofType(ev, 'pelletImpact')[0]).toMatchObject({ propId: null, partId: null });
  });

  it('a secret added to another prop in JSON works with no code change', () => {
    const c = quiet();
    const aloe = karooOf(c).props.find((p) => p.id === 'aloe_cluster_a');
    if (aloe === undefined) throw new Error('aloe');
    aloe.secret = {
      type: 'singleHit',
      part: { id: 'flower', shape: { type: 'ellipse', rx: 40, ry: 40, ox: 0, oy: -60 } },
      oncePerHunt: true,
      reward: { points: 40 },
    };
    const sim = newSim(c);
    const ev = shootPart(sim, c, 'aloe_cluster_a', 'flower');
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 40 }]);
  });
});

describe('penalties (GDD §7)', () => {
  it('kwêvoël flies to the windpomp perch, calls, and costs −35 when shot', () => {
    const c = onlyEvent(quiet(), 'kwevoel');
    const sim = newSim(c);
    const all = run(sim, 60);
    expect(ofType(all, 'worldEvent')).toMatchObject([{ event: 'kwevoel' }]);
    expect(spawnsOf(all, 'kwevoel')).toMatchObject([{ motion: 'perch' }]);
    let called: SimEvent[] = [];
    for (let i = 0; i < 20 * 60 && called.length === 0; i++) {
      called = ofType(run(sim, 1), 'birdCalled');
    }
    expect(called).toMatchObject([{ creature: 'kwevoel' }]);
    const bird = sim.snapshot().birds.find((b) => b.creature === 'kwevoel');
    // Perched at the windpomp's perch point (u 0.22 on mid, perch −150/−92 from the prop).
    expect(bird).toMatchObject({ phase: 'perch', x: 0.22 * 3840 - 150, y: 430 - 92 });
    if (bird === undefined) throw new Error('kwevoel');
    const ev = shootBird(sim, c, bird);
    expect(ofType(ev, 'penaltyApplied')).toMatchObject([{ creature: 'kwevoel', points: -35 }]);
    expect(sim.snapshot().score).toBe(-35);
    expect(sim.result().penalties).toBe(1);
  });

  it('kwêvoël leaves after its stay', () => {
    const c = onlyEvent(quiet(), 'kwevoel');
    const sim = newSim(c);
    const all = run(sim, 40 * 60);
    const id = spawnsOf(all, 'kwevoel')[0]?.birdId;
    expect(ofType(all, 'birdDespawned').filter((e) => e.birdId === id)).toMatchObject([
      { reason: 'exited' },
    ]);
  });

  it('crop sprayer costs −50', () => {
    const c = onlyEvent(quiet(), 'cropSprayer');
    const sim = newSim(c);
    const ev = shootBird(sim, c, waitForBird(sim, c, 'sproeier'));
    expect(ofType(ev, 'penaltyApplied')).toMatchObject([{ creature: 'sproeier', points: -50 }]);
  });

  it('hadeda alerts every flock on arrival and costs −25', () => {
    const c = onlyEvent(withMidFlock(quiet()), 'hadeda');
    const sim = newSim(c);
    const all = run(sim, 60);
    expect(ofType(all, 'flockThreatened')).toMatchObject([{ source: 'event' }]);
    expect(ofType(all, 'flockStateChanged')).toMatchObject([{ to: 'alert' }]);
    const ev = shootBird(sim, c, waitForBird(sim, c, 'hadeda'));
    expect(ofType(ev, 'penaltyApplied')).toMatchObject([{ creature: 'hadeda', points: -25 }]);
  });
});

describe('Karoo omen (wind, dust devils)', () => {
  it('wind blows only when the omen is on (Daily on, Classic off, mode override)', () => {
    const c = quiet();
    expect(newSim(c, { id: 'classic' }).snapshot().wind).toBeNull();
    expect(newSim(c, { id: 'daily' }).snapshot().wind).not.toBeNull();
    expect(newSim(c, { id: 'classic', omen: true }).snapshot().wind).not.toBeNull();
    const w = newSim(c, { id: 'daily' }).snapshot().wind;
    expect(w?.strength).toBeGreaterThanOrEqual(0.4);
    expect(w?.strength).toBeLessThanOrEqual(1);
  });

  it('wind changes within directionChangeSeconds', () => {
    const sim = newSim(quiet(), { id: 'daily' });
    const ev = run(sim, 21 * 60);
    expect(ofType(ev, 'windChanged').length).toBeGreaterThanOrEqual(1);
  });

  it('tailwind fly-overs cross faster than headwind ones', () => {
    const c = quiet();
    for (const k of karooOf(c).pacing.keyframes) k.flyoversPerMin = 60;
    c.birds.flyoverDefaults.bobPx = 0;
    const omen = karooOf(c).omen.wind;
    if (omen === undefined) throw new Error('wind');
    omen.strength = [1, 1];
    omen.directionChangeSeconds = [999, 999];
    const sim = newSim(c, { id: 'daily' });
    const dir = sim.snapshot().wind?.dir ?? 1;
    const speeds = new Map<number, number>();
    let prev = new Map(sim.snapshot().birds.map((b) => [b.id, b.x]));
    for (let i = 0; i < 600; i++) {
      run(sim, 1);
      const now = sim.snapshot().birds;
      for (const b of now) {
        const p = prev.get(b.id);
        if (p !== undefined && b.plane === 'mid') speeds.set(b.id, b.x - p);
      }
      prev = new Map(now.map((b) => [b.id, b.x]));
    }
    const tail = [...speeds.values()].filter((v) => Math.sign(v) === dir).map(Math.abs);
    const head = [...speeds.values()].filter((v) => Math.sign(v) === -dir).map(Math.abs);
    expect(tail.length).toBeGreaterThan(0);
    expect(head.length).toBeGreaterThan(0);
    // ×1.4 vs ×0.7 at full strength = 2× apart.
    expect(Math.min(...tail) / Math.max(...head)).toBeCloseTo(2, 1);
  });

  it('wind drifts far-plane pellets downwind, not near ones', () => {
    const c = quiet();
    const omen = karooOf(c).omen.wind;
    if (omen === undefined) throw new Error('wind');
    omen.strength = [1, 1];
    // A far-plane occluder to see where pellets land.
    karooOf(c).props.push({
      id: 'probe',
      layer: 'far_veld',
      u: 0.5,
      y: 600,
      asset: 'karoo/probe',
      occluder: { type: 'rect', w: 20, h: 200, ox: 0, oy: 0 },
    });
    const sf = 0.35;
    const x = 0.5 * (1920 + 3200 * sf);
    const calm = newSim(c, { id: 'classic' });
    const windy = newSim(c, { id: 'daily' });
    const dir = windy.snapshot().wind?.dir ?? 1;
    // Aim 18 px upwind (45 × 1.0 × dubbelloop 0.4 = 18 px drift): only the windy shot hits.
    const aim = aimAt(sf, x - dir * 18, 600);
    expect(ofType(run(calm, 1, aim), 'pelletImpact')[0]?.propId).toBeNull();
    expect(ofType(run(windy, 1, aim), 'pelletImpact')[0]?.propId).toBe('probe');
  });

  it('a dust devil flushes the flock it touches (once), only in omen hunts', () => {
    const c = onlyEvent(withMidFlock(quiet()), 'dustDevil');
    const devil = karooOf(c).events[0];
    if (devil === undefined) throw new Error('devil');
    devil.radiusPx = 5000; // touches the flock wherever it forages
    expect(ofType(run(newSim(c, { id: 'classic' }), 120), 'dustDevilSpawned')).toEqual([]);
    const sim = newSim(c, { id: 'daily' });
    const ev = run(sim, 120);
    expect(ofType(ev, 'dustDevilSpawned')).toHaveLength(1);
    const flushes = ofType(ev, 'flockStateChanged').filter((e) => e.to === 'flush');
    expect(flushes).toHaveLength(1);
    expect(sim.snapshot().dustDevils).toHaveLength(1);
    const later = run(sim, 15 * 60);
    expect(ofType(later, 'dustDevilEnded')).toHaveLength(1);
  });
});

describe('dust devil without flushOnContact', () => {
  it('only threatens the flock it touches (the JSON flag is honoured)', () => {
    const c = onlyEvent(withMidFlock(quiet()), 'dustDevil');
    const devil = karooOf(c).events[0];
    if (devil === undefined) throw new Error('devil');
    devil.radiusPx = 5000;
    devil.flushOnContact = false;
    const ev = run(newSim(c, { id: 'daily' }), 120);
    expect(ofType(ev, 'flockThreatened')).toMatchObject([{ source: 'event' }]);
    expect(ofType(ev, 'flockStateChanged')).toMatchObject([{ to: 'alert' }]);
  });
});

describe('Generaal Tarentaal (GDD §7 boss)', () => {
  it('appears at the bakkie; first hit knocks the pot (+25), he runs; second bags him', () => {
    const c = onlyEvent(quiet(), 'bossAppearance');
    const sim = newSim(c);
    const ev = run(sim, 60);
    expect(spawnsOf(ev, 'generaal')).toMatchObject([{ motion: 'boss' }]);
    let g = sim.snapshot().birds.find((b) => b.creature === 'generaal');
    if (g === undefined) throw new Error('generaal');
    expect(g.armored).toBe(true);
    expect(Math.abs(g.x - (0.78 * 3840 - 280))).toBeLessThanOrEqual(320);
    const first = shootBird(sim, c, g);
    expect(ofType(first, 'armorKnocked')).toHaveLength(1);
    expect(ofType(first, 'bonusAwarded')).toMatchObject([{ bonus: 'armor', base: 25 }]);
    g = sim.snapshot().birds.find((b) => b.creature === 'generaal');
    if (g === undefined) throw new Error('generaal gone');
    expect(g).toMatchObject({ armored: false, phase: 'run', behaviour: 'run' });
    settle(sim);
    g = sim.snapshot().birds.find((b) => b.creature === 'generaal');
    if (g === undefined) throw new Error('generaal gone');
    const second = shootBird(sim, c, g);
    // 100 base × (1 + run 0.5) = 150.
    expect(ofType(second, 'scoreAwarded')).toMatchObject([{ points: 100, award: 150 }]);
    expect(sim.snapshot().score).toBe(175);
  });

  it('appears once in Classic and never in a plain Season Run hunt', () => {
    const c = quiet();
    karooOf(c).events = [eventEntry('bossAppearance')];
    const classic = run(newSim(c, { id: 'classic' }), 90 * 60);
    expect(spawnsOf(classic, 'generaal')).toHaveLength(1);
    const season = run(
      newSim(c, { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'dubbelloop' }),
      60 * 60,
    );
    expect(spawnsOf(season, 'generaal')).toEqual([]);
  });

  it('flies off when his time is up', () => {
    const c = onlyEvent(quiet(), 'bossAppearance');
    const sim = newSim(c);
    const ev = run(sim, 30 * 60);
    const id = spawnsOf(ev, 'generaal')[0]?.birdId;
    expect(ofType(ev, 'birdDespawned').filter((e) => e.birdId === id)).toMatchObject([
      { reason: 'exited' },
    ]);
  });
});

/** Crates on, with a one-item table. */
function crateContent(item: string, type: 'powerup' | 'weapon' = 'powerup'): Content {
  const c = quiet();
  c.powerups.crates.perHunt = 1;
  c.powerups.crates.windows = [[0.01, 0.01]];
  c.powerups.crates.table = [{ id: item, weight: 1, type }];
  return c;
}

/** Runs until the crate drops, shoots it, returns the tick's events. */
function openCrate(sim: Sim, c: Content): SimEvent[] {
  const pre = run(sim, 60);
  expect(ofType(pre, 'crateSpawned')).toHaveLength(1);
  const crate = sim.snapshot().crates[0];
  if (crate === undefined) throw new Error('no crate');
  return run(sim, 1, aimAt(c.scoring.planes[crate.plane].scrollFactor, crate.x, crate.y));
}

describe('supply crates (GDD §8, §10.3–10.4)', () => {
  it('two per Classic and Daily hunt, inside their windows; none in a Season Run hunt', () => {
    const c = quiet();
    c.powerups.crates.perHunt = base.powerups.crates.perHunt;
    c.powerups.crates.windows = structuredClone<[number, number][]>(base.powerups.crates.windows);
    for (const mode of [{ id: 'classic' }, { id: 'daily' }] as const) {
      const ev = run(newSim(c, mode), 90 * 60);
      const ticks = ofType(ev, 'crateSpawned').map((e) => e.tick / (90 * 60));
      expect(ticks).toHaveLength(2);
      expect(ticks[0]).toBeGreaterThanOrEqual(0.22);
      expect(ticks[0]).toBeLessThanOrEqual(0.44);
      expect(ticks[1]).toBeGreaterThanOrEqual(0.55);
      expect(ticks[1]).toBeLessThanOrEqual(0.78);
    }
    const season = newSim(c, { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'dubbelloop' });
    expect(ofType(run(season, 60 * 60), 'crateSpawned')).toEqual([]);
  });

  it('a crate falls, lands, and is gone after lingering', () => {
    const c = crateContent('boeretroos');
    const sim = newSim(c);
    const ev = run(sim, 30 * 60);
    expect(ofType(ev, 'crateExpired')).toHaveLength(1);
    expect(sim.snapshot().crates).toEqual([]);
  });

  it('shooting a crate opens it; the shot leaves Frenzy alone and is no Miss', () => {
    const c = crateContent('boeretroos');
    const sim = newSim(c);
    const ev = openCrate(sim, c);
    expect(ofType(ev, 'crateOpened')).toMatchObject([{ item: 'boeretroos', itemType: 'powerup' }]);
    expect(ofType(ev, 'miss')).toEqual([]);
    expect(ofType(ev, 'comboChanged')).toEqual([]);
    expect(sim.result().crates).toBe(1);
  });

  it('Chilli Biltong: holding fire auto-fires with no shells used, for 8 s', () => {
    const c = crateContent('chilli_biltong');
    const sim = newSim(c);
    openCrate(sim, c);
    const shells = sim.snapshot().weapon.shells;
    expect(sim.snapshot().weapon).toMatchObject({ holdToFire: true, infinite: true });
    const ev = run(sim, 60, [{ t: 'fireHoldStart', dx: 0, sy: 100 }]);
    // 140 ms cooldown = 8 ticks: ~8 shots a second.
    expect(ofType(ev, 'shotFired').length).toBeGreaterThanOrEqual(7);
    expect(sim.snapshot().weapon.shells).toBe(shells);
    const end = run(sim, 8 * 60, [{ t: 'fireHoldEnd' }]);
    expect(ofType(end, 'powerupEnded')).toMatchObject([{ powerup: 'chilli_biltong' }]);
    expect(sim.snapshot().weapon.holdToFire).toBe(false);
  });

  it('Boeretroos: birds move at half speed for 10 s', () => {
    const c = crateContent('boeretroos');
    for (const k of karooOf(c).pacing.keyframes) k.flyoversPerMin = 60;
    c.birds.flyoverDefaults.bobPx = 0;
    const sim = newSim(c);
    openCrate(sim, c);
    const travelled = (ticks: number): number => {
      const before = new Map(sim.snapshot().birds.map((b) => [b.id, b.x]));
      run(sim, ticks);
      const d = sim.snapshot().birds.flatMap((b) => {
        const p = before.get(b.id);
        return p === undefined ? [] : [Math.abs(b.x - p)];
      });
      return Math.max(...d);
    };
    const slow = travelled(60);
    run(sim, 10 * 60);
    const fast = travelled(60);
    expect(slow / fast).toBeCloseTo(0.5, 1);
  });

  it('Bush Buckshot: spread ×2.5 for the next 6 shells', () => {
    const c = crateContent('bush_buckshot');
    const gun = c.weapons.weapons.find((w) => w.id === 'dubbelloop');
    if (gun === undefined) throw new Error('gun');
    gun.spreadPx = 40;
    const sim = newSim(c);
    openCrate(sim, c);
    settle(sim);
    expect(sim.snapshot().powerups).toMatchObject([{ id: 'bush_buckshot', shellsLeft: 6 }]);
    const width = (ev: SimEvent[]): number => {
      const xs = ofType(ev, 'pelletImpact').map((e) => e.dx);
      return Math.max(...xs) - Math.min(...xs);
    };
    const all: SimEvent[] = [];
    let wide = 0;
    for (let i = 0; i < 6; i++) {
      const ev = run(sim, 1, [{ t: 'fire', dx: 0, sy: 100 }]);
      wide = Math.max(wide, width(ev));
      all.push(...ev, ...settle(sim));
    }
    expect(ofType(all, 'powerupEnded')).toMatchObject([{ powerup: 'bush_buckshot' }]);
    run(sim, 60, [{ t: 'reload' }]);
    const narrow = width(run(sim, 1, [{ t: 'fire', dx: 0, sy: 100 }]));
    expect(wide).toBeGreaterThan(80);
    expect(narrow).toBeLessThanOrEqual(80);
  });

  it('Meerkat Spotter from a crate', () => {
    const c = crateContent('meerkat_spotter');
    const sim = newSim(c);
    expect(ofType(openCrate(sim, c), 'powerupStarted')).toMatchObject([
      { powerup: 'meerkat_spotter', source: 'crate' },
    ]);
  });

  it('Voorlaaier: 3 shots of 24 pellets with a 2.5 s ramrod reload, then back to the primary', () => {
    const c = crateContent('voorlaaier', 'weapon');
    const sim = newSim(c);
    const open = openCrate(sim, c);
    expect(ofType(open, 'weaponChanged')).toMatchObject([{ weapon: 'voorlaaier', kind: 'crate' }]);
    const belt = 7; // the shot that opened the crate used one shell
    const all: SimEvent[] = [];
    const first = run(sim, 1, [{ t: 'fire', dx: 0, sy: 100 }]);
    expect(ofType(first, 'pelletImpact')).toHaveLength(24);
    all.push(...first);
    // Blocked while the ramrod reload runs.
    all.push(...run(sim, 60, [{ t: 'fire', dx: 0, sy: 100 }]));
    expect(ofType(all, 'shotFired')).toHaveLength(1);
    all.push(...run(sim, 100), ...run(sim, 1, [{ t: 'fire', dx: 0, sy: 100 }]));
    all.push(...run(sim, 160), ...run(sim, 2, [{ t: 'fire', dx: 0, sy: 100 }]));
    expect(ofType(all, 'shotFired').map((e) => e.weapon)).toEqual([
      'voorlaaier',
      'voorlaaier',
      'voorlaaier',
    ]);
    expect(ofType(all, 'weaponChanged')).toMatchObject([{ weapon: 'dubbelloop', kind: 'primary' }]);
    expect(sim.snapshot().weapon).toMatchObject({ id: 'dubbelloop', shells: belt });
  });

  it('Mielie-Masjien: hold to spray every 70 ms for 10 s, then back to the primary', () => {
    const c = crateContent('mielie_masjien', 'weapon');
    const sim = newSim(c);
    openCrate(sim, c);
    expect(sim.snapshot().weapon).toMatchObject({
      id: 'mielie_masjien',
      kind: 'crate',
      holdToFire: true,
      infinite: true,
    });
    const ev = run(sim, 60, [{ t: 'fireHoldStart', dx: 0, sy: 100 }]);
    // 70 ms = 4 ticks → 15 shots a second.
    expect(ofType(ev, 'shotFired').length).toBe(15);
    run(sim, 1, [{ t: 'fireHoldMove', dx: 200, sy: 300 }]);
    const moved = run(sim, 8);
    expect(ofType(moved, 'shotFired').every((e) => e.dx === 200 && e.sy === 300)).toBe(true);
    const stop = run(sim, 30, [{ t: 'fireHoldEnd' }]);
    expect(ofType(stop, 'shotFired')).toEqual([]);
    const rest = run(sim, 10 * 60);
    expect(ofType(rest, 'weaponChanged')).toMatchObject([{ weapon: 'dubbelloop' }]);
  });
});
