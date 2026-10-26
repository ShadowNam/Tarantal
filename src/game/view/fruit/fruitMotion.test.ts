import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFeel } from '../../../content/feel';
import {
  RESTING,
  fallPlan,
  fruitPose,
  hitFruit,
  landTick,
  swingAngle,
  swingEnvelope,
  type FruitTuning,
  type ShotOnFruit,
} from './fruitMotion';
import type { FruitSpot } from './fruitTypes';

const feel = parseFeel(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', '..', '..', '..', 'content/client/feel.json'),
      'utf8',
    ),
  ),
);
if (!feel.ok) throw new Error('feel.json invalid');
const t: FruitTuning = feel.feel.juice.fruit;

/** A sausage on a stalk: pivot at the top, 20 × 110, ground 300 px below. */
const sausage: FruitSpot = {
  species: 'sausage',
  motion: 'hang',
  on: 'okavango/sausage_tree',
  prop: true,
  x: 0,
  y: 0,
  ground: 300,
  fx: 0,
  fy: 0,
  tw: 40,
  th: 220,
  fw: 20,
  fh: 110,
  ox: 10,
  oy: 2,
  res: 2,
  ax: 0,
  ay: 0,
  stalk: null,
  trunk: null,
};
const melon: FruitSpot = {
  ...sausage,
  species: 'nara',
  motion: 'ground',
  ground: 0,
  fw: 16,
  fh: 15,
  oy: 15,
};
const shot = (tick: number, pellets: number, push = 1, nearMisses = 0): ShotOnFruit => ({
  tick,
  pellets,
  nearMisses,
  push,
});

describe('fruit swing (v1.7c, D-047)', () => {
  it('a one-pellet hit swings it, and the swing dies down within swingSeconds', () => {
    const s = hitFruit(RESTING, 'hang', shot(100, 1), t, false);
    expect(s.dropTick).toBeNull();
    const peak = Math.max(
      ...Array.from({ length: 60 }, (_, k) => Math.abs(swingAngle(s.hits, 100 + k, t))),
    );
    expect(peak).toBeGreaterThan(((t.swingDeg * Math.PI) / 180) * 0.5);
    const late = 100 + Math.round(t.swingSeconds * 60);
    expect(swingEnvelope(s.hits, late, t)).toBeLessThan(((t.swingDeg * Math.PI) / 180) * 0.06);
    expect(swingAngle(s.hits, 100, t)).toBe(0);
  });

  it('a hanging fruit pushed right swings its bottom right (counter-clockwise first)', () => {
    const s = hitFruit(RESTING, 'hang', shot(0, 1, 1), t, false);
    expect(swingAngle(s.hits, 8, t)).toBeLessThan(0);
    const l = hitFruit(RESTING, 'hang', shot(0, 1, -1), t, false);
    expect(swingAngle(l.hits, 8, t)).toBeGreaterThan(0);
  });

  it('a near miss swings it less than a hit, and never drops it', () => {
    const near = hitFruit(RESTING, 'hang', shot(0, 0, 1, 3), t, false);
    const hit = hitFruit(RESTING, 'hang', shot(0, 1), t, false);
    expect(Math.abs(near.hits[0]?.amp ?? 0)).toBeLessThan(Math.abs(hit.hits[0]?.amp ?? 0));
    const again = hitFruit(near, 'hang', shot(5, 0, 1, 3), t, false);
    expect(again.dropTick).toBeNull();
  });

  it('reduce motion swings smaller', () => {
    const a = hitFruit(RESTING, 'hang', shot(0, 1), t, true);
    const b = hitFruit(RESTING, 'hang', shot(0, 1), t, false);
    expect(Math.abs(a.hits[0]?.amp ?? 0)).toBeLessThan(Math.abs(b.hits[0]?.amp ?? 0));
  });

  it('is a pure function of the tick: the same tick gives the same pose', () => {
    const s = hitFruit(RESTING, 'hang', shot(10, 1), t, false);
    expect(fruitPose(sausage, s, 37, t, false)).toEqual(fruitPose(sausage, s, 37, t, false));
  });
});

describe('fruit drop (v1.7c, D-047)', () => {
  it('dropPellets pellets in one shot snap it off', () => {
    const s = hitFruit(RESTING, 'hang', shot(50, t.dropPellets), t, false);
    expect(s.dropTick).toBe(50);
  });

  it('a second hit while it still swings snaps it off; one after it has settled does not', () => {
    const first = hitFruit(RESTING, 'hang', shot(0, 1), t, false);
    expect(hitFruit(first, 'hang', shot(20, 1), t, false).dropTick).toBe(20);
    const settled = Math.round(t.swingSeconds * 60) + 60;
    expect(hitFruit(first, 'hang', shot(settled, 1), t, false).dropTick).toBeNull();
  });

  it('falls with gravity, lands on its ground line, bounces, rolls and lies there', () => {
    const s = hitFruit(RESTING, 'hang', shot(0, t.dropPellets, 1), t, false);
    const plan = fallPlan(sausage, 1, t, false);
    expect(plan.height).toBe(300 - 10);
    const land = landTick(sausage, s, t, false) ?? -1;
    expect(land).toBe(Math.round(plan.land * 60));
    expect(fruitPose(sausage, s, land - 5, t, false).by).toBeLessThan(plan.height);
    expect(plan.speeds.length).toBe(t.bounces);
    // In the first bounce it is off the ground again.
    const bounce = Math.round(((plan.ends[0] ?? 0) + (plan.ends[1] ?? 0)) * 30);
    expect(fruitPose(sausage, s, bounce, t, false).by).toBeLessThan(plan.height);
    const rest = fruitPose(sausage, s, 600, t, false);
    expect(rest.by).toBeCloseTo(plan.height, 5);
    expect(rest.bx).toBeGreaterThan(0);
    expect(Math.abs(rest.angle)).toBeCloseTo(Math.PI / 2, 3);
    expect(rest.landedTicks).not.toBeNull();
    // A dropped fruit takes no more hits.
    expect(hitFruit(s, 'hang', shot(700, 5), t, false)).toBe(s);
  });

  it('an upright pod rests on the bottom of its frame on the ground line', () => {
    const pod: FruitSpot = { ...sausage, species: 'baobab_pod', fw: 32, fh: 40, ox: 16, oy: 2 };
    const s = hitFruit(RESTING, 'hang', shot(0, t.dropPellets), t, false);
    const rest = fruitPose(pod, s, 600, t, false);
    expect(rest.angle).toBeCloseTo(0, 6);
    expect(pod.y + rest.by + pod.fh - pod.oy).toBeCloseTo(pod.ground, 5);
  });

  it('the stalk stays on the tree and keeps swinging; the fruit falls from its end', () => {
    // A 150 px stalk, the fruit hanging from its end.
    const hung: FruitSpot = { ...sausage, ax: 0, ay: 150, ground: 400 };
    const first = hitFruit(RESTING, 'hang', shot(0, 1, 1), t, false);
    const pose = fruitPose(hung, first, 12, t, false);
    // Attached: the fruit hangs at the stalk's end, turned with it.
    expect(pose.stalkAngle).toBe(pose.angle);
    expect(Math.hypot(pose.bx, pose.by)).toBeCloseTo(150, 5);
    const s = hitFruit(first, 'hang', shot(20, 1, 1), t, false);
    expect(s.dropTick).toBe(20);
    const rest = fruitPose(hung, s, 600, t, false);
    // It fell from the stalk's end (not the stalk's top) to the ground line.
    expect(hung.y + rest.by).toBeCloseTo(hung.ground - Math.min(hung.fw, hung.fh) / 2, 5);
    // The stalk is still up there, swinging down to rest.
    expect(Math.abs(fruitPose(hung, s, 30, t, false).stalkAngle)).toBeGreaterThan(0);
  });

  it('lands toward the side it swung and comes to rest clear of the trunk', () => {
    const over: FruitSpot = { ...sausage, x: 5, trunk: { x: 0, half: 20 } };
    for (const dir of [1, -1]) {
      const s = hitFruit(RESTING, 'hang', shot(0, t.dropPellets, dir), t, false);
      const rest = fruitPose(over, s, 900, t, false);
      const x = over.x + rest.bx;
      // Lying across: from x − oy to x + fh − oy (dir +1), mirrored for −1.
      const span =
        dir > 0 ? [x - over.oy, x + over.fh - over.oy] : [x - (over.fh - over.oy), x + over.oy];
      const lo = (span[0] ?? 0) + 1e-6;
      const hi = (span[1] ?? 0) - 1e-6;
      expect(hi <= -20 - t.trunkClearPx || lo >= 20 + t.trunkClearPx).toBe(true);
      expect(Math.sign(rest.bx)).toBe(dir);
    }
  });

  it('reduce motion: no bounce', () => {
    expect(fallPlan(sausage, 1, t, true).speeds).toEqual([]);
  });

  it('fades after lying fadeAfterSeconds', () => {
    const s = hitFruit(RESTING, 'hang', shot(0, t.dropPellets), t, false);
    const late = Math.round((t.fadeAfterSeconds + t.fadeSeconds + 5) * 60);
    expect(fruitPose(sausage, s, late, t, false).alpha).toBe(0);
    expect(fruitPose(sausage, s, 300, t, false).alpha).toBe(1);
  });
});

describe('fruit on the ground (v1.7c, D-047)', () => {
  it('rocks and rolls a few px, never drops', () => {
    const s = hitFruit(RESTING, 'ground', shot(0, 5, -1), t, false);
    expect(s.dropTick).toBeNull();
    const p = fruitPose(melon, s, 120, t, false);
    expect(p.bx).toBeLessThan(0);
    expect(Math.abs(p.bx)).toBeLessThanOrEqual(t.nudgePx);
    expect(Math.abs(s.hits[0]?.amp ?? 0)).toBeLessThanOrEqual((t.rockDeg * Math.PI) / 180 + 1e-9);
  });
});
