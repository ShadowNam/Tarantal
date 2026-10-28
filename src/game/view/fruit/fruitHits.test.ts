import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeel } from '../../../content/feel';
import { loadFeel } from '../../../../tools/testContent';
import okavangoSpots from './spots/fruit-okavango-spring.json' with { type: 'json' };
import type { FruitSpot } from './fruitTypes';
import {
  blocked,
  fruitAim,
  fruitShot,
  pelletOnLayer,
  pelletsOnLayer,
  shotDriftPx,
  shotOnFruit,
  type Impact,
} from './fruitHits';

const feel = parseFeel(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', '..', '..', '..', 'content/client/feel.json'),
      'utf8',
    ),
  ),
);
if (!feel.ok) throw new Error('feel.json invalid');
const t = feel.feel.juice.fruit;
const box = { left: 100, top: 200, w: 20, h: 100 };

describe('fruit hits (v1.7c, D-047)', () => {
  it('maps a pellet to a layer the way the sim does (planeX = (cx − 960) × f + 960 + dx)', () => {
    expect(pelletOnLayer(2000, 0.6, 50, 400)).toEqual({ x: (2000 - 960) * 0.6 + 960 + 50, y: 400 });
  });

  it('counts pellets inside the padded box as hits and the next ring as near misses', () => {
    const s = shotOnFruit(
      box,
      [
        { x: 110, y: 250 },
        { x: 100 - t.hitPadPx, y: 250 },
        { x: 120 + t.hitPadPx + t.nearMissPx - 1, y: 250 },
        { x: 400, y: 250 },
      ],
      7,
      t,
    );
    // Their mean x is right of the centre: they push it left.
    expect(s).toEqual({ tick: 7, pellets: 2, nearMisses: 1, push: -1 });
  });

  it('pushes away from where the pellets came', () => {
    expect(shotOnFruit(box, [{ x: 119, y: 250 }], 0, t).push).toBe(-1);
    expect(shotOnFruit(box, [{ x: 101, y: 250 }], 0, t).push).toBe(1);
  });

  it('a pellet stopped in front of the fruit never reaches it', () => {
    expect(blocked(null, 1)).toBe(false);
    // A bird on the same plane is drawn above the layer: it shields the fruit.
    expect(blocked({ factor: 1, creature: true }, 1)).toBe(true);
    expect(blocked({ factor: 1.6, creature: false }, 1)).toBe(true);
    // A prop on the fruit's own layer (the tree's trunk occluder) does not.
    expect(blocked({ factor: 1, creature: false }, 1)).toBe(false);
    // Something behind the fruit's layer: the pellet passed the fruit first.
    expect(blocked({ factor: 0.6, creature: true }, 1)).toBe(false);
  });
});

describe('a shot on a fruit, composed (v1.7c review)', () => {
  const far = 0.6;
  const mid = 1;
  const still = { camX: 960, drift: 0, farFactor: far };

  it('maps each pellet onto the layer with the camera of the shot, a stone with its own', () => {
    const impacts = [
      { dx: 10, sy: 300, stop: null },
      { dx: 10, sy: 300, cx: 2000, stop: null },
    ];
    expect(pelletsOnLayer(impacts, mid, { ...still, camX: 1500 })).toEqual([
      pelletOnLayer(1500, mid, 10, 300),
      pelletOnLayer(2000, mid, 10, 300),
    ]);
  });

  it('leaves out pellets the sim stopped in front of the layer', () => {
    const impacts = [
      { dx: 0, sy: 0, stop: { factor: 1.2, creature: false } },
      { dx: 1, sy: 0, stop: { factor: mid, creature: true } },
      { dx: 2, sy: 0, stop: { factor: mid, creature: false } },
    ];
    expect(pelletsOnLayer(impacts, mid, still).map((p) => p.x)).toEqual([
      pelletOnLayer(960, mid, 2, 0).x,
    ]);
  });

  it('takes the wind drift off pellets that drifted, on layers in front of the far plane', () => {
    const drift = shotDriftPx({ dir: 1, strength: 0.5 }, 45, 1.5, 1);
    expect(drift).toBeCloseTo(33.75, 6);
    const f = { camX: 960, drift, farFactor: far };
    // Flew on (or stopped at or behind the far plane): the event's dx carries the drift.
    const flew = [{ dx: 100 + drift, sy: 0, stop: null }];
    const atFar = [{ dx: 100 + drift, sy: 0, stop: { factor: far, creature: true } }];
    // Stopped on something nearer: never drifted.
    const near = [{ dx: 100, sy: 0, stop: { factor: 1.2, creature: false } }];
    const onMid = (i: readonly Impact[]): number => pelletsOnLayer(i, mid, f)[0]?.x ?? NaN;
    const want = pelletOnLayer(960, mid, 100, 0).x;
    expect(onMid(flew)).toBeCloseTo(want, 6);
    expect(onMid(atFar)).toBeCloseTo(want, 6);
    // On the far plane itself the drifted x is the right one.
    expect(pelletsOnLayer(flew, far, f)[0]?.x).toBeCloseTo(
      pelletOnLayer(960, far, 100 + drift, 0).x,
      6,
    );
    // A pellet stopped in front of mid is not on mid at all.
    expect(pelletsOnLayer(near, mid, f)).toEqual([]);
    expect(shotDriftPx(null, 45, 1, 1)).toBe(0);
  });

  it('turns the pellets into a swinging fruit’s frame: hit where it is drawn', () => {
    const frame = { fw: 10, fh: 60, ox: 5, oy: 0 };
    const pivot = { x: 100, y: 100 };
    // At rest the body hangs straight down from the pivot.
    const rest = fruitShot(frame, pivot, 0, [{ x: 100, y: 150 }], 0, t);
    expect(rest.pellets).toBe(1);
    // Swung 90° clockwise, the body lies to the left of the pivot: the old spot is empty.
    const a = Math.PI / 2;
    expect(fruitShot(frame, pivot, a, [{ x: 100, y: 150 }], 0, t).pellets).toBe(0);
    expect(fruitShot(frame, pivot, a, [{ x: 50, y: 100 }], 0, t).pellets).toBe(1);
  });
});

const okavango = okavangoSpots as unknown as FruitSpot[];

describe('the aim point lies inside the drop hit area (1.9.4, review F1)', () => {
  const t = loadFeel().juice.fruit;
  it('every sausage, at rest and swinging either way', () => {
    const sausages = okavango.filter((s) => s.species === 'sausage');
    expect(sausages.length).toBeGreaterThan(4);
    for (const s of sausages)
      for (const angle of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const pivot = { x: s.x + s.ax, y: s.y + s.ay };
        const aim = fruitAim(s, pivot, angle);
        const shot = fruitShot(s, pivot, angle, [aim], 100, { ...t, hitPadPx: 0 });
        expect(shot.pellets, `sausage at (${s.x}, ${s.y}), angle ${angle}`).toBe(1);
      }
  });

  it('the sausages are drawn big enough to hit (main: 72–90 px tall; review T4)', () => {
    const sausages = okavango.filter((s) => s.species === 'sausage');
    expect(Math.max(...sausages.map((s) => s.fh))).toBeGreaterThanOrEqual(90);
    expect(Math.min(...sausages.map((s) => s.fw))).toBeGreaterThanOrEqual(14);
  });
});
