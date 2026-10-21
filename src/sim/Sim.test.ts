import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import type { ContentBundle } from '../content/schemas';
import { planeToDx } from './camera';
import { hashEvents, type SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { AimAssistLevel, BirdView, Command, InputKind, ModeConfig } from './types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';

const content = loadContent();

function newSim(
  seed = 42,
  opts: {
    content?: ContentBundle;
    mode?: ModeConfig;
    inputKind?: InputKind;
    aimAssist?: AimAssistLevel;
  } = {},
): Sim {
  return createSim({
    seed,
    content: opts.content ?? content,
    mode: opts.mode ?? { id: 'classic' },
    inputKind: opts.inputKind ?? 'pointer',
    ...(opts.aimAssist === undefined ? {} : { aimAssist: opts.aimAssist }),
  });
}

/** Steps with the given commands and returns the events of that tick. */
function stepEvents(sim: Sim, commands: readonly Command[] = []): SimEvent[] {
  sim.step(commands);
  return [...sim.drainEvents()];
}

/** Commands that centre the camera on a bird and fire at its body centre. */
function shootAt(c: ContentBundle, bird: BirdView): Command[] {
  const plane = c.scoring.planes[bird.plane];
  const f = plane.scrollFactor;
  const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (bird.x - 960) / f + 960));
  const cxQ = Math.round(cx * 2) / 2;
  const creature = c.birds.creatures.find((x) => x.id === bird.creature);
  const body = creature && 'hitbox' in creature ? creature.hitbox.body : { ox: 0, oy: 0 };
  const bx = bird.x + body.ox * plane.scale * bird.facing;
  const by = bird.y + body.oy * plane.scale;
  return [
    { t: 'cameraTarget', cx: cxQ },
    { t: 'fire', dx: planeToDx(cxQ, f, bx), sy: by },
  ];
}

/** Steps until a bird matching `pred` is hittable and on the camera's reachable range. */
function waitFor(sim: Sim, pred: (b: BirdView) => boolean, maxTicks = 6000): BirdView {
  for (let i = 0; i < maxTicks && !sim.isOver(); i++) {
    const found = sim.snapshot().birds.find((b) => b.hittable && pred(b));
    if (found) return found;
    stepEvents(sim);
  }
  throw new Error('bird never appeared');
}

/** Content tweaked for busy, predictable fly-overs (no bob, no near-plane pop-ups, no flocks). */
function busyContent(
  over: { groupSize?: [number, number]; spacing?: [number, number] } = {},
): ContentBundle {
  const c = structuredClone(content);
  c.birds.flyoverDefaults.bobPx = 0;
  c.birds.flyoverDefaults.groupSize = over.groupSize ?? [1, 1];
  c.birds.flyoverDefaults.groupSpacingPx = over.spacing ?? [120, 120];
  for (const b of c.biomes) {
    for (const k of b.pacing.keyframes) {
      k.flyoversPerMin = 120;
      k.popupsPerMin = 0;
      k.flocks = {};
    }
    b.pacing.stampede = { flyoversPerMin: 120, popupsPerMin: 0 };
  }
  return c;
}

/** A fly-over well inside the panorama on the mid plane (so the camera can centre it). */
const midInView = (b: BirdView): boolean =>
  b.plane === 'mid' && b.kind === 'target' && b.x > 900 && b.x < 2900;

function runHunt(seed: number, script: (sim: Sim) => Command[]): { hash: string; sim: Sim } {
  const sim = newSim(seed);
  const all: SimEvent[] = [...sim.drainEvents()];
  while (!sim.isOver()) {
    sim.step(script(sim));
    all.push(...sim.drainEvents());
  }
  return { hash: hashEvents(all), sim };
}

const scripted = (sim: Sim): Command[] => {
  const t = sim.tick;
  const cmds: Command[] = [];
  if (t % 240 === 0) cmds.push({ t: 'cameraTarget', cx: 960 + ((t * 37) % 3200) });
  if (t % 13 === 0)
    cmds.push({ t: 'fire', dx: ((t * 53) % 1600) - 800, sy: 150 + ((t * 29) % 800) });
  if (sim.snapshot().weapon.shells === 0) cmds.push({ t: 'reload' });
  return cmds;
};

describe('Sim determinism', () => {
  it('same seed + same commands ⇒ identical event hash, run twice', () => {
    const a = runHunt(42, scripted);
    const b = runHunt(42, scripted);
    expect(a.hash).toBe(b.hash);
    expect(a.sim.result()).toEqual(b.sim.result());
  });

  it('a different seed gives a different hunt', () => {
    expect(runHunt(43, scripted).hash).not.toBe(runHunt(42, scripted).hash);
  });

  it('touch input grows far-plane hit radii by aimAssistPx (Windbuks, 1 pellet, no spread)', () => {
    const c = busyContent();
    c.birds.flyoverDefaults.planeWeights = { mid: 0, far: 1 };
    const results = (['pointer', 'touch'] as const).map((inputKind) => {
      const sim = newSim(12, {
        content: c,
        inputKind,
        mode: { id: 'classic', weapon: 'windbuks' },
      });
      const bird = waitFor(
        sim,
        (b) => b.plane === 'far' && b.kind === 'target' && b.x > 900 && b.x < 2000,
      );
      // Aim 8 px beyond the body ellipse's right edge (far scale 0.22: rx 24.2 + ox 0).
      const [cam, fire] = shootAt(c, bird);
      if (cam === undefined || fire?.t !== 'fire') throw new Error('bad helper');
      const ev = stepEvents(sim, [cam, { ...fire, dx: fire.dx + 24.2 + 8 }]);
      return ev.find((e) => e.type === 'scoreAwarded');
    });
    expect(results[0]).toBeUndefined();
    // Far wing shot with the Windbuks: 25 × (1 + 1) × 1.5 = 75.
    expect(results[1]).toMatchObject({ points: 25, mult: 3, award: 75 });
  });

  it('Settings aim assist scales the touch radii (off / low / standard), mouse stays 0', () => {
    const c = busyContent();
    c.birds.flyoverDefaults.planeWeights = { mid: 0, far: 1 };
    // 12 px beyond the far body edge: inside standard (18 px), outside low (9 px) and off.
    const hit = (inputKind: 'pointer' | 'touch', aimAssist?: 'off' | 'low' | 'standard') => {
      const sim = newSim(12, {
        content: c,
        inputKind,
        ...(aimAssist === undefined ? {} : { aimAssist }),
        mode: { id: 'classic', weapon: 'windbuks' },
      });
      const bird = waitFor(
        sim,
        (b) => b.plane === 'far' && b.kind === 'target' && b.x > 900 && b.x < 2000,
      );
      const [cam, fire] = shootAt(c, bird);
      if (cam === undefined || fire?.t !== 'fire') throw new Error('bad helper');
      const ev = stepEvents(sim, [cam, { ...fire, dx: fire.dx + 24.2 + 12 }]);
      return ev.some((e) => e.type === 'scoreAwarded');
    };
    expect(hit('touch')).toBe(true);
    expect(hit('touch', 'standard')).toBe(true);
    expect(hit('touch', 'low')).toBe(false);
    expect(hit('touch', 'off')).toBe(false);
    expect(hit('pointer', 'standard')).toBe(false);
  });
});

describe('Sim hunt structure', () => {
  it('a Classic hunt lasts 90 s (5400 ticks) and ends with huntEnded', () => {
    const sim = newSim();
    const start = sim.drainEvents();
    expect(start[0]).toEqual({
      type: 'huntStarted',
      tick: 0,
      durationTicks: 5400,
      stampedeAtTick: 4500,
    });
    let ended: SimEvent | undefined;
    while (!sim.isOver()) ended = stepEvents(sim).find((e) => e.type === 'huntEnded') ?? ended;
    expect(sim.tick).toBe(5400);
    expect(ended).toEqual({ type: 'huntEnded', tick: 5400, score: 0 });
    stepEvents(sim, [{ t: 'fire', dx: 0, sy: 300 }]);
    expect(sim.tick).toBe(5400);
    expect(sim.result().shots).toBe(0);
  });

  it('a Season Run hunt takes 60 s from run.json and has no Stampede without the charm', () => {
    const sim = newSim(1, {
      mode: { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'dubbelloop' },
    });
    expect(sim.snapshot().durationTicks).toBe(3600);
    expect(sim.drainEvents()[0]).toMatchObject({ stampedeAtTick: null });
    const kenner = newSim(1, {
      mode: { id: 'seasonHunt', biome: 'karoo-autumn', weapon: 'dubbelloop', stampede: true },
    });
    expect(kenner.drainEvents()[0]).toMatchObject({ stampedeAtTick: 2700 });
  });

  it('rejects a seasonHunt without biome/weapon', () => {
    expect(() => newSim(1, { mode: { id: 'seasonHunt' } })).toThrow(/biome/);
  });

  it('keeps the camera in [960, 4160] and quantised to 0.5', () => {
    const sim = newSim();
    sim.step([{ t: 'cameraTarget', cx: 99999 }]);
    expect(sim.snapshot().cameraX).toBe(4160);
    sim.step([{ t: 'cameraTarget', cx: 1234.26 }]);
    expect(sim.snapshot().cameraX).toBe(1234.5);
    sim.step([{ t: 'cameraTarget', cx: Number.NaN }]);
    expect(sim.snapshot().cameraX).toBe(1234.5);
  });

  it('ignores non-finite fire positions and clamps huge ones to the widest screen', () => {
    const sim = newSim();
    expect(
      stepEvents(sim, [{ t: 'fire', dx: Number.NaN, sy: 5 }]).some((e) => e.type === 'shotFired'),
    ).toBe(false);
    for (let i = 0; i < 10; i++) stepEvents(sim);
    const shot = stepEvents(sim, [{ t: 'fire', dx: -1e300, sy: 1e300 }]).find(
      (e) => e.type === 'shotFired',
    );
    expect(shot).toMatchObject({ dx: -1260, sy: 1080 });
  });

  it('rejects hunt lengths that a replay could not store exactly', () => {
    expect(() => newSim(1, { mode: { id: 'classic', huntSeconds: 60.3 } })).toThrow(/0.5/);
    expect(newSim(1, { mode: { id: 'classic', huntSeconds: 60.5 } }).snapshot().durationTicks).toBe(
      3630,
    );
  });

  it('quantises fire positions to 0.5 design px', () => {
    const sim = newSim();
    const shot = stepEvents(sim, [{ t: 'fire', dx: 10.26, sy: 99.9 }]).find(
      (e) => e.type === 'shotFired',
    );
    expect(shot).toMatchObject({ dx: 10.5, sy: 100 });
  });

  it('empties the belt, clicks, then reloads after 54 ticks', () => {
    const sim = newSim();
    let fired = 0;
    for (let i = 0; i < 9 * 8; i++) {
      const ev = stepEvents(sim, i % 8 === 0 ? [{ t: 'fire', dx: 0, sy: 1070 }] : []);
      fired += ev.filter((e) => e.type === 'shotFired').length;
      if (i === 64) expect(ev.map((e) => e.type)).toContain('emptyClick');
    }
    expect(fired).toBe(8);
    expect(sim.snapshot().weapon.shells).toBe(0);
    const startTick = sim.tick;
    expect(stepEvents(sim, [{ t: 'reload' }]).map((e) => e.type)).toContain('reloadStarted');
    // Try to fire every tick; the first shot that leaves the barrel marks the reload's end.
    let firstShotTick = -1;
    while (firstShotTick < 0 && sim.tick < startTick + 100) {
      const t = sim.tick;
      if (stepEvents(sim, [{ t: 'fire', dx: 0, sy: 1070 }]).some((e) => e.type === 'shotFired')) {
        firstShotTick = t;
      }
    }
    expect(firstShotTick - startTick).toBe(54);
    expect(sim.snapshot().weapon.shells).toBe(7);
    expect(sim.result().emptyClicks).toBe(1);
  });

  it('never has more birds alive than maxBirdsOnScreen', () => {
    const c = busyContent({ groupSize: [3, 3] });
    for (const b of c.biomes) {
      for (const k of b.pacing.keyframes) k.flyoversPerMin = 2000;
      b.pacing.maxBirdsOnScreen = 25;
    }
    const sim = newSim(5, { content: c });
    let max = 0;
    while (!sim.isOver()) {
      sim.step([]);
      max = Math.max(max, sim.snapshot().birds.length);
    }
    expect(max).toBe(25);
  });

  it('pop-ups appear on the near plane within ±600 px of the screen centre', () => {
    const sim = newSim(9);
    sim.step([{ t: 'cameraTarget', cx: 3000 }]);
    const popups: BirdView[] = [];
    while (!sim.isOver()) {
      sim.step([]);
      for (const ev of sim.drainEvents()) {
        if (ev.type === 'birdSpawned' && ev.motion === 'popup') {
          const b = sim.snapshot().birds.find((x) => x.id === ev.birdId);
          if (b) popups.push(b);
        }
      }
    }
    expect(popups.length).toBeGreaterThan(3);
    for (const b of popups) {
      expect(b.plane).toBe('near');
      expect(Math.abs(b.x - 3000)).toBeLessThanOrEqual(600);
    }
  });
});

describe('Sim scoring in play', () => {
  it('a wing shot on a mid fly-over pays 10 × 2 = 20', () => {
    const c = busyContent();
    const sim = newSim(3, { content: c });
    const bird = waitFor(sim, midInView);
    const ev = stepEvents(sim, shootAt(c, bird));
    expect(ev.find((e) => e.type === 'targetBagged')).toMatchObject({
      birdId: bird.id,
      behaviour: 'flying',
    });
    expect(ev.find((e) => e.type === 'scoreAwarded')).toMatchObject({
      points: 10,
      mult: 2,
      award: 20,
    });
    expect(sim.snapshot().birds.some((b) => b.id === bird.id)).toBe(false);
  });

  it('Frenzy: the 3rd consecutive bagging shot scores ×1.5; a miss resets it', () => {
    const c = busyContent();
    const sim = newSim(4, { content: c });
    const awards: number[] = [];
    for (let shot = 0; shot < 3; shot++) {
      const bird = waitFor(sim, (b) => midInView(b) && b.creature === 'tarentaal');
      const ev = stepEvents(sim, shootAt(c, bird));
      const s = ev.find((e) => e.type === 'scoreAwarded');
      awards.push(s?.type === 'scoreAwarded' ? s.mult : -1);
      for (let i = 0; i < 10; i++) stepEvents(sim);
    }
    expect(awards).toEqual([2, 2, 3]);
    expect(sim.snapshot().streak).toBe(3);
    const miss = stepEvents(sim, [
      { t: 'cameraTarget', cx: 960 },
      { t: 'fire', dx: -900, sy: 1075 },
    ]);
    expect(miss.find((e) => e.type === 'comboChanged')).toMatchObject({ streak: 0, frenzyMul: 1 });
    expect(miss.some((e) => e.type === 'miss')).toBe(true);
  });

  it('Stampede: the last 15 s double every award (GDD §8)', () => {
    const c = busyContent();
    const sim = newSim(6, { content: c });
    while (sim.tick < 4500) stepEvents(sim);
    const bird = waitFor(sim, midInView);
    const ev = stepEvents(sim, shootAt(c, bird));
    expect(ev.find((e) => e.type === 'scoreAwarded')).toMatchObject({ mult: 4, award: 40 });
    expect(sim.snapshot().stampedeActive).toBe(true);
  });

  it('Twee Vlieë: one shot bagging several birds pays the table bonus on top', () => {
    // A tight trio: overlapping birds shield each other front-to-back, so a trio spaced 45 px
    // apart lets the 70 px pellet spread land on more than one of them.
    const c = busyContent({ groupSize: [3, 3], spacing: [45, 45] });
    const sim = newSim(8, { content: c });
    const near = (b: BirdView): BirdView[] =>
      sim.snapshot().birds.filter((x) => x.plane === b.plane && Math.abs(x.x - b.x) < 100);
    const bird = waitFor(sim, (b) => midInView(b) && near(b).length === 3);
    const trio = near(bird).sort((p, q) => p.x - q.x);
    const ev = stepEvents(sim, shootAt(c, trio[1] ?? bird));
    const bagged = ev.filter((e) => e.type === 'targetBagged').length;
    expect(bagged).toBeGreaterThanOrEqual(2);
    const base = bagged === 2 ? 15 : 40;
    expect(ev.find((e) => e.type === 'bonusAwarded')).toMatchObject({
      bonus: 'twoFlies',
      base,
      award: base,
    });
    expect(sim.result().twoFlies).toBe(1);
    expect(sim.snapshot().score).toBe(bagged * 20 + base);
  });

  it('penalty: shooting the crop sprayer costs 50 and breaks the Frenzy', () => {
    const c = busyContent();
    // Only the scheduled event creatures fly, so nothing overlaps the sprayer.
    for (const b of c.biomes) for (const k of b.pacing.keyframes) k.flyoversPerMin = 0;
    const sim = newSim(2, { content: c });
    waitFor(sim, (b) => b.creature === 'sproeier' && b.x > 700 && b.x < 2300);
    // A thin far-plane target: keep shooting at it (like a player) until a pellet connects.
    let penalty: SimEvent | undefined;
    for (let i = 0; i < 400 && penalty === undefined; i++) {
      const plane = sim.snapshot().birds.find((b) => b.creature === 'sproeier');
      if (plane === undefined) break;
      const before = sim.snapshot().score;
      const ev = stepEvents(
        sim,
        sim.snapshot().weapon.shells === 0 ? [{ t: 'reload' }] : shootAt(c, plane),
      );
      penalty = ev.find((e) => e.type === 'penaltyApplied');
      if (penalty) expect(sim.snapshot().score).toBe(before - 50);
    }
    expect(penalty).toMatchObject({ creature: 'sproeier', points: -50 });
    expect(sim.result().penalties).toBe(1);
    expect(sim.snapshot().streak).toBe(0);
  });
});

describe('FTUE hunt (Oupa se Les, GDD §16)', () => {
  const ftue = (): ModeConfig => ({ id: 'ftue' });
  const run = (sim: Sim, untilTick: number, script: (s: Sim) => Command[] = () => []) => {
    const all: SimEvent[] = [...sim.drainEvents()];
    while (sim.tick < untilTick && !sim.isOver()) all.push(...stepEvents(sim, script(sim)));
    return all;
  };

  it('is a 60 s Karoo hunt with no Stampede and a foraging flock in view from the start', () => {
    const sim = newSim(3, { mode: ftue() });
    expect(sim.drainEvents()[0]).toMatchObject({ durationTicks: 3600, stampedeAtTick: null });
    stepEvents(sim);
    const s = sim.snapshot();
    expect(s.flocks.some((f) => f.state === 'forage')).toBe(true);
  });

  it('Bles spooks a visible flock into RUN at 1/3 when the player has not, then a flock flushes at 1/2', () => {
    const sim = newSim(3, { mode: ftue() });
    const events = run(sim, 1801);
    const beats = events.filter((e) => e.type === 'tutorialBeat');
    expect(beats.map((b) => [b.tick, b.beat])).toEqual([
      [Math.floor(0.33 * 3600), 'spook'],
      [1800, 'flush'],
    ]);
    const spook = beats[0];
    const flush = beats[1];
    if (spook?.type !== 'tutorialBeat' || flush?.type !== 'tutorialBeat') throw new Error('beats');
    expect(spook.flockId).not.toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'flockStateChanged',
        tick: spook.tick,
        flockId: spook.flockId,
        to: 'run',
        cause: 'event',
      }),
    );
    expect(flush.flockId).not.toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'flockStateChanged',
        tick: 1800,
        flockId: flush.flockId,
        to: 'flush',
        cause: 'event',
      }),
    );
  });

  it('the dog stays home when the player already made a flock run', () => {
    const sim = newSim(3, { mode: ftue() });
    // The Vuvuzela flushes the visible flocks at once.
    const events = run(sim, 1200, (s) => (s.tick === 60 ? [{ t: 'gadget' }] : []));
    const spook = events.find((e) => e.type === 'tutorialBeat');
    expect(spook).toMatchObject({ beat: 'spook', flockId: null });
  });

  it('gives a generous first hit (firstHitAssistPx) that ends with the first bag', () => {
    const c = busyContent();
    c.birds.flyoverDefaults.planeWeights = { mid: 0, far: 1 };
    const extra = c.modes.modes.ftue.tutorial.firstHitAssistPx;
    const shoot = (mode: ModeConfig, offset: number) => {
      const sim = newSim(12, { content: c, mode: { ...mode, weapon: 'windbuks' } });
      const bird = waitFor(
        sim,
        (b) => b.plane === 'far' && b.kind === 'target' && b.x > 900 && b.x < 2000,
      );
      const [cam, fire] = shootAt(c, bird);
      if (cam === undefined || fire?.t !== 'fire') throw new Error('bad helper');
      return {
        sim,
        hit: stepEvents(sim, [cam, { ...fire, dx: fire.dx + 24.2 + offset }]).some(
          (e) => e.type === 'targetBagged',
        ),
      };
    };
    expect(shoot({ id: 'classic' }, extra - 5).hit).toBe(false);
    const first = shoot(ftue(), extra - 5);
    expect(first.hit).toBe(true);
    // After the first bag the radii are back to normal.
    const sim = first.sim;
    for (let i = 0; i < 30; i++) stepEvents(sim);
    const bird = waitFor(
      sim,
      (b) => b.plane === 'far' && b.kind === 'target' && b.x > 900 && b.x < 2000,
    );
    const [cam, fire] = shootAt(c, bird);
    if (cam === undefined || fire?.t !== 'fire') throw new Error('bad helper');
    for (let i = 0; i < 20; i++) stepEvents(sim);
    const later = waitFor(
      sim,
      (b) =>
        b.id === bird.id || (b.plane === 'far' && b.kind === 'target' && b.x > 900 && b.x < 2000),
    );
    const [cam2, fire2] = shootAt(c, later);
    if (cam2 === undefined || fire2?.t !== 'fire') throw new Error('bad helper');
    const ev = stepEvents(sim, [cam2, { ...fire2, dx: fire2.dx + 24.2 + extra - 5 }]);
    expect(ev.some((e) => e.type === 'targetBagged')).toBe(false);
  });

  it('replays deterministically and the mode survives the InputLog', () => {
    const a = run(newSim(5, { mode: ftue() }), 3600);
    const b = run(newSim(5, { mode: ftue() }), 3600);
    expect(hashEvents(a)).toBe(hashEvents(b));
  });
});
