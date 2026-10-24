import { describe, expect, it } from 'vitest';
import {
  impactSeed,
  makeMark,
  MARK_CAP,
  MARK_TRIM,
  markClass,
  markShape,
  markSize,
  MarkStore,
  newestLit,
  NEWEST_TICKS,
  targetIndices,
  targetKey,
  courseOf,
  swingAngle,
  type MarkImpact,
} from './rangeMarks';
import type { PaperView } from '../../sim/types';

const plate: PaperView = { id: 7, kind: 'plate', plane: 'mid', x: 1200, y: 640, r: 50 };
const key = targetKey({
  biome: 'karoo-autumn',
  course: 'plate',
  plane: 'mid',
  kind: 'plate',
  index: 0,
});

function impact(n: number, over: Partial<MarkImpact> = {}): MarkImpact {
  return { shotId: n, tick: 100 + n * 30, pellet: 0, x: 1200 + (n % 7), y: 640 - (n % 5), ...over };
}

describe('Skietbaan hit marks (D-040)', () => {
  it('a mark sits at its impact point on the target', () => {
    const m = makeMark(impact(1, { x: 1215, y: 630 }), plate, 0.16, 1);
    expect(m.u * plate.r + plate.x).toBeCloseTo(1215, 9);
    expect(m.v * plate.r + plate.y).toBeCloseTo(630, 9);
    expect(m.tick).toBe(130);
    // The same mark on a target placed elsewhere (another layout) keeps its spot on the face.
    const moved = { ...plate, x: 400, y: 500 };
    const again = makeMark(impact(1, { x: 415, y: 490 }), moved, 0.16, 1);
    expect(again.u).toBeCloseTo(m.u, 9);
    expect(again.v).toBeCloseTo(m.v, 9);
  });

  it('the shape comes from the impact: same impact, same shape; another pellet, another', () => {
    const a = impactSeed({ shotId: 3, tick: 400, pellet: 0 });
    expect(impactSeed({ shotId: 3, tick: 400, pellet: 0 })).toBe(a);
    expect(markShape(a)).toEqual(markShape(a));
    const b = impactSeed({ shotId: 3, tick: 400, pellet: 1 });
    const c = impactSeed({ shotId: 3, tick: 401, pellet: 0 });
    const d = impactSeed({ shotId: 4, tick: 400, pellet: 0 });
    expect(new Set([a, b, c, d]).size).toBe(4);
    expect(markShape(b)).not.toEqual(markShape(a));
    // A star with flecks, inside a sane radius.
    const s = markShape(a);
    expect(s.star.length).toBeGreaterThanOrEqual(14);
    expect(s.flecks.length).toBeGreaterThanOrEqual(3);
    for (const [x, y] of s.star) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
    for (const f of s.flecks) expect(Math.hypot(f.x, f.y)).toBeGreaterThan(1);
  });

  it('a shape is a pure function of the seed (pinned: replays and devices agree)', () => {
    const s = markShape(impactSeed({ shotId: 1, tick: 60, pellet: 0 }));
    const round = (n: number): number => Math.round(n * 1e6) / 1e6;
    expect({
      points: s.star.length,
      first: s.star[0]?.map(round),
      core: round(s.core),
      flecks: s.flecks.length,
    }).toMatchInlineSnapshot(`
      {
        "core": 0.395697,
        "first": [
          -0.212647,
          -0.83021,
        ],
        "flecks": 4,
        "points": 14,
      }
    `);
  });

  it('size: shot small, the .22 medium, the Langloop larger; scaled by plane', () => {
    expect(markClass('dubbelloop', 8)).toBe('shot');
    expect(markClass('twee_twee', 1)).toBe('rifle');
    expect(markClass('langloop', 1)).toBe('heavy');
    const near = (c: 'shot' | 'rifle' | 'heavy'): number => markSize('plate', c, 1, 100) * 100;
    expect(near('shot')).toBeLessThan(near('rifle'));
    expect(near('rifle')).toBeLessThan(near('heavy'));
    // At Ver (scale 0.1, r 10) the mark is a tenth as many px but the same share of the plate.
    expect(markSize('plate', 'rifle', 0.1, 10)).toBeCloseTo(markSize('plate', 'rifle', 1, 100), 9);
  });

  it('more than 20 hits all stay', () => {
    const store = new MarkStore();
    for (let n = 1; n <= 25; n++) store.add(key, makeMark(impact(n), plate, 0.16, 1));
    expect(store.count(key)).toBe(25);
    expect(store.marks(key)[0]?.tick).toBe(130);
  });

  it('marks are kept per target: another target, another list', () => {
    const store = new MarkStore();
    const other = targetKey({
      biome: 'karoo-autumn',
      course: 'plate',
      plane: 'near',
      kind: 'plate',
      index: 0,
    });
    store.add(key, makeMark(impact(1), plate, 0.16, 1));
    expect(store.count(other)).toBe(0);
    expect(store.count(key)).toBe(1);
  });

  it('the course is in the key: the mixed course keeps its own marks', () => {
    const near = { biome: 'karoo-autumn', plane: 'near', kind: 'plate', index: 0 } as const;
    const plateCourse = targetKey({
      ...near,
      course: courseOf({ plane: 'near', target: 'plate' }),
    });
    const mixed = targetKey({ ...near, course: courseOf({ plane: 'all', target: 'mixed' }) });
    expect(courseOf({ plane: 'all', target: 'mixed' })).toBe('mixed');
    expect(courseOf({ plane: 'near', target: 'paper' })).toBe('paper');
    expect(mixed).not.toBe(plateCourse);
    // Fresh targets on the mixed course clears its plate, not the plate course's.
    const store = new MarkStore();
    store.add(plateCourse, makeMark(impact(1), plate, 0.16, 1));
    store.add(mixed, makeMark(impact(2), plate, 0.16, 1));
    store.clear([mixed]);
    expect(store.count(mixed)).toBe(0);
    expect(store.count(plateCourse)).toBe(1);
    // Other areas keep theirs too.
    expect(targetKey({ ...near, biome: 'namibie', course: 'plate' })).not.toBe(plateCourse);
  });

  it('Repaint clears those targets; leaving clears them all', () => {
    const store = new MarkStore();
    const paper = targetKey({
      biome: 'karoo-autumn',
      course: 'paper',
      plane: 'mid',
      kind: 'paper',
      index: 0,
    });
    for (let n = 1; n <= 5; n++) {
      store.add(key, makeMark(impact(n), plate, 0.16, 1));
      store.add(paper, makeMark(impact(n), plate, 0.1, 1));
    }
    const e = store.epoch(key);
    store.clear([key]);
    expect(store.count(key)).toBe(0);
    expect(store.epoch(key)).not.toBe(e);
    expect(store.count(paper)).toBe(5);
    store.clear();
    expect(store.count(paper)).toBe(0);
  });

  it('the cap holds and keeps the newest', () => {
    const store = new MarkStore();
    const e = store.epoch(key);
    for (let n = 1; n <= MARK_CAP; n++) store.add(key, makeMark(impact(n), plate, 0.16, 1));
    expect(store.count(key)).toBe(MARK_CAP);
    expect(store.epoch(key)).toBe(e);
    for (let n = MARK_CAP + 1; n <= 1000; n++) store.add(key, makeMark(impact(n), plate, 0.16, 1));
    expect(store.count(key)).toBeLessThanOrEqual(MARK_CAP);
    expect(store.count(key)).toBeGreaterThanOrEqual(MARK_CAP - MARK_TRIM);
    expect(store.marks(key).at(-1)?.tick).toBe(impact(1000).tick);
    expect(store.epoch(key)).not.toBe(e);
  });

  it('target indices count per plane and kind, in the sim order', () => {
    const papers: PaperView[] = [
      { id: 1, kind: 'paper', plane: 'near', x: 0, y: 0, r: 120 },
      { id: 2, kind: 'plate', plane: 'near', x: 0, y: 0, r: 100 },
      { id: 3, kind: 'plate', plane: 'mid', x: 0, y: 0, r: 50 },
      { id: 4, kind: 'plate', plane: 'near', x: 0, y: 0, r: 100 },
    ];
    expect([...targetIndices(papers)]).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 1],
    ]);
  });

  it('the newest mark is lit briefly in its own session, then settles', () => {
    const marks = [makeMark(impact(1), plate, 0.16, 2), makeMark(impact(2), plate, 0.16, 2)];
    const t = impact(2).tick;
    expect(newestLit(marks, 2, t)).toBe(marks[1]);
    expect(newestLit(marks, 2, t + NEWEST_TICKS - 1)).toBe(marks[1]);
    expect(newestLit(marks, 2, t + NEWEST_TICKS)).toBeNull();
    // Back in another session (another setup): nothing glints.
    expect(newestLit(marks, 3, t)).toBeNull();
    expect(newestLit([], 2, t)).toBeNull();
  });

  it('the plate swings on sim time: same tick, same angle; it settles', () => {
    expect(swingAngle(0.32, 0)).toBeCloseTo(0.32, 9);
    expect(swingAngle(0.32, 250)).toBe(swingAngle(0.32, 250));
    expect(swingAngle(0.32, 100_000)).toBe(0);
    expect(swingAngle(0.32, -5)).toBe(0);
    expect(swingAngle(0, 100)).toBe(0);
  });
});
