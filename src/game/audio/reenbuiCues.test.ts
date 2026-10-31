// v1.10 (D-067): Reënbui in the soundscape — the room it makes (every call quiet from the build-up
// until the rain has eased, from the sim's own phase ticks), and its own cues on sim ticks: each
// played once in order at 20 ticks a frame (the perf smoke's regime) and at 60 fps, none with the
// Kalahari storm that the storm already makes (thunder, rain), a late cue skipped.
import { describe, expect, it } from 'vitest';
import { loadSoundscapeContent } from './soundscapeRuntime';
import { SoundscapeDirector, type CallOutcome, type SoundscapeSink } from './soundscape';
import { cueTimes, makingRoom, ReenbuiCues, type ReenbuiTiming } from './reenbuiCues';

const sc = loadSoundscapeContent();
const cfg = sc.reenbui;
const PLAN: ReenbuiTiming = {
  buildupTick: 1200,
  dropsTick: 1560,
  swarmTick: 1740,
  easingTick: 2640,
  endTick: 2880,
  withStorm: false,
};

describe('Reënbui sounds (D-067)', () => {
  it('makes room from quietBeforeMs before the build-up to quietAfterMs after the rain', () => {
    const before = Math.round((cfg.quietBeforeMs * 60) / 1000);
    const after = Math.round((cfg.quietAfterMs * 60) / 1000);
    expect(makingRoom(cfg, PLAN, PLAN.buildupTick - before - 1)).toBe(false);
    expect(makingRoom(cfg, PLAN, PLAN.buildupTick - before)).toBe(true);
    expect(makingRoom(cfg, PLAN, PLAN.swarmTick)).toBe(true);
    expect(makingRoom(cfg, PLAN, PLAN.endTick + after - 1)).toBe(true);
    expect(makingRoom(cfg, PLAN, PLAN.endTick + after)).toBe(false);
    expect(makingRoom(cfg, null, PLAN.swarmTick)).toBe(false);
  });

  it('the soundscape plays none of its calls inside the room, and plays again after', () => {
    const areas = Object.fromEntries(
      Object.entries(sc.areas).map(([a, l]) => [a, l.map((e) => ({ ...e, perMinute: 20 }))]),
    );
    const d = new SoundscapeDirector({ ...sc, areas, jitter: 1 }, true);
    d.start({
      area: 'kalahari-summer',
      light: 'midday',
      hazeDb: 0,
      seed: 7,
      title: false,
      startTick: 0,
    });
    const played: number[] = [];
    const sink: SoundscapeSink = {
      play(c): CallOutcome {
        played.push(c.at);
        return 'played';
      },
      quiet: () => false,
      room: (t) => makingRoom(cfg, PLAN, t),
    };
    for (let t = 20; t <= 6000; t += 20) d.step(t, sink);
    expect(played.some((t) => t < PLAN.buildupTick)).toBe(true);
    expect(played.some((t) => t > PLAN.endTick + 200)).toBe(true);
    for (const t of played) expect(makingRoom(cfg, PLAN, t)).toBe(false);
    expect(d.counts.quiet).toBeGreaterThan(0);
  });

  it('plays each cue once, in order, at 20 ticks a frame and at 60 fps', () => {
    const want = cueTimes(cfg, PLAN);
    expect(want.length).toBeGreaterThanOrEqual(8);
    for (const per of [1, 20]) {
      const c = new ReenbuiCues(cfg);
      c.reset(PLAN, 0);
      const got: string[] = [];
      for (let t = 0; t <= 3200; t += per)
        c.step(t, (cue) => {
          got.push(cue.call);
          return 'played';
        });
      expect(got).toEqual(want.map((w) => cfg.cues[w.cue]?.call));
      expect(c.counts.late).toBe(0);
    }
    // Every cue inside its phase.
    for (const w of want) {
      expect(w.tick).toBeGreaterThanOrEqual(PLAN.buildupTick);
      expect(w.tick).toBeLessThan(PLAN.endTick);
    }
    // Thunder rolls in during the build-up; the excited birds call in the swarm.
    const callAt = (call: string): number[] =>
      want.filter((w) => cfg.cues[w.cue]?.call === call).map((w) => w.tick);
    expect(callAt('reenbui_thunder').some((t) => t < PLAN.dropsTick)).toBe(true);
    expect(callAt('reenbui_birds').every((t) => t >= PLAN.swarmTick && t < PLAN.easingTick)).toBe(
      true,
    );
  });

  it('with the Kalahari storm: no thunder or rain of its own, the buzz and birds still', () => {
    const storm = { ...PLAN, buildupTick: 1740, dropsTick: 1740, withStorm: true };
    const calls = new Set(cueTimes(cfg, storm).map((w) => cfg.cues[w.cue]?.call));
    expect(calls.has('reenbui_thunder')).toBe(false);
    expect(calls.has('reenbui_rain')).toBe(false);
    expect(calls.has('reenbui_buzz')).toBe(true);
    expect(calls.has('reenbui_birds')).toBe(true);
  });

  it('skips a cue more than lateMs late (a stalled or held frame) instead of playing it late', () => {
    const c = new ReenbuiCues(cfg);
    c.reset(PLAN, 0);
    const got: string[] = [];
    c.step(PLAN.swarmTick + 600, (cue) => {
      got.push(cue.call);
      return 'played';
    });
    expect(got.length).toBeLessThanOrEqual(2);
    expect(c.counts.late).toBeGreaterThan(3);
  });
});
