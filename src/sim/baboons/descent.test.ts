// v1.18 (D-081): in the Harvest a raid comes down where you can see it — the raiders scramble down
// the koppie (a zig-zag on the troop's layer), run across the veld, then dash into the rows.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../events';
import { createRng } from '../rng';
import type { BaboonsView } from '../types';
import { zigzag } from './baboons';
import { createBaboonSystem } from './system';

const content = loadContent();
const oes = content.biomes.find((b) => b.id === 'oes');
const karoo = content.biomes.find((b) => b.id === 'karoo-autumn');

function setup(biomeId: 'oes' | 'karoo', seed = 7) {
  const biome = biomeId === 'oes' ? oes : karoo;
  if (biome === undefined) throw new Error('no biome');
  const events: SimEvent[] = [];
  let tick = 0;
  const sys = createBaboonSystem(
    biome,
    content,
    { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    createRng(seed).stream('baboons'),
    {
      tick: () => tick,
      emit: (e) => {
        events.push(e);
      },
      awardBonus: () => 0,
      basePoints: () => 10,
      penalty: () => undefined,
      threatenNear: () => [],
      ranged: false,
    },
  );
  if (sys === null) throw new Error('no troop');
  const step = (): BaboonsView => {
    sys.step();
    tick++;
    return sys.view();
  };
  return { sys, events, step };
}

describe('zigzag (v1.18, D-081)', () => {
  it('starts at the seat, ends at the foot, and swings either side between', () => {
    const a = { x: 100, y: 450 };
    const b = { x: 500, y: 650 };
    expect(zigzag(a, b, 4, 30, 0)).toMatchObject({ x: 100, y: 450 });
    expect(zigzag(a, b, 4, 30, 1)).toMatchObject({ x: 500, y: 650 });
    expect(zigzag(a, b, 4, 30, 0.25).x).toBeCloseTo(230);
    expect(zigzag(a, b, 4, 30, 0.5).x).toBeCloseTo(270);
    // Always downhill.
    let y = -Infinity;
    for (let f = 0; f <= 1; f += 0.05) {
      const p = zigzag(a, b, 4, 30, f);
      expect(p.y).toBeGreaterThanOrEqual(y);
      y = p.y;
    }
  });
});

describe('the Harvest raid comes down in sight (v1.18, D-081)', () => {
  it('climbs down the koppie, crosses the veld, then dashes into the rows', () => {
    const d = oes?.baboons?.descent;
    if (d === undefined) throw new Error('no descent');
    const { step } = setup('oes');
    const seen = { climb: 0, run: 0, dash: 0 };
    let lastClimbY = -Infinity;
    let raidId = -1;
    for (let k = 0; k < 60 * 30; k++) {
      const v = step();
      for (const x of v.descenders) {
        if (raidId === -1) raidId = x.raidId;
        if (x.raidId !== raidId) continue;
        if (x.pose === 'climb') {
          expect(x.layerId).toBe('far_ridge');
          expect(x.y).toBeGreaterThanOrEqual(lastClimbY - 1e-9);
          if (x.id === v.descenders[0]?.id) lastClimbY = x.y;
          expect(x.y).toBeLessThanOrEqual(d.footY + 1e-9);
          seen.climb++;
        } else {
          expect(x.layerId).toBe(d.veldLayer);
          expect(x.y).toBeGreaterThanOrEqual(d.veldY[0] - 1e-9);
          expect(x.y).toBeLessThanOrEqual(d.veldY[1] + 1e-9);
          seen.run++;
        }
      }
      for (const r of v.raiders)
        if (r.raidId === raidId && r.phase === 'approach') {
          expect(r.dash).toBe(true);
          seen.dash++;
        }
      if (seen.dash > 0 && v.raid?.id !== raidId) break;
    }
    expect(seen.climb).toBeGreaterThan(60);
    expect(seen.run).toBeGreaterThan(30);
    expect(seen.dash).toBeGreaterThan(0);
  });

  it('dashes faster than a walk: the approach takes under half the walk time', () => {
    const T = content.birds.baboons.raids;
    const d = oes?.baboons?.descent;
    if (d === undefined) throw new Error('no descent');
    const { step } = setup('oes', 11);
    let start = -1;
    let id = -1;
    for (let k = 0; k < 60 * 40; k++) {
      const v = step();
      const r = v.raiders.find((x) => x.phase === 'approach' && (id === -1 || x.id === id));
      if (r !== undefined && start === -1) {
        start = k;
        id = r.id;
      }
      if (start !== -1 && v.raiders.find((x) => x.id === id)?.phase !== 'approach') {
        const ticks = k - start;
        const walk = (T.approachPx / T.walkPxPerSec) * 60;
        expect(ticks).toBeLessThan(walk / 2);
        return;
      }
    }
    throw new Error('no approach seen');
  });

  it('is deterministic for a seed', () => {
    const a = setup('oes', 3);
    const b = setup('oes', 3);
    for (let k = 0; k < 60 * 20; k++) expect(a.step()).toEqual(b.step());
  });

  it('leaves maps without a descent as they were (no descenders, no dash)', () => {
    const { step } = setup('karoo');
    for (let k = 0; k < 60 * 60; k++) {
      const v = step();
      expect(v.descenders).toHaveLength(0);
      for (const r of v.raiders) expect(r.dash).toBe(false);
    }
  });
});
