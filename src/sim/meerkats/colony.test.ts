// v1.7 (D-044): a dash runs in a file about one body length apart (content's dash.gapBodyMul),
// and its halfway stop shows it: the whole file stands there in a row.
import { describe, expect, it } from 'vitest';
import { base } from '../../../tools/simHarness';
import { createStream } from '../rng';
import { createColony, dash, stepColony, type ColonyCtx } from './colony';

describe('meerkat dash file (v1.7, D-044)', () => {
  it('the file stops halfway in a row one body length apart', () => {
    const T = structuredClone(base.birds.meerkats);
    // Nobody else does anything while the file runs; a long halfway stop.
    T.activities = { sit: 1, sentinel: 0, forage: 0, sunbathe: 0, dash: 0, dive: 0 };
    T.activitySeconds.sit = [60, 60];
    T.dash.pauseSeconds = [5, 5];
    const rng = createStream(3);
    let id = 0;
    const c = createColony(
      {
        id: 'test',
        layer: 'mid',
        u: 0.5,
        y: 900,
        burrows: [
          { dx: -200, mound: 10 },
          { dx: 0, mound: 20 },
          { dx: 200, mound: 10 },
        ],
        family: [4, 4],
      },
      { id: 'mid', scrollFactor: 1, plane: 'near' },
      1,
      T,
      rng,
      () => ++id,
      false,
    );
    const ctx: ColonyCtx = { tuning: T, rng, sunbathe: false, calm: false };
    const hole = c.burrows[2];
    if (hole === undefined) throw new Error('no burrow');
    // The leader at the right-hand hole, two calm ones sitting behind it, one down below.
    c.meerkats.forEach((m, i) => {
      m.burrow = 2;
      m.x = hole.x + 70 * i;
      m.y = c.ground;
      m.pose = i < 3 ? 'sit' : 'hidden';
      m.t = 0;
      m.dur = 3600;
    });
    const [leader] = c.meerkats;
    if (leader === undefined) throw new Error('no meerkat');
    T.dash.group = [3, 3];
    dash(c, leader, ctx);
    const gap = T.bodyWidthPx * T.dash.gapBodyMul;
    let row: number[] = [];
    for (let t = 0; t < 600 && row.length < 3; t++) {
      stepColony(c, ctx);
      row = c.meerkats
        .filter((m) => m.pose === 'stand')
        .map((m) => m.x)
        .sort((a, b) => a - b);
    }
    expect(row).toHaveLength(3);
    expect((row[1] ?? 0) - (row[0] ?? 0)).toBeCloseTo(gap, 6);
    expect((row[2] ?? 0) - (row[1] ?? 0)).toBeCloseTo(gap, 6);
  });
});
