// Budget (CLAUDE.md): sim step() ≤ 1.5 ms with 60 birds. Measured on a crowded hunt with
// shooting every few ticks; the assertion uses the mean of a busy window to avoid GC noise.
import { describe, expect, it } from 'vitest';
import { createSim } from '../src/sim/Sim';
import type { Command } from '../src/sim/types';
import { withBrakkiePreview } from '../src/game/devContent';
import { loadContent } from './testContent';

describe('sim performance budget', () => {
  it('step() averages ≤ 1.5 ms with 60 birds alive', () => {
    const content = structuredClone(loadContent());
    for (const b of content.biomes) {
      for (const k of b.pacing.keyframes) {
        k.flyoversPerMin = 3000;
        k.popupsPerMin = 300;
      }
      b.pacing.stampede = { flyoversPerMin: 3000, popupsPerMin: 300 };
    }
    const sim = createSim({ seed: 1, content, mode: { id: 'classic' }, inputKind: 'touch' });
    while (sim.snapshot().birds.length < 60) sim.step([]);
    let total = 0;
    let steps = 0;
    let minBirds = Infinity;
    for (let i = 0; i < 1200; i++) {
      const cmds: Command[] = [];
      if (i % 4 === 0)
        cmds.push({ t: 'fire', dx: ((i * 37) % 1600) - 800, sy: 150 + ((i * 53) % 800) });
      if (i % 40 === 0) cmds.push({ t: 'reload' });
      const t0 = performance.now();
      sim.step(cmds);
      total += performance.now() - t0;
      steps++;
      sim.drainEvents();
      minBirds = Math.min(minBirds, sim.snapshot().birds.length);
    }
    const mean = total / steps;
    console.log(
      `step(): mean ${(mean * 1000).toFixed(1)} µs over ${steps} steps, ≥ ${minBirds} birds`,
    );
    expect(minBirds).toBeGreaterThanOrEqual(50);
    expect(mean).toBeLessThan(1.5);
  });

  it('step() averages ≤ 1.5 ms with ~60 flock birds steering, running and flushing', () => {
    const content = structuredClone(loadContent());
    content.birds.flockDefaults.sizeMin = 15;
    content.birds.flockDefaults.sizeMax = 15;
    content.birds.flockDefaults.spawnSpacingPx = 200;
    for (const b of content.biomes) {
      b.pacing.maxFlocks = 8;
      for (const k of b.pacing.keyframes) {
        k.flocks = { mid: 2, far: 2 };
        k.flyoversPerMin = 0;
        k.popupsPerMin = 0;
      }
    }
    const sim = createSim({ seed: 2, content, mode: { id: 'classic' }, inputKind: 'touch' });
    let total = 0;
    let steps = 0;
    let maxBirds = 0;
    for (let i = 0; i < 1200; i++) {
      const cmds: Command[] = [];
      if (i % 6 === 0)
        cmds.push({ t: 'fire', dx: ((i * 37) % 1600) - 800, sy: 600 + ((i * 53) % 200) });
      if (i % 30 === 0) cmds.push({ t: 'reload' });
      if (i % 200 === 0) cmds.push({ t: 'cameraTarget', cx: 960 + ((i * 7) % 3200) });
      const t0 = performance.now();
      sim.step(cmds);
      total += performance.now() - t0;
      steps++;
      sim.drainEvents();
      maxBirds = Math.max(maxBirds, sim.snapshot().birds.length);
    }
    const mean = total / steps;
    console.log(`flocks step(): mean ${(mean * 1000).toFixed(1)} µs, up to ${maxBirds} birds`);
    expect(maxBirds).toBeGreaterThanOrEqual(55);
    expect(mean).toBeLessThan(1.5);
  });

  // v1.8c (D-063): the Harvest at its peak — the warthogs at their cap with piglets, the workers,
  // the baboon raid, the mid flocks and the fly-overs ramped up — with shooting every few ticks.
  it('step() averages ≤ 1.5 ms in the Harvest rush at its peak', () => {
    const content = structuredClone(loadContent());
    const h = content.modes.modes.harvest;
    h.rush.keyframes = h.rush.keyframes.map((k) => ({ ...k, warthogsPerMin: 120 }));
    h.warthogs.sowChance = 1;
    h.huntSeconds = 60;
    const oes = content.biomes.find((b) => b.id === h.biome);
    if (oes === undefined) throw new Error('no Harvest map');
    oes.pacing.maxFlocks = 6;
    for (const k of oes.pacing.keyframes) {
      k.flocks = { mid: 3 };
      k.flyoversPerMin = 60;
      k.popupsPerMin = 20;
    }
    const sim = createSim({ seed: 4, content, mode: { id: 'harvest' }, inputKind: 'touch' });
    // Through the intro (no shots: a tap would skip it) and the first warthogs.
    for (let i = 0; i < 600; i++) sim.step([]);
    sim.drainEvents();
    let total = 0;
    let steps = 0;
    let maxAnimals = 0;
    for (let i = 0; i < 1200 && !sim.isOver(); i++) {
      const cmds: Command[] = [];
      if (i % 5 === 0)
        cmds.push({ t: 'fire', dx: ((i * 37) % 1600) - 800, sy: 650 + ((i * 53) % 350) });
      if (i % 30 === 0) cmds.push({ t: 'reload' });
      if (i % 200 === 0) cmds.push({ t: 'cameraTarget', cx: 960 + ((i * 7) % 3200) });
      const t0 = performance.now();
      sim.step(cmds);
      total += performance.now() - t0;
      steps++;
      sim.drainEvents();
      const s = sim.snapshot();
      maxAnimals = Math.max(
        maxAnimals,
        s.birds.length + (s.harvest?.warthogs.length ?? 0) + (s.harvest?.piglets.length ?? 0),
      );
    }
    const mean = total / steps;
    console.log(`harvest step(): mean ${(mean * 1000).toFixed(1)} µs, up to ${maxAnimals} animals`);
    expect(maxAnimals).toBeGreaterThanOrEqual(30);
    expect(mean).toBeLessThan(1.5);
  });

  // v1.10 (D-067): Reënbui's swarm at its peak — 4 columns, every flock feeding, the extra flocks
  // in, 60 birds (flocks and fly-overs) — with shooting every few ticks.
  it('step() averages ≤ 1.5 ms with 60 birds in the Reënbui swarm', () => {
    const content = structuredClone(loadContent());
    const r = content.reenbui;
    r.areas = content.biomes.map((b) => ({ biome: b.id, chance: 1 }));
    r.window = [0.02, 0.02];
    r.phaseSeconds = { buildup: 1, drops: 1, swarm: 60, easing: 1 };
    r.columns.count = [4, 4];
    r.extraFlocks.everySeconds = 1;
    r.extraFlocks.max = 4;
    content.birds.flockDefaults.sizeMin = 10;
    content.birds.flockDefaults.sizeMax = 10;
    for (const b of content.biomes) {
      b.pacing.maxFlocks = 8;
      b.pacing.maxBirdsOnScreen = 60;
      for (const k of b.pacing.keyframes) {
        k.flocks = { mid: 3, far: 2 };
        k.flyoversPerMin = 600;
      }
    }
    const mode = { id: 'classic' as const, biome: 'kalahari-summer', huntSeconds: 120 };
    const sim = createSim({ seed: 5, content, mode, inputKind: 'touch' });
    while (sim.snapshot().reenbui?.phase !== 'swarm') sim.step([]);
    for (let i = 0; i < 300; i++) sim.step([]);
    sim.drainEvents();
    let total = 0;
    let steps = 0;
    let maxBirds = 0;
    let feeding = 0;
    for (let i = 0; i < 1200 && !sim.isOver(); i++) {
      const cmds: Command[] = [];
      if (i % 6 === 0)
        cmds.push({ t: 'fire', dx: ((i * 37) % 1600) - 800, sy: 600 + ((i * 53) % 200) });
      if (i % 30 === 0) cmds.push({ t: 'reload' });
      const t0 = performance.now();
      sim.step(cmds);
      total += performance.now() - t0;
      steps++;
      sim.drainEvents();
      const s = sim.snapshot();
      maxBirds = Math.max(maxBirds, s.birds.length);
      feeding = Math.max(feeding, s.flocks.filter((f) => f.feeding === true).length);
    }
    const mean = total / steps;
    console.log(`reenbui step(): mean ${(mean * 1000).toFixed(1)} µs, up to ${maxBirds} birds`);
    expect(sim.snapshot().reenbui?.phase).toBe('swarm');
    expect(maxBirds).toBeGreaterThanOrEqual(55);
    expect(feeding).toBeGreaterThanOrEqual(2);
    expect(mean).toBeLessThan(1.5);
  });
  it('step() averages ≤ 1.5 ms with 60 birds plus Brakkie roaming, fetching and barking', () => {
    const content = withBrakkiePreview(structuredClone(loadContent()), 'bark');
    for (const b of content.biomes) {
      for (const k of b.pacing.keyframes) {
        k.flyoversPerMin = 3000;
        k.popupsPerMin = 300;
      }
      b.pacing.stampede = { flyoversPerMin: 3000, popupsPerMin: 300 };
    }
    const sim = createSim({ seed: 2, content, mode: { id: 'classic' }, inputKind: 'touch' });
    while (sim.snapshot().birds.length < 60) sim.step([]);
    let total = 0;
    let steps = 0;
    let out = 0;
    for (let i = 0; i < 1200; i++) {
      const cmds: Command[] = [];
      if (i % 4 === 0)
        cmds.push({ t: 'fire', dx: ((i * 37) % 1600) - 800, sy: 150 + ((i * 53) % 600) });
      if (i % 40 === 0) cmds.push({ t: 'reload' });
      const t0 = performance.now();
      sim.step(cmds);
      total += performance.now() - t0;
      steps++;
      sim.drainEvents();
      if (sim.snapshot().brakkie?.present === true) out++;
    }
    const mean = total / steps;
    console.log(`brakkie step(): mean ${(mean * 1000).toFixed(1)} µs, out ${out} of ${steps}`);
    expect(out).toBeGreaterThan(steps / 4);
    expect(mean).toBeLessThan(1.5);
  });
});
