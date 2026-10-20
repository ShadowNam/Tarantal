import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash } from '../../tools/testContent';
import { hashEvents, type SimEvent } from '../sim/events';
import { createRecorder } from '../sim/replay/inputLog';
import { runReplay } from '../sim/replay/verify';
import { createSim } from '../sim/Sim';
import type { Command } from '../sim/types';
import { HuntRunner, STEP_MS } from './HuntRunner';
import { interpolateBirds, interpolateCamera } from './view/interpolate';

const content = loadContent();
const newSim = (seed = 7) =>
  createSim({ seed, content, mode: { id: 'classic', huntSeconds: 10 }, inputKind: 'touch' });

describe('HuntRunner', () => {
  it('runs one tick per 1/60 s and keeps the remainder for interpolation', () => {
    const r = new HuntRunner(newSim(), { maxStepsPerFrame: 5 });
    expect(r.advance(STEP_MS * 2.5).steps).toBe(2);
    expect(r.state.tick).toBe(2);
    expect(r.prev.tick).toBe(1);
    expect(r.alpha).toBeCloseTo(0.5, 5);
  });

  it('hands out huntStarted on the first frame', () => {
    const r = new HuntRunner(newSim(), { maxStepsPerFrame: 5 });
    expect(r.advance(1).events.map((e) => e.type)).toContain('huntStarted');
  });

  it('caps steps per frame and drops the backlog (spiral-of-death guard)', () => {
    const r = new HuntRunner(newSim(), { maxStepsPerFrame: 5 });
    expect(r.advance(1000).steps).toBe(5);
    expect(r.advance(STEP_MS * 0.5).steps).toBe(0);
  });

  it('slow-mo runs the sim at scale × real time for that long, then normal speed', () => {
    const r = new HuntRunner(newSim(), { maxStepsPerFrame: 5 });
    r.advance(STEP_MS);
    r.slowMo(0.3, 400);
    let steps = 0;
    for (let i = 0; i < 24; i++) steps += r.advance(400 / 24).steps; // 400 ms real
    expect(r.slowMoActive).toBe(false);
    // 400 ms × 0.3 = 120 ms of sim time ≈ 7 ticks (instead of 24).
    expect(steps).toBeGreaterThanOrEqual(6);
    expect(steps).toBeLessThanOrEqual(8);
    expect(r.advance(STEP_MS * 3).steps).toBe(3);
  });

  it('hit-stop holds the sim for that much real time', () => {
    const r = new HuntRunner(newSim(), { maxStepsPerFrame: 5 });
    r.advance(STEP_MS);
    r.hitStop(40);
    expect(r.advance(STEP_MS).steps).toBe(0);
    expect(r.advance(STEP_MS).steps).toBe(0);
    expect(r.advance(STEP_MS * 2).steps).toBeGreaterThan(0);
  });

  it('records exactly what the sim saw: the replay reproduces the live event stream', () => {
    const header = {
      seed: 9,
      contentHash: loadContentHash(),
      mode: { id: 'classic' as const, huntSeconds: 10 },
      inputKind: 'touch' as const,
    };
    const recorder = createRecorder(header);
    let cx = 2000;
    const sim = createSim({ seed: 9, content, mode: header.mode, inputKind: 'touch' });
    const r = new HuntRunner(sim, {
      maxStepsPerFrame: 5,
      recorder,
      perTick: (): Command[] => [{ t: 'cameraTarget', cx: (cx += 3.25) }],
    });
    const live: SimEvent[] = [];
    let frame = 0;
    while (!r.over) {
      if (frame % 9 === 0) r.queue({ t: 'fire', dx: (frame % 400) - 200, sy: 300 + (frame % 300) });
      if (frame % 50 === 0) r.queue({ t: 'reload' });
      live.push(...r.advance(frame % 3 === 0 ? 33 : 11).events);
      frame++;
    }
    const replay = runReplay(recorder.toLog(), content);
    expect(replay.eventHash).toBe(hashEvents(live));
    expect(replay.result.shots).toBeGreaterThan(10);
  });
});

describe('interpolation', () => {
  it('lerps birds by id and the camera; new birds snap to their position', () => {
    const sim = newSim(3);
    let prev = sim.snapshot();
    while (prev.birds.length === 0) {
      sim.step([]);
      prev = sim.snapshot();
    }
    sim.step([{ t: 'cameraTarget', cx: prev.cameraX + 10 }]);
    const cur = sim.snapshot();
    const half = interpolateBirds(prev, cur, 0.5);
    for (const d of half) {
      const p = prev.birds.find((b) => b.id === d.view.id);
      if (p) expect(d.x).toBeCloseTo((p.x + d.view.x) / 2, 6);
      else expect(d.x).toBe(d.view.x);
    }
    expect(interpolateCamera(prev, cur, 0.5)).toBe(prev.cameraX + 5);
    expect(interpolateBirds(prev, cur, 1).map((d) => d.x)).toEqual(cur.birds.map((b) => b.x));
  });
});
