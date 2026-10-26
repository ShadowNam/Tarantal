import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeel } from '../../../content/feel';
import { blocked, pelletOnLayer, shotOnFruit } from './fruitHits';

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
