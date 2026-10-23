// v1.2 (D-033): day-of-week maps and the Verder bonus map.
import { describe, expect, it } from 'vitest';
import { WEEKDAY_IDS, type Biome } from '../content/schemas';
import { loadContent } from '../../tools/testContent';
import { createBot } from '../../tools/bots';
import { createEventHasher } from './events';
import { findLayout, mapLights, mapOmen, resolveMap } from './maps';
import { createSim } from './Sim';
import type { Command, ModeConfig } from './types';

const content = loadContent();
const biome = (id: string): Biome => {
  const b = content.biomes.find((x) => x.id === id);
  if (b === undefined) throw new Error(id);
  return b;
};
const karoo = biome('karoo-autumn');

/** A scripted hunt (a shot every 0.5 s), its event hash and result. */
function play(seed: number, mode: ModeConfig): { hash: string; score: number } {
  const sim = createSim({ seed, content, mode, inputKind: 'pointer' });
  const h = createEventHasher();
  h.add(sim.drainEvents());
  while (!sim.isOver()) {
    const cmds: Command[] =
      sim.tick % 30 === 0
        ? [{ t: 'fire', dx: 0, sy: 720 }]
        : sim.tick % 30 === 15
          ? [{ t: 'reload' }]
          : [];
    sim.step(cmds);
    h.add(sim.drainEvents());
  }
  return { hash: h.digest(), score: sim.result().score };
}

/** Home x of each mid flock after the warm-up, played by the competent bot. */
function flockHomes(seed: number, layout: string | undefined): number[] {
  const mode: ModeConfig = layout === undefined ? { id: 'classic' } : { id: 'classic', layout };
  const sim = createSim({ seed, content, mode, inputKind: 'pointer' });
  const bot = createBot('competent', seed, content, 'pointer');
  const seen = new Set<number>();
  const out: number[] = [];
  while (!sim.isOver()) {
    sim.step(bot.next(sim.snapshot()));
    sim.drainEvents();
    const snap = sim.snapshot();
    for (const f of snap.flocks) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const b = snap.birds.find((x) => x.flockId === f.id);
      if (sim.tick > 1 && b?.plane === 'mid') out.push(b.x);
    }
  }
  return out;
}

describe('maps (v1.2)', () => {
  it('every biome has the seven weekday layouts in order and a Verder', () => {
    for (const b of content.biomes) {
      expect(
        b.layouts.map((l) => l.id),
        b.id,
      ).toEqual([...WEEKDAY_IDS]);
      expect(
        b.bonusMaps.map((x) => x.id),
        b.id,
      ).toContain('verder');
    }
  });

  it('no layout is the biome as it is', () => {
    const m = resolveMap(karoo, undefined, undefined);
    expect(m.biome).toBe(karoo);
    expect(m).toMatchObject({ layout: null, bonus: null, weather: 'default', pointsMul: 1 });
  });

  it('a layout moves props, sets spots and routes; the base biome is untouched', () => {
    const fri = resolveMap(karoo, 'fri', undefined);
    const windpomp = fri.biome.props.find((p) => p.id === 'windpomp');
    expect(windpomp?.u).toBe(0.7);
    // The secret travels with its prop.
    expect(windpomp?.secret).toEqual(karoo.props.find((p) => p.id === 'windpomp')?.secret);
    expect(fri.biome.feedingSpots?.length).toBeGreaterThan(0);
    expect(karoo.props.find((p) => p.id === 'windpomp')?.u).toBe(0.22);
    expect(karoo.feedingSpots).toBeUndefined();
  });

  it('pacing multipliers, flock targets and the wind compound: layout, then bonus map', () => {
    const thu = resolveMap(karoo, 'thu', undefined);
    const verder = resolveMap(karoo, 'thu', 'verder');
    const k0 = karoo.pacing.keyframes[1];
    const t0 = thu.biome.pacing.keyframes[1];
    const v0 = verder.biome.pacing.keyframes[1];
    expect(t0?.flyoversPerMin).toBeCloseTo((k0?.flyoversPerMin ?? 0) * 1.1);
    expect(v0?.popupsPerMin).toBeCloseTo((k0?.popupsPerMin ?? 0) * 0.35);
    expect(v0?.flocks).toEqual({ far: 1 });
    const w = karoo.omen.wind?.strength ?? [0, 0];
    expect(verder.biome.omen.wind?.strength[1]).toBeCloseTo(w[1] * 1.3 * 1.5);
    expect(verder.biome.flyovers?.planeWeights).toEqual({ mid: 1, far: 3 });
    expect(mapLights(verder)).toEqual(['golden', 'verder_haze']);
  });

  it('weather: an explicit mode setting wins, then the map, then the mode default', () => {
    expect(mapOmen('calm', undefined, true)).toBe(false);
    expect(mapOmen('omen', undefined, false)).toBe(true);
    expect(mapOmen('default', undefined, true)).toBe(true);
    expect(mapOmen('calm', true, false)).toBe(true);
    // Monday is calm: no wind even in the Daily; Thursday's wind blows in Classic too.
    const mon = createSim({
      seed: 1,
      content,
      mode: { id: 'daily', layout: 'mon' },
      inputKind: 'pointer',
    });
    expect(mon.snapshot().wind).toBeNull();
    const thu = createSim({
      seed: 1,
      content,
      mode: { id: 'classic', layout: 'thu' },
      inputKind: 'pointer',
    });
    expect(thu.snapshot().wind).not.toBeNull();
  });

  it('rejects unknown ids, a bonus map without a layout, and a layout outside Classic/Daily', () => {
    expect(() => resolveMap(karoo, 'xyz', undefined)).toThrow();
    expect(() => resolveMap(karoo, 'mon', 'nope')).toThrow();
    expect(() => resolveMap(karoo, undefined, 'verder')).toThrow();
    expect(() =>
      createSim({ seed: 1, content, mode: { id: 'ftue', layout: 'mon' }, inputKind: 'pointer' }),
    ).toThrow();
  });

  it('the same map replays identically; another layout plays differently', () => {
    const a = play(7, { id: 'classic', layout: 'tue' });
    expect(play(7, { id: 'classic', layout: 'tue' })).toEqual(a);
    expect(play(7, { id: 'classic', layout: 'sat' }).hash).not.toBe(a.hash);
  });

  it('a dusk map (pointsMul) pays more per bird', () => {
    const sat = resolveMap(karoo, 'sat', undefined);
    expect(sat.pointsMul).toBe(1.15);
    expect(findLayout(karoo, 'sat')?.light).toBe('dusk');
  });

  it('feeding spots: later mid flocks forage in the spot far more often than without one', () => {
    // Friday's mid spot is u 0.64–0.82 of the 3840 px mid layer. A flock spawns there whenever
    // the spot is out of view, else anywhere hidden.
    const inSpot = (layout: string | undefined): number => {
      let n = 0;
      let all = 0;
      for (const seed of [11, 12, 13, 14]) {
        for (const x of flockHomes(seed, layout)) {
          all++;
          if (x >= 0.64 * 3840 - 150 && x <= 0.82 * 3840 + 150) n++;
        }
      }
      return n / all;
    };
    const base = inSpot(undefined);
    const fri = inSpot('fri');
    expect(fri).toBeGreaterThan(0.4);
    expect(fri).toBeGreaterThan(base * 2);
  });
});
