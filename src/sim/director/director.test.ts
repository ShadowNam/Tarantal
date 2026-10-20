import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createRng } from '../rng';
import { scheduleWorldEvents } from './events';
import { flockTargetsAt, pacingAt } from './pacing';

const biome = loadContent().biomes[0];
if (biome === undefined) throw new Error('no biome');

describe('pacing', () => {
  it('interpolates keyframes by hunt fraction', () => {
    expect(pacingAt(biome.pacing, 0, false)).toEqual({ flyoversPerMin: 3, popupsPerMin: 2 });
    expect(pacingAt(biome.pacing, 0.5, false)).toEqual({ flyoversPerMin: 5, popupsPerMin: 5 });
    const mid = pacingAt(biome.pacing, (0.5 + 0.83) / 2, false);
    expect(mid.flyoversPerMin).toBeCloseTo(5.5, 9);
    expect(pacingAt(biome.pacing, 1, false)).toEqual({ flyoversPerMin: 6, popupsPerMin: 6 });
  });

  it('flock targets step at each keyframe (warm-up → build), never interpolated', () => {
    const keys = biome.pacing.keyframes;
    const k1 = keys[1];
    if (k1 === undefined) throw new Error('need two keyframes');
    const at = (t: number) => flockTargetsAt(biome.pacing, t);
    expect(at(0)).toEqual({
      near: 0,
      mid: keys[0]?.flocks.mid ?? 0,
      far: keys[0]?.flocks.far ?? 0,
    });
    expect(at(k1.t - 0.001)).toEqual(at(0));
    expect(at(k1.t)).toEqual({ near: 0, mid: k1.flocks.mid ?? 0, far: k1.flocks.far ?? 0 });
    const last = keys[keys.length - 1];
    expect(at(1)).toEqual({ near: 0, mid: last?.flocks.mid ?? 0, far: last?.flocks.far ?? 0 });
  });

  it('switches to the surge profile during the Stampede', () => {
    expect(pacingAt(biome.pacing, 0.9, true)).toEqual(biome.pacing.stampede);
  });
});

describe('world-event schedule', () => {
  it('is fixed by the seed and sorted by tick', () => {
    const a = scheduleWorldEvents(biome, 'classic', false, 5400, createRng(7).stream('events'));
    const b = scheduleWorldEvents(biome, 'classic', false, 5400, createRng(7).stream('events'));
    expect(a).toEqual(b);
    expect(a.map((e) => e.tick)).toEqual([...a.map((e) => e.tick)].sort((x, y) => x - y));
  });

  it('respects windows, counts, mode filters and omen-only events', () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = scheduleWorldEvents(
        biome,
        'classic',
        false,
        5400,
        createRng(seed).stream('events'),
      );
      expect(s.filter((e) => e.id === 'cropSprayer')).toHaveLength(1);
      expect(s.filter((e) => e.id === 'bossAppearance')).toHaveLength(1);
      expect(s.some((e) => e.id === 'dustDevil')).toBe(false);
      for (const e of s) {
        const def = biome.events[e.index];
        expect(e.tick).toBeGreaterThanOrEqual(Math.floor((def?.window[0] ?? 0) * 5400));
        expect(e.tick).toBeLessThanOrEqual(Math.floor((def?.window[1] ?? 1) * 5400));
      }
    }
    const season = scheduleWorldEvents(
      biome,
      'seasonHunt',
      true,
      3600,
      createRng(1).stream('events'),
    );
    expect(season.some((e) => e.id === 'bossAppearance')).toBe(false);
    expect(season.filter((e) => e.id === 'dustDevil').length).toBeGreaterThanOrEqual(2);
  });
});
