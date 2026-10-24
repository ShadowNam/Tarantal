// v1.3x (D-037) Skietbaan spawn program: the standing bird, the fly-over and the small flock
// for each plane, from modes.json range, and when each comes back.
import { describe, expect, it } from 'vitest';
import { base, ofType, type Content } from '../../../tools/simHarness';
import { planeToDx } from '../camera';
import { msToTicks } from '../clock';
import type { SimEvent } from '../events';
import { createSim, type Sim } from '../Sim';
import type { Command, PlaneId, RangeConfig } from '../types';
import { createRangeProgram } from './program';

const content = base as Content;
const setup = content.modes.modes.range;
const respawn = msToTicks(setup.respawnMs);
const PLANE_IDS: readonly PlaneId[] = ['near', 'mid', 'far', 'ver'];
const sf = (plane: PlaneId): number => content.scoring.planes[plane].scrollFactor;
const scale = (plane: PlaneId): number => content.scoring.planes[plane].scale;

function rangeSim(range: RangeConfig, weapon = 'dubbelloop', seed = 5): Sim {
  return createSim({
    seed,
    content,
    mode: { id: 'range', biome: 'karoo-autumn', weapon, range },
    inputKind: 'pointer',
    rangeProgram: createRangeProgram,
  });
}

function step(sim: Sim, ticks: number, first: readonly Command[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step(i === 0 ? first : []);
    out.push(...sim.drainEvents());
  }
  return out;
}

/** dx of a plane point from the screen centre for the sim's camera. */
const dxOf = (sim: Sim, plane: PlaneId, x: number): number =>
  planeToDx(sim.snapshot().cameraX, sf(plane), x);

describe('standing bird', () => {
  it('stands still at its spot on every plane, and comes back respawnMs after it is bagged', () => {
    for (const plane of ['near', 'mid', 'far'] as const) {
      // The air rifle: one pellet, no spread (a sure body shot).
      const sim = rangeSim({ plane, target: 'stand' }, 'windbuks');
      const b = sim.snapshot().birds[0];
      expect(b, plane).toBeDefined();
      if (b === undefined) continue;
      expect(b.creature).toBe(setup.creature);
      expect(b.plane).toBe(plane);
      expect(b.phase).toBe('alert');
      expect(dxOf(sim, plane, b.x)).toBeCloseTo(setup.spots[plane].stand.dx, 6);
      expect(b.y).toBe(setup.spots[plane].stand.y);
      // It doesn't move, even when shot at and missed nearby.
      step(sim, 90, [{ t: 'fire', dx: dxOf(sim, plane, b.x) + 400, sy: b.y }]);
      expect(sim.snapshot().birds[0]?.x).toBe(b.x);
      expect(sim.snapshot().birds[0]?.y).toBe(b.y);
      // Bagged (a body shot), then back after respawnMs.
      const hit = step(sim, 1, [
        { t: 'fire', dx: dxOf(sim, plane, b.x), sy: b.y + 10 * scale(plane) },
      ]);
      expect(ofType(hit, 'targetBagged'), plane).toHaveLength(1);
      expect(sim.snapshot().birds).toHaveLength(0);
      const back = step(sim, respawn + 1);
      const spawned = ofType(back, 'birdSpawned');
      expect(spawned).toHaveLength(1);
      expect(spawned[0]?.tick).toBe((ofType(hit, 'targetBagged')[0]?.tick ?? 0) + respawn);
    }
  });
});

describe('fly-over', () => {
  it('crosses the view on its lane, leaves past flyHalfPx and comes back the other way', () => {
    for (const plane of PLANE_IDS) {
      const sim = rangeSim({ plane, target: 'flyover' });
      sim.drainEvents();
      const first = sim.snapshot().birds[0];
      expect(first?.motion, plane).toBe('flyover');
      if (first === undefined) continue;
      expect(first.facing).toBe(1);
      expect(dxOf(sim, plane, first.x)).toBeLessThan(-setup.spots[plane].flyHalfPx);
      const ev = step(sim, 60 * 60);
      const gone = ofType(ev, 'birdDespawned');
      expect(gone.length, plane).toBeGreaterThan(1);
      expect(gone.every((g) => g.reason === 'exited')).toBe(true);
      // Each pass is followed respawnMs later by the next, alternating direction.
      const spawns = ofType(ev, 'birdSpawned');
      for (let i = 0; i < Math.min(gone.length, spawns.length); i++)
        expect(spawns[i]?.tick).toBe((gone[i]?.tick ?? 0) + respawn);
      // The first pass flew left → right: the passes after it alternate.
      const s = sim.snapshot().birds[0];
      if (s !== undefined) expect(s.facing).toBe(spawns.length % 2 === 1 ? -1 : 1);
    }
  });

  it('flies at the creature speed scaled to the plane (as in a hunt)', () => {
    const sim = rangeSim({ plane: 'mid', target: 'flyover' });
    const a = sim.snapshot().birds[0]?.x ?? 0;
    step(sim, 60);
    const b = sim.snapshot().birds[0]?.x ?? 0;
    const tarentaal = content.birds.creatures.find((c) => c.id === setup.creature);
    const fly = tarentaal !== undefined && 'speeds' in tarentaal ? (tarentaal.speeds?.fly ?? 0) : 0;
    expect(b - a).toBeCloseTo(fly, 6);
  });
});

describe('small flock', () => {
  it('forages at its spot on every plane (near uses the range lane)', () => {
    for (const plane of PLANE_IDS) {
      const sim = rangeSim({ plane, target: 'flock' });
      const s = sim.snapshot();
      expect(s.flocks, plane).toHaveLength(1);
      expect(s.flocks[0]?.state).toBe('forage');
      expect(s.birds).toHaveLength(setup.flockSize);
      const lane = setup.spots[plane].lane ?? content.biomes[0]?.lanes[plane];
      for (const b of s.birds) {
        expect(b.plane).toBe(plane);
        expect(b.y).toBeGreaterThanOrEqual(lane?.groundY?.[0] ?? NaN);
        expect(b.y).toBeLessThanOrEqual(lane?.groundY?.[1] ?? NaN);
        // Spread around the spot as a hunt flock is (birds.json spawnSpreadPx, scaled).
        const spread = content.birds.flockDefaults.spawnSpreadPx * (scale(plane) / scale('mid'));
        expect(Math.abs(dxOf(sim, plane, b.x) - setup.spots[plane].flockDx)).toBeLessThanOrEqual(
          spread,
        );
      }
    }
  });

  it('reacts to shots like a hunt flock; a new one comes respawnMs after the last bird falls', () => {
    const sim = rangeSim({ plane: 'mid', target: 'flock' }, 'windbuks');
    expect(ofType(sim.drainEvents(), 'flockSpawned')).toHaveLength(1);
    let ev: SimEvent[] = [];
    // Body shots at whichever bird is first, until the flock is gone (it alerts, runs, flushes).
    for (let i = 0; i < 400 && ofType(ev, 'flockRemoved').length === 0; i++) {
      const b = sim.snapshot().birds[0];
      const w = sim.snapshot().weapon;
      const cmds: Command[] =
        b === undefined
          ? []
          : w.shells === 0
            ? [{ t: 'reload' }]
            : [{ t: 'fire', dx: dxOf(sim, 'mid', b.x), sy: b.y + 10 * scale('mid') }];
      ev = ev.concat(step(sim, 30, cmds));
    }
    const states = ofType(ev, 'flockStateChanged').map((e) => e.to);
    expect(states).toContain('alert');
    const removed = ofType(ev, 'flockRemoved');
    expect(removed).toHaveLength(1);
    expect(removed[0]?.reason).toBe('bagged');
    ev = ev.concat(step(sim, respawn + 1));
    const next = ofType(ev, 'flockSpawned')[0];
    expect(next?.tick).toBe((removed[0]?.tick ?? 0) + respawn);
  });
});

describe('paper', () => {
  it('puts up no birds', () => {
    const sim = rangeSim({ plane: 'far', target: 'paper' });
    expect(step(sim, 600).some((e) => e.type === 'birdSpawned')).toBe(false);
    expect(sim.snapshot().range?.papers).toHaveLength(setup.spots.far.paper.length);
  });
});

describe('review fix: each paper and plate spot keeps its own y', () => {
  it('two spots at different heights stand at their own y', () => {
    const two = structuredClone(content);
    const near = two.modes.modes.range.spots.near;
    (near as { paper: { dx: number; y: number }[] }).paper = [
      { dx: -300, y: 650 },
      { dx: 300, y: 760 },
    ];
    (near as { plate: { dx: number; y: number }[] }).plate = [
      { dx: -300, y: 700 },
      { dx: 300, y: 780 },
    ];
    for (const target of ['paper', 'plate'] as const) {
      const sim = createSim({
        seed: 1,
        content: two,
        mode: { id: 'range', biome: 'karoo-autumn', range: { plane: 'near', target } },
        inputKind: 'pointer',
        rangeProgram: createRangeProgram,
      });
      const ys = (sim.snapshot().range?.papers ?? []).map((p) => p.y);
      expect(ys, target).toEqual(target === 'paper' ? [650, 760] : [700, 780]);
    }
  });
});
