// M8 arsenal: Kettie (delayed hitscan with drop and wind), Plaas-Pomp (interruptible per-shell
// reload) and Windbuks (silent, far ×1.5, per-shell reload) — GDD §10.1, Tech §3.4.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import type { ContentBundle } from '../content/schemas';
import { planeToDx } from './camera';
import { msToTicks } from './clock';
import type { SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { BirdView, Command, ModeConfig, SeasonHuntConfig } from './types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';

const content = loadContent();

function newSim(
  weapon: string,
  opts: { seed?: number; c?: ContentBundle; mode?: Partial<ModeConfig> } = {},
): Sim {
  return createSim({
    seed: opts.seed ?? 42,
    content: opts.c ?? content,
    mode: { id: 'classic', weapon, ...opts.mode },
    inputKind: 'pointer',
  });
}

function stepEvents(sim: Sim, commands: readonly Command[] = []): SimEvent[] {
  sim.step(commands);
  return [...sim.drainEvents()];
}

function stepUntil(
  sim: Sim,
  pred: (e: SimEvent) => boolean,
  max = 120,
): { e: SimEvent; ticks: number } {
  for (let i = 1; i <= max; i++) {
    const found = stepEvents(sim).find(pred);
    if (found) return { e: found, ticks: i };
  }
  throw new Error('event never came');
}

function weaponDef(id: string) {
  const w = content.weapons.weapons.find((x) => x.id === id);
  if (w?.kind !== 'primary') throw new Error(`no primary ${id}`);
  return w;
}

/** Camera centred on a bird; the dx/sy of its body centre (plus an offset). */
function aimAt(
  c: ContentBundle,
  bird: BirdView,
  off = { x: 0, y: 0 },
): { cx: number; dx: number; sy: number } {
  const plane = c.scoring.planes[bird.plane];
  const f = plane.scrollFactor;
  const cx =
    Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (bird.x - 960) / f + 960)) * 2) / 2;
  const creature = c.birds.creatures.find((x) => x.id === bird.creature);
  const body = creature && 'hitbox' in creature ? creature.hitbox.body : { ox: 0, oy: 0 };
  const bx = bird.x + body.ox * plane.scale * bird.facing + off.x;
  const by = bird.y + body.oy * plane.scale + off.y;
  return { cx, dx: planeToDx(cx, f, bx), sy: by };
}

function waitFor(sim: Sim, pred: (b: BirdView) => boolean, max = 6000): BirdView {
  for (let i = 0; i < max && !sim.isOver(); i++) {
    const found = sim
      .snapshot()
      .birds.find((b) => b.hittable && pred(b) && Math.abs(aimAt(content, b).dx) < 700);
    if (found) return found;
    stepEvents(sim);
  }
  throw new Error('bird never appeared');
}

const isForagingMid = (b: BirdView): boolean =>
  b.plane === 'mid' && b.flockId !== null && b.behaviour === 'forage';

describe('Kettie (delayed hitscan)', () => {
  const kettie = weaponDef('kettie');
  const travel = kettie.projectile;
  if (travel === null) throw new Error('kettie needs a projectile');

  it('is a playable weapon: no belt, no reload, the draw is its cooldown', () => {
    const sim = newSim('kettie');
    const w = sim.snapshot().weapon;
    expect(w.id).toBe('kettie');
    expect(w.infinite).toBe(true);
    expect(stepEvents(sim, [{ t: 'reload' }]).some((e) => e.type === 'reloadStarted')).toBe(false);
  });

  it('a sky shot lands only after the far travel time, as a miss', () => {
    const sim = newSim('kettie');
    const fired = stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    expect(fired.some((e) => e.type === 'shotFired')).toBe(true);
    expect(fired.some((e) => e.type === 'pelletImpact' || e.type === 'miss')).toBe(false);
    expect(sim.snapshot().projectiles).toHaveLength(1);
    const { e, ticks } = stepUntil(sim, (x) => x.type === 'pelletImpact');
    expect(ticks).toBe(msToTicks(travel.travelMs.far));
    expect(e.type === 'pelletImpact' && e.birdId === null && e.cx !== undefined).toBe(true);
    expect(sim.snapshot().projectiles).toHaveLength(0);
  });

  it('a mid bird is hit after the mid travel time, not before', () => {
    const sim = newSim('kettie');
    const bird = waitFor(sim, isForagingMid);
    const a = aimAt(content, bird, { x: 0, y: -travel.dropPx.mid });
    stepEvents(sim, [{ t: 'cameraTarget', cx: a.cx }]);
    stepEvents(sim, [{ t: 'fire', dx: a.dx, sy: a.sy }]);
    const { e, ticks } = stepUntil(sim, (x) => x.type === 'pelletImpact');
    expect(ticks).toBe(msToTicks(travel.travelMs.mid));
    expect(e.type === 'pelletImpact' && e.birdId).toBeTruthy();
  });

  it('drops: aiming dead on a bird with a big drop lands below it', () => {
    const c = structuredClone(content);
    const k = c.weapons.weapons.find((w) => w.id === 'kettie');
    if (k?.kind !== 'primary' || k.projectile === null) throw new Error('kettie');
    k.projectile.dropPx.mid = 300;
    k.projectile.dropPx.far = 400;
    const sim = newSim('kettie', { c });
    const bird = waitFor(sim, isForagingMid);
    const a = aimAt(c, bird);
    stepEvents(sim, [{ t: 'cameraTarget', cx: a.cx }]);
    stepEvents(sim, [{ t: 'fire', dx: a.dx, sy: a.sy }]);
    const { e } = stepUntil(sim, (x) => x.type === 'pelletImpact');
    expect(e.type === 'pelletImpact' && e.birdId).not.toBe(bird.id);
    expect(e.type === 'pelletImpact' && e.sy).toBeGreaterThan(a.sy + 250);
  });

  it('the target moves while the stone flies: no lead misses, leading hits', () => {
    const run = (lead: boolean): SimEvent | undefined => {
      const sim = newSim('kettie', { seed: 7 });
      const b0 = waitFor(
        sim,
        (b) => b.plane === 'mid' && b.behaviour === 'flying' && b.flockId === null,
      );
      stepEvents(sim);
      const b1 = sim.snapshot().birds.find((b) => b.id === b0.id);
      if (b1 === undefined) throw new Error('bird gone');
      const t = msToTicks(travel.travelMs.mid);
      // No lead: aim at the trailing edge of the body — a hitscan shot there would still hit.
      const tail = -Math.sign(b1.x - b0.x) * 45;
      const off = lead
        ? { x: (b1.x - b0.x) * (t + 1), y: (b1.y - b0.y) * (t + 1) - travel.dropPx.mid }
        : { x: tail, y: 0 };
      const a = aimAt(content, b1, off);
      stepEvents(sim, [{ t: 'cameraTarget', cx: a.cx }]);
      const b2 = sim.snapshot().birds.find((b) => b.id === b0.id);
      if (b2 === undefined) throw new Error('bird gone');
      const aim = aimAt(content, b2, off);
      stepEvents(sim, [{ t: 'fire', dx: aim.dx, sy: aim.sy }]);
      return stepUntil(sim, (x) => x.type === 'pelletImpact').e;
    };
    const still = run(false);
    const led = run(true);
    expect(still?.type === 'pelletImpact' && still.birdId).toBeFalsy();
    expect(led?.type === 'pelletImpact' && led.birdId).toBeTruthy();
  });

  it('wind drifts the stone on the far band by its windSensitivity, read on arrival', () => {
    const sky = (weapon: string): number => {
      const sim = newSim(weapon, { mode: { omen: true } });
      for (let i = 0; i < 30; i++) stepEvents(sim);
      const now = stepEvents(sim, [{ t: 'fire', dx: 100, sy: 40 }]);
      const ev =
        weapon === 'kettie'
          ? stepUntil(sim, (x) => x.type === 'pelletImpact').e
          : now.find((x) => x.type === 'pelletImpact');
      if (ev?.type !== 'pelletImpact') throw new Error('no impact');
      return ev.dx - 100;
    };
    const kettieDrift = sky('kettie');
    const windbuksDrift = sky('windbuks');
    expect(Math.abs(kettieDrift)).toBeGreaterThan(0);
    expect(kettieDrift / windbuksDrift).toBeCloseTo(
      kettie.windSensitivity / weaponDef('windbuks').windSensitivity,
      5,
    );
    // Classic has no omen: no wind, no drift.
    const calm = newSim('kettie');
    stepEvents(calm, [{ t: 'fire', dx: 100, sy: 40 }]);
    const e = stepUntil(calm, (x) => x.type === 'pelletImpact').e;
    expect(e.type === 'pelletImpact' && e.dx).toBe(100);
  });

  it('stones resolve in fire order; a miss comes when the stone lands', () => {
    const c = structuredClone(content);
    const k = c.weapons.weapons.find((w) => w.id === 'kettie');
    if (k?.kind !== 'primary') throw new Error('kettie');
    k.fireCooldownMs = 100;
    const sim = newSim('kettie', { c });
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    for (let i = 0; i < msToTicks(100); i++) stepEvents(sim);
    stepEvents(sim, [{ t: 'fire', dx: 50, sy: 40 }]);
    expect(sim.snapshot().projectiles.map((p) => p.dx)).toEqual([0, 50]);
    const misses: number[] = [];
    for (let i = 0; i < 60; i++)
      for (const e of stepEvents(sim)) if (e.type === 'miss') misses.push(e.shotId);
    expect(misses).toEqual([1, 2]);
  });

  it('a stone still in the air when the hunt ends is dropped', () => {
    const sim = newSim('kettie', { mode: { huntSeconds: 1 } });
    for (let i = 0; i < 55; i++) stepEvents(sim);
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    const after: SimEvent[] = [];
    while (!sim.isOver()) after.push(...stepEvents(sim));
    expect(after.some((e) => e.type === 'miss' || e.type === 'pelletImpact')).toBe(false);
    expect(sim.result().shots).toBe(1);
  });

  it("Kuifkop Koning's reload rule doubles the Kettie's draw", () => {
    const season: SeasonHuntConfig = {
      kind: 'boss',
      boss: 'kuifkop_koning',
      charms: [],
      consumables: [],
      rental: null,
      runShellBonus: 0,
    };
    const sim = createSim({
      seed: 1,
      content,
      mode: { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'kettie', season },
      inputKind: 'pointer',
    });
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    expect(sim.snapshot().weapon.cooldownTicks).toBe(2 * msToTicks(kettie.fireCooldownMs) - 1);
  });
});

describe('Plaas-Pomp (interruptible per-shell reload)', () => {
  const pomp = weaponDef('pomp');
  const perShell = msToTicks(pomp.reloadMs);
  const cooldown = msToTicks(pomp.fireCooldownMs);
  const wait = (sim: Sim, n: number): SimEvent[] => {
    const out: SimEvent[] = [];
    for (let i = 0; i < n; i++) out.push(...stepEvents(sim));
    return out;
  };

  it('loads one shell per reload step and a shot cuts the reload, keeping loaded shells', () => {
    const sim = newSim('pomp');
    expect(sim.snapshot().weapon.magazine).toBe(6);
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    wait(sim, cooldown);
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    wait(sim, cooldown);
    expect(sim.snapshot().weapon.shells).toBe(4);
    const started = stepEvents(sim, [{ t: 'reload' }]);
    expect(started.some((e) => e.type === 'reloadStarted' && e.perShell)).toBe(true);
    const loaded = wait(sim, perShell);
    expect(
      loaded.filter((e) => e.type === 'shellLoaded').map((e) => ('shells' in e ? e.shells : 0)),
    ).toEqual([5]);
    const cut = stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    expect(cut.some((e) => e.type === 'reloadInterrupted')).toBe(true);
    expect(cut.some((e) => e.type === 'shotFired')).toBe(true);
    expect(sim.snapshot().weapon.shells).toBe(4);
    expect(sim.snapshot().weapon.reloading).toBe(false);
  });

  it('a full reload from empty takes six steps', () => {
    const sim = newSim('pomp');
    for (let i = 0; i < 6; i++) {
      stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
      wait(sim, cooldown);
    }
    expect(sim.snapshot().weapon.shells).toBe(0);
    stepEvents(sim, [{ t: 'reload' }]);
    const ev = wait(sim, perShell * 6);
    expect(ev.filter((e) => e.type === 'shellLoaded')).toHaveLength(5);
    expect(ev.some((e) => e.type === 'reloadFinished')).toBe(true);
    expect(sim.snapshot().weapon.shells).toBe(6);
  });

  it("Kuifkop Koning's rule doubles each shell's reload step", () => {
    const season: SeasonHuntConfig = {
      kind: 'boss',
      boss: 'kuifkop_koning',
      charms: [],
      consumables: [],
      rental: null,
      runShellBonus: 0,
    };
    const sim = createSim({
      seed: 1,
      content,
      mode: { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'pomp', season },
      inputKind: 'pointer',
    });
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    wait(sim, cooldown);
    stepEvents(sim, [{ t: 'reload' }]);
    expect(
      wait(sim, perShell).some((e) => e.type === 'shellLoaded' || e.type === 'reloadFinished'),
    ).toBe(false);
    expect(wait(sim, perShell).some((e) => e.type === 'reloadFinished')).toBe(true);
  });
});

describe('Windbuks (silent air rifle)', () => {
  const windbuks = weaponDef('windbuks');

  it("a miss beside a flock doesn't alert it (the Dubbelloop's does)", () => {
    const threats = (weapon: string): number => {
      const sim = newSim(weapon);
      const bird = waitFor(sim, isForagingMid);
      const a = aimAt(content, bird, { x: 0, y: -150 });
      stepEvents(sim, [{ t: 'cameraTarget', cx: a.cx }]);
      const ev = stepEvents(sim, [{ t: 'fire', dx: a.dx, sy: a.sy }]);
      expect(ev.some((e) => e.type === 'targetBagged')).toBe(false);
      return ev.filter((e) => e.type === 'flockThreatened').length;
    };
    expect(threats('windbuks')).toBe(0);
    expect(threats('dubbelloop')).toBeGreaterThan(0);
  });

  it('scores far-plane bags ×1.5 and other planes ×1', () => {
    const mulFor = (plane: 'far' | 'mid'): number => {
      const sim = newSim('windbuks', { seed: 3 });
      const bird = waitFor(sim, (b) => b.plane === plane && b.kind === 'target');
      const a = aimAt(content, bird);
      stepEvents(sim, [{ t: 'cameraTarget', cx: a.cx }]);
      const b2 = sim.snapshot().birds.find((b) => b.id === bird.id) ?? bird;
      const a2 = aimAt(content, b2);
      const ev = stepEvents(sim, [{ t: 'fire', dx: a2.dx, sy: a2.sy }]);
      const award = ev.find((e) => e.type === 'scoreAwarded');
      if (award?.type !== 'scoreAwarded') throw new Error(`no bag on ${plane}`);
      const step = award.breakdown.find((s) => s.kind === 'weapon');
      return step?.value ?? 1;
    };
    expect(mulFor('far')).toBe(windbuks.scoreMul.far);
    expect(mulFor('mid')).toBe(1);
  });

  it('reloads pellet by pellet and a shot cannot cut it', () => {
    const sim = newSim('windbuks');
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    for (let i = 0; i < msToTicks(windbuks.fireCooldownMs); i++) stepEvents(sim);
    stepEvents(sim, [{ t: 'reload' }]);
    const blocked = stepEvents(sim, [{ t: 'fire', dx: 0, sy: 40 }]);
    expect(blocked.some((e) => e.type === 'shotFired')).toBe(false);
    expect(sim.snapshot().weapon.reloading).toBe(true);
  });
});
