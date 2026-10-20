// Budget (CLAUDE.md): sim step() ≤ 1.5 ms with 60 birds. Measured on a crowded hunt with
// shooting every few ticks; the assertion uses the mean of a busy window to avoid GC noise.
import { describe, expect, it } from 'vitest';
import { createSim } from '../src/sim/Sim';
import type { Command } from '../src/sim/types';
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
});
