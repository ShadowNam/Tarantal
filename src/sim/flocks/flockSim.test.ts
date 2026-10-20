// Flocks inside the full sim: warm-up spawns, the escalation chain driven by real shots, misses
// as threats, behaviour multipliers, Whole Flock, hadeda, Vuvuzela, Stampede and pacing.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { ContentBundle } from '../../content/schemas';
import { planeCentreX, planeToDx } from '../camera';
import type { SimEvent } from '../events';
import { createSim, type Sim } from '../Sim';
import type { BirdView, Command, ModeConfig } from '../types';
import { CAMERA_MAX_X, CAMERA_MIN_X, MAX_HALF_VIEW_WIDTH } from '../world';

const base = loadContent();

/** Flocks only: no fly-overs, pop-ups or world events unless a test adds them. */
function flockContent(edit: (c: ContentBundle) => void = () => undefined): ContentBundle {
  const c = structuredClone(base);
  for (const b of c.biomes) {
    for (const k of b.pacing.keyframes) {
      k.flyoversPerMin = 0;
      k.popupsPerMin = 0;
    }
    b.pacing.stampede.flyoversPerMin = 0;
    b.pacing.stampede.popupsPerMin = 0;
    b.events = [];
  }
  edit(c);
  return c;
}

function newSim(c: ContentBundle, seed = 5, mode: ModeConfig = { id: 'classic' }): Sim {
  const sim = createSim({ seed, content: c, mode, inputKind: 'pointer' });
  sim.drainEvents();
  return sim;
}

function step(sim: Sim, cmds: readonly Command[] = []): SimEvent[] {
  sim.step(cmds);
  return [...sim.drainEvents()];
}

function wait(sim: Sim, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...step(sim));
  return out;
}

function shootAt(c: ContentBundle, bird: BirdView, offsetDx = 0): Command[] {
  const plane = c.scoring.planes[bird.plane];
  const f = plane.scrollFactor;
  const cx =
    Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (bird.x - 960) / f + 960)) * 2) / 2;
  const creature = c.birds.creatures.find((x) => x.id === bird.creature);
  const body = creature && 'hitbox' in creature ? creature.hitbox.body : { ox: 0, oy: 0 };
  return [
    { t: 'cameraTarget', cx },
    {
      t: 'fire',
      dx: planeToDx(cx, f, bird.x + body.ox * plane.scale * bird.facing) + offsetDx,
      sy: bird.y + body.oy * plane.scale,
    },
  ];
}

const COOLDOWN = 10;

function midFlock(sim: Sim) {
  const f = sim.snapshot().flocks.find((x) => x.plane === 'mid');
  if (f === undefined) throw new Error('no mid flock');
  return f;
}
function membersOf(sim: Sim, flockId: number): BirdView[] {
  return sim.snapshot().birds.filter((b) => b.flockId === flockId);
}
const stateChanges = (ev: readonly SimEvent[]) =>
  ev.flatMap((e) => (e.type === 'flockStateChanged' ? [`${e.from}>${e.to}:${e.cause}`] : []));

describe('flocks in the sim', () => {
  it('warm-up: the first snapshot already has foraging flocks in view (GDD §8)', () => {
    const c = flockContent();
    const sim = createSim({ seed: 3, content: c, mode: { id: 'classic' }, inputKind: 'pointer' });
    const s = sim.snapshot();
    const k0 = c.biomes[0]?.pacing.keyframes[0]?.flocks ?? {};
    expect(s.flocks.filter((f) => f.plane === 'mid')).toHaveLength(k0.mid ?? 0);
    expect(s.flocks.filter((f) => f.plane === 'far')).toHaveLength(k0.far ?? 0);
    const d = c.birds.flockDefaults;
    for (const f of s.flocks) {
      expect(f.state).toBe('forage');
      expect(f.spawnSize).toBeGreaterThanOrEqual(d.sizeMin);
      expect(f.spawnSize).toBeLessThanOrEqual(d.sizeMax);
      const sf = c.scoring.planes[f.plane].scrollFactor;
      const centre = planeCentreX(s.cameraX, sf);
      for (const b of membersOf(sim, f.id)) {
        expect(Math.abs(b.x - centre)).toBeLessThan(960);
        expect(b.motion).toBe('flock');
        expect(b.behaviour).toBe('forage');
      }
    }
    expect(sim.drainEvents().filter((e) => e.type === 'flockSpawned')).toHaveLength(
      s.flocks.length,
    );
  });

  it('three quick shots: forage → alert → run → flush; bags score +0 / +0 / +0.5', () => {
    const c = flockContent();
    const sim = newSim(c);
    const flock = midFlock(sim);
    const seen: SimEvent[] = [];
    const shots: SimEvent[][] = [];
    for (let i = 0; i < 3; i++) {
      const target = membersOf(sim, flock.id)[0];
      if (!target) throw new Error('flock gone');
      const ev = step(sim, shootAt(c, target));
      shots.push(ev);
      seen.push(...ev, ...wait(sim, COOLDOWN));
    }
    const mine = seen.filter((e) => !('flockId' in e) || e.flockId === flock.id);
    expect(stateChanges(mine).slice(0, 3)).toEqual([
      'forage>alert:threat',
      'alert>run:threat',
      'run>flush:threat',
    ]);
    // Each shot's bags score at the behaviour the birds had before that shot.
    const behaviours = shots.map((ev) => [
      ...new Set(ev.flatMap((e) => (e.type === 'targetBagged' ? [e.behaviour] : []))),
    ]);
    expect(behaviours).toEqual([['forage'], ['alert'], ['run']]);
    const third = shots[2]?.find((e) => e.type === 'scoreAwarded');
    expect(third?.type === 'scoreAwarded' && third.breakdown[1]).toMatchObject({
      kind: 'behaviour',
      value: 0.5,
    });
    expect(sim.result().flushes).toBeGreaterThanOrEqual(1);
  });

  it('a wing shot on a flushed mid bird pays 10 × (1 + 1.0)', () => {
    const c = flockContent();
    const sim = newSim(c);
    const flock = midFlock(sim);
    step(sim, [{ t: 'gadget' }]);
    for (let i = 0; i < 400; i++) {
      const flyer = membersOf(sim, flock.id).find((b) => b.phase === 'flap' && b.y < 600);
      if (flyer) {
        const ev = step(sim, shootAt(c, flyer));
        const bag = ev.find((e) => e.type === 'targetBagged');
        expect(bag).toMatchObject({ behaviour: 'flying' });
        expect(ev.find((e) => e.type === 'scoreAwarded')).toMatchObject({ points: 10, mult: 2 });
        return;
      }
      step(sim);
    }
    throw new Error('no flyer');
  });

  it('a miss near a flock is a threat too (hit or miss, GDD §6.1)', () => {
    const c = flockContent();
    const sim = newSim(c);
    const flock = midFlock(sim);
    const b = membersOf(sim, flock.id)[0];
    if (!b) throw new Error('empty');
    // 200 screen px beside a member: inside 260, but clear of every hitbox.
    const ev = step(sim, shootAt(c, b, -400));
    expect(ev.some((e) => e.type === 'targetBagged')).toBe(false);
    const threatened = ev.filter((e) => e.type === 'flockThreatened' && e.flockId === flock.id);
    if (threatened.length === 0) {
      // Nearest member is further than the radius from that point; aim closer.
      const ev2 = (wait(sim, COOLDOWN), step(sim, shootAt(c, b, -200)));
      expect(ev2.some((e) => e.type === 'targetBagged')).toBe(false);
      expect(
        ev2.filter((e) => e.type === 'flockThreatened' && e.flockId === flock.id),
      ).toHaveLength(1);
    } else {
      expect(threatened).toEqual([expect.objectContaining({ flockId: flock.id, source: 'shot' })]);
    }
    expect(midFlock(sim).state).toBe('alert');
  });

  it('a shot far from every flock threatens none', () => {
    const c = flockContent();
    const sim = newSim(c);
    const ev = step(sim, [
      { t: 'fire', dx: 0, sy: 40 },
      { t: 'cameraTarget', cx: CAMERA_MIN_X },
    ]);
    expect(ev.some((e) => e.type === 'flockThreatened')).toBe(false);
  });

  it('Whole Flock: bagging all 5 before they calm down pays perBird each (GDD §6.4)', () => {
    const c = flockContent((x) => {
      x.birds.flockDefaults.sizeMin = 5;
      x.birds.flockDefaults.sizeMax = 5;
    });
    const sim = newSim(c, 9);
    const flock = midFlock(sim);
    expect(flock.spawnSize).toBe(5);
    const seen: SimEvent[] = [];
    for (let i = 0; i < 40 && membersOf(sim, flock.id).length > 0; i++) {
      const target = membersOf(sim, flock.id).find((b) => b.hittable);
      if (target) seen.push(...step(sim, shootAt(c, target)));
      seen.push(...wait(sim, COOLDOWN));
    }
    const wiped = seen.find((e) => e.type === 'flockWiped');
    expect(wiped).toMatchObject({ flockId: flock.id, size: 5 });
    const bonus = seen.find((e) => e.type === 'bonusAwarded' && e.bonus === 'wholeFlock');
    expect(bonus).toMatchObject({ base: 5 * c.scoring.wholeFlock.perBird });
    expect(seen.find((e) => e.type === 'flockRemoved')).toMatchObject({ reason: 'bagged' });
    expect(sim.result().wholeFlocks).toBe(1);
  });

  it('no Whole Flock for a flock smaller than minSize', () => {
    const c = flockContent((x) => {
      x.birds.flockDefaults.sizeMin = 4;
      x.birds.flockDefaults.sizeMax = 4;
    });
    const sim = newSim(c, 9);
    const flock = midFlock(sim);
    const seen: SimEvent[] = [];
    for (let i = 0; i < 40 && membersOf(sim, flock.id).length > 0; i++) {
      const target = membersOf(sim, flock.id).find((b) => b.hittable);
      if (target) seen.push(...step(sim, shootAt(c, target)));
      seen.push(...wait(sim, COOLDOWN));
    }
    expect(membersOf(sim, flock.id)).toHaveLength(0);
    expect(seen.some((e) => e.type === 'flockWiped')).toBe(false);
  });

  it('no Whole Flock once the flock calmed down after losing a bird (D-020)', () => {
    const c = flockContent((x) => {
      x.birds.flockDefaults.sizeMin = 5;
      x.birds.flockDefaults.sizeMax = 5;
    });
    const sim = newSim(c, 9);
    const flock = midFlock(sim);
    const first = membersOf(sim, flock.id)[0];
    if (!first) throw new Error('empty');
    const seen: SimEvent[] = [...step(sim, shootAt(c, first))];
    expect(membersOf(sim, flock.id).length).toBeLessThan(5);
    // Wait the window out: the flock calms down (ALERT → FORAGE) and loses its chance.
    seen.push(...wait(sim, 120));
    expect(stateChanges(seen)).toContain('alert>forage:window');
    expect(sim.snapshot().flocks.find((f) => f.id === flock.id)?.eligible).toBe(false);
    for (let i = 0; i < 40 && membersOf(sim, flock.id).length > 0; i++) {
      const target = membersOf(sim, flock.id).find((b) => b.hittable);
      if (target) seen.push(...step(sim, shootAt(c, target)));
      seen.push(...wait(sim, COOLDOWN));
    }
    expect(membersOf(sim, flock.id)).toHaveLength(0);
    expect(seen.some((e) => e.type === 'flockWiped')).toBe(false);
    expect(seen.some((e) => e.type === 'bonusAwarded' && e.bonus === 'wholeFlock')).toBe(false);
  });

  it('hadeda fly-over: one threat to every flock (alertsAllFlocks)', () => {
    const c = flockContent((x) => {
      const b = x.biomes[0];
      if (b)
        b.events = [{ id: 'hadeda', creature: 'hadeda', perHunt: [1, 1], window: [0.02, 0.02] }];
    });
    const sim = newSim(c);
    const n = sim.snapshot().flocks.length;
    const ev = wait(sim, 200);
    const hadedaAt = ev.find((e) => e.type === 'worldEvent' && e.event === 'hadeda')?.tick;
    expect(hadedaAt).toBeDefined();
    const threats = ev.filter((e) => e.type === 'flockThreatened' && e.tick === hadedaAt);
    expect(threats).toHaveLength(n);
    expect(threats.every((e) => e.type === 'flockThreatened' && e.source === 'event')).toBe(true);
  });

  it('Vuvuzela: flushes visible flocks; 2 charges, a cooldown, then denied', () => {
    const c = flockContent();
    const sim = newSim(c);
    expect(sim.snapshot().gadget).toMatchObject({ id: 'vuvuzela', charges: 2 });
    const ev = step(sim, [{ t: 'gadget' }]);
    const used = ev.find((e) => e.type === 'gadgetUsed');
    expect(used).toMatchObject({ gadget: 'vuvuzela', chargesLeft: 1 });
    const flushed = ev.filter(
      (e) => e.type === 'flockStateChanged' && e.to === 'flush' && e.cause === 'gadget',
    );
    expect(flushed.length).toBe(used?.type === 'gadgetUsed' ? used.flocks : -1);
    expect(flushed.length).toBeGreaterThan(0);
    // Off-screen flocks stay put.
    const cx = sim.snapshot().cameraX;
    for (const f of sim.snapshot().flocks) {
      const centre = planeCentreX(cx, c.scoring.planes[f.plane].scrollFactor);
      const visible = membersOf(sim, f.id).some((b) => Math.abs(b.x - centre) <= 960);
      if (!visible) expect(f.state).not.toBe('flush');
    }
    expect(step(sim, [{ t: 'gadget' }]).find((e) => e.type === 'gadgetDenied')).toMatchObject({
      reason: 'cooldown',
    });
    const cooldown = sim.snapshot().gadget?.cooldownTicks ?? 0;
    expect(cooldown).toBeGreaterThan(1000);
    wait(sim, cooldown);
    expect(step(sim, [{ t: 'gadget' }]).some((e) => e.type === 'gadgetUsed')).toBe(true);
    wait(sim, sim.snapshot().gadget?.cooldownTicks ?? 0);
    expect(step(sim, [{ t: 'gadget' }]).find((e) => e.type === 'gadgetDenied')).toMatchObject({
      reason: 'noCharges',
    });
    expect(sim.result().gadgetUses).toBe(2);
  });

  it('Stampede: every flock runs when it starts (pacing.stampede.flockState)', () => {
    const c = flockContent();
    const sim = newSim(c, 5, { id: 'classic', huntSeconds: 20 });
    const ev = wait(sim, 20 * 60);
    const start = ev.find((e) => e.type === 'stampedeStarted')?.tick;
    expect(start).toBe(5 * 60);
    const runs = ev.filter(
      (e) => e.type === 'flockStateChanged' && e.tick === start && e.cause === 'stampede',
    );
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((e) => e.type === 'flockStateChanged' && e.to === 'run')).toBe(true);
  });

  it('Stampede: flocks spawned during it enter running, toward the screen centre', () => {
    const c = flockContent((x) => {
      x.birds.flockDefaults.sizeMin = 3;
      x.birds.flockDefaults.sizeMax = 3;
    });
    const sim = newSim(c, 5, { id: 'classic', huntSeconds: 20 });
    wait(sim, 5 * 60 + 1); // Stampede from 5 s
    expect(sim.snapshot().stampedeActive).toBe(true);
    // Clear the live flock so the director spawns a new one during the Stampede.
    const seen: SimEvent[] = [];
    for (let i = 0; i < 60 && !seen.some((e) => e.type === 'flockSpawned'); i++) {
      const target = sim.snapshot().birds.find((b) => b.flockId !== null && b.hittable);
      if (target) seen.push(...step(sim, shootAt(c, target)));
      seen.push(...wait(sim, COOLDOWN));
    }
    for (let i = 0; i < 120 && !seen.some((e) => e.type === 'flockSpawned'); i++)
      seen.push(...step(sim));
    const spawned = seen.find((e) => e.type === 'flockSpawned');
    if (spawned?.type !== 'flockSpawned') throw new Error('no flock spawned in the Stampede');
    const entered = seen.find(
      (e) => e.type === 'flockStateChanged' && e.flockId === spawned.flockId,
    );
    expect(entered).toMatchObject({ tick: spawned.tick, to: 'run', cause: 'stampede' });
    // It heads toward the screen centre, i.e. across the player's view.
    const centre = () => planeCentreX(sim.snapshot().cameraX, c.scoring.planes.mid.scrollFactor);
    const meanX = () => {
      const m = membersOf(sim, spawned.flockId);
      return m.reduce((t, b) => t + b.x, 0) / Math.max(1, m.length);
    };
    const before = Math.abs(meanX() - centre());
    wait(sim, 60);
    expect(Math.abs(meanX() - centre())).toBeLessThan(before);
  });

  it('pacing: flock counts follow the keyframes, capped by maxFlocks; later flocks spawn out of view', () => {
    // Its own keyframes (1 → 3 flocks), so the test is about the director, not Karoo tuning.
    const c = flockContent((x) => {
      x.birds.flockDefaults.spawnSpacingPx = 300;
      x.birds.flockDefaults.spawnSpreadPx = 150;
      const keys = x.biomes[0]?.pacing.keyframes ?? [];
      keys.forEach((k, i) => {
        k.flocks = i === 0 ? { mid: 1 } : { mid: 2, far: 1 };
      });
    });
    const pacing = c.biomes[0]?.pacing;
    if (!pacing) throw new Error('no biome');
    const sim = newSim(c, 11);
    const spawns: SimEvent[] = [];
    let maxLive = 0;
    for (let i = 0; i < 5400 && !sim.isOver(); i++) {
      const ev = step(sim);
      maxLive = Math.max(maxLive, sim.snapshot().flocks.length);
      for (const e of ev) {
        if (e.type !== 'flockSpawned') continue;
        spawns.push(e);
        const sf = c.scoring.planes[e.plane].scrollFactor;
        const centre = planeCentreX(sim.snapshot().cameraX, sf);
        expect(Math.abs(e.x - centre)).toBeGreaterThan(MAX_HALF_VIEW_WIDTH);
      }
    }
    expect(maxLive).toBeLessThanOrEqual(pacing.maxFlocks);
    const last = pacing.keyframes[pacing.keyframes.length - 1]?.flocks ?? {};
    // Topped up toward the late target (the 60-bird cap may hold one flock back).
    expect(maxLive).toBeLessThanOrEqual((last.mid ?? 0) + (last.far ?? 0));
    const first = pacing.keyframes[0]?.flocks ?? {};
    expect(maxLive).toBeGreaterThan((first.mid ?? 0) + (first.far ?? 0));
    expect(spawns.length).toBeGreaterThan(0);
  });
});
