// v1.3x (D-037) Skietbaan stats: hit counting from sim events, pellets per shot, group maths.
import { describe, expect, it } from 'vitest';
import { base, type Content } from '../../../tools/simHarness';
import { planeToDx } from '../../sim/camera';
import type { SimEvent } from '../../sim/events';
import { createRangeProgram } from '../../sim/range/program';
import { createSim } from '../../sim/Sim';
import {
  GROUP_IMPACTS,
  groupStats,
  hitRate,
  misses,
  pctOfBody,
  pelletsPerShot,
  RangeStats,
  type Impact,
  type RangeSelection,
} from './rangeStats';

const SEL: RangeSelection = { gun: 'dubbelloop', plane: 'mid', target: 'paper', pellets: 8 };
const shot = (shotId: number, tick = shotId): SimEvent[] => [
  { type: 'shotFired', tick, shotId, weapon: 'dubbelloop', dx: 0, sy: 500, shellsLeft: 1 },
  { type: 'rangeShot', tick, shotId, plane: 'mid', x: 100, y: 500 },
];
const paper = (shotId: number, x: number, y: number): SimEvent => ({
  type: 'paperHit',
  tick: shotId,
  shotId,
  paperId: 1,
  x,
  y,
});
const pellet = (shotId: number, birdId: number | null): SimEvent => ({
  type: 'pelletImpact',
  tick: shotId,
  shotId,
  dx: 0,
  sy: 0,
  birdId,
  propId: null,
  partId: null,
  crateId: null,
});

describe('group maths', () => {
  const at = (x: number, y: number): Impact => ({ x, y, aimX: 0, aimY: 0 });

  it('a single impact: no size, its offset is the centre', () => {
    expect(groupStats([at(3, -4)])).toEqual({
      n: 1,
      meanRadius: 0,
      extremeSpread: 0,
      offsetX: 3,
      offsetY: -4,
    });
    expect(groupStats([])).toBeNull();
  });

  it('a square of four: centre, mean radius and extreme spread', () => {
    const g = groupStats([at(10, 10), at(-10, 10), at(-10, -10), at(10, -10)]);
    expect(g?.offsetX).toBeCloseTo(0, 12);
    expect(g?.offsetY).toBeCloseTo(0, 12);
    expect(g?.meanRadius).toBeCloseTo(Math.SQRT2 * 10, 12);
    expect(g?.extremeSpread).toBeCloseTo(Math.hypot(20, 20), 12);
  });

  it('measures each impact from its own shot’s aim point', () => {
    // Two shots aimed 100 px apart, both striking 5 px right of their aim: a tight group, 5 px right.
    const g = groupStats([
      { x: 5, y: 0, aimX: 0, aimY: 0 },
      { x: 105, y: 0, aimX: 100, aimY: 0 },
    ]);
    expect(g?.extremeSpread).toBeCloseTo(0, 12);
    expect(g?.meanRadius).toBeCloseTo(0, 12);
    expect(g?.offsetX).toBeCloseTo(5, 12);
  });

  it('a line: extreme spread is the end-to-end length, mean radius the mean distance', () => {
    const g = groupStats([at(0, 0), at(0, 30), at(0, 60)]);
    expect(g?.offsetY).toBeCloseTo(30, 12);
    expect(g?.extremeSpread).toBeCloseTo(60, 12);
    expect(g?.meanRadius).toBeCloseTo(20, 12);
  });

  it('as a percentage of the body width', () => {
    expect(pctOfBody(55, 110)).toBe(50);
    expect(pctOfBody(10, 0)).toBe(0);
  });
});

describe('hit stats', () => {
  it('counts shots, hits (a shot with a pellet on target), misses and pellets per shot', () => {
    const s = new RangeStats();
    s.ingest([...shot(1), paper(1, 100, 500), paper(1, 104, 497), pellet(1, null)], SEL);
    s.ingest([...shot(2), pellet(2, null)], SEL);
    s.ingest([...shot(3), paper(3, 90, 510)], SEL);
    const c = s.cell(SEL);
    expect(c.shots).toBe(3);
    expect(c.hits).toBe(2);
    expect(misses(c)).toBe(1);
    expect(hitRate(c)).toBeCloseTo(2 / 3, 12);
    expect(c.pelletsOn).toBe(3);
    expect(pelletsPerShot(c)).toBe(1);
    expect(c.impacts.map((i) => [i.x - i.aimX, i.y - i.aimY])).toEqual([
      [0, 0],
      [4, -3],
      [-10, 10],
    ]);
  });

  it('bird targets: every pellet on a bird counts, the shot is a hit once', () => {
    const s = new RangeStats();
    const sel: RangeSelection = { ...SEL, target: 'flock' };
    s.ingest([...shot(1), pellet(1, 4), pellet(1, 4), pellet(1, 5), pellet(1, null)], sel);
    s.ingest([...shot(2), pellet(2, null)], sel);
    const c = s.cell(sel);
    expect([c.shots, c.hits, c.pelletsOn]).toEqual([2, 1, 3]);
    expect(c.impacts).toEqual([]);
  });

  it('a stone that lands frames later still counts for its own shot', () => {
    const s = new RangeStats();
    s.ingest(shot(1), SEL);
    s.ingest(shot(2), SEL);
    s.ingest([paper(1, 101, 500)], SEL);
    expect(s.cell(SEL).hits).toBe(1);
  });

  it('keeps the newest GROUP_IMPACTS impacts', () => {
    const s = new RangeStats();
    for (let i = 1; i <= GROUP_IMPACTS + 5; i++)
      s.ingest([...shot(i), paper(i, 100 + i, 500)], SEL);
    const imp = s.cell(SEL).impacts;
    expect(imp).toHaveLength(GROUP_IMPACTS);
    expect(imp[0]?.x).toBe(106);
    expect(imp.at(-1)?.x).toBe(100 + GROUP_IMPACTS + 5);
  });

  it('cells are per gun, distance and target; reset clears them all', () => {
    const s = new RangeStats();
    s.ingest(shot(1), SEL);
    s.newSession();
    s.ingest(shot(1), { ...SEL, gun: 'twee_twee:scope_small', plane: 'ver', pellets: 1 });
    expect(s.list().map((c) => `${c.gun} ${c.plane}`)).toEqual([
      'dubbelloop mid',
      'twee_twee:scope_small ver',
    ]);
    s.reset();
    expect(s.list()).toEqual([]);
  });
});

describe('through the real sim', () => {
  it('a Dubbelloop session on the paper: pellets on target match the sim’s paper hits', () => {
    const content = base as Content;
    const sim = createSim({
      seed: 9,
      content,
      mode: { id: 'range', biome: 'karoo-autumn', range: { plane: 'mid', target: 'paper' } },
      inputKind: 'pointer',
      rangeProgram: createRangeProgram,
    });
    const s = new RangeStats();
    const p = sim.snapshot().range?.papers[0];
    if (p === undefined) throw new Error('no paper');
    const sf = content.scoring.planes.mid.scrollFactor;
    let paperHits = 0;
    let fired = 0;
    for (let t = 0; t < 60 * 20; t++) {
      const w = sim.snapshot().weapon;
      const cmds =
        t % 40 === 0
          ? w.shells === 0
            ? [{ t: 'reload' as const }]
            : [{ t: 'fire' as const, dx: planeToDx(sim.snapshot().cameraX, sf, p.x) + 20, sy: p.y }]
          : [];
      sim.step(cmds);
      const ev = sim.drainEvents();
      paperHits += ev.filter((e) => e.type === 'paperHit').length;
      fired += ev.filter((e) => e.type === 'shotFired').length;
      s.ingest(ev, SEL);
    }
    const c = s.cell(SEL);
    expect(c.shots).toBe(fired);
    expect(c.pelletsOn).toBe(paperHits);
    expect(c.hits).toBeGreaterThan(0);
    // The group's centre is measured from the aim point: within the gun's spread of it (pellets
    // past the paper's edge pull it a little toward the centre).
    const g = groupStats(c.impacts);
    expect(g).not.toBeNull();
    expect(Math.abs(g?.offsetX ?? 99)).toBeLessThan(content.weapons.weapons[0]?.spreadPx ?? 70);
  });
});
