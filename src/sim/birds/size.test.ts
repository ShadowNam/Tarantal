// v1.23.1 (D-083): a bird's sizeMul scales its hit shapes the way the renderer scales its drawing,
// and a percher drawn smaller keeps its feet on the perch.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { pointInBird, type HitBird } from '../weapons/hitTest';
import { birdHitbox, perchFeetShift, scaleHitbox, sizeMulOf } from './size';

const content = loadContent();
const creature = (id: string) => {
  const c = content.birds.creatures.find((x) => x.id === id);
  if (c === undefined || c.kind === 'helper') throw new Error(`no bird ${id}`);
  return c;
};

describe('true-size hit shapes (D-083)', () => {
  it('scales radii and offsets; 1 leaves the hitbox as it is', () => {
    const h = { body: { rx: 100, ry: 50, ox: 10, oy: -20 }, head: { r: 30, ox: 80, oy: -40 } };
    expect(scaleHitbox(h, 1)).toBe(h);
    expect(scaleHitbox(h, 0.5)).toEqual({
      body: { rx: 50, ry: 25, ox: 5, oy: -10 },
      head: { r: 15, ox: 40, oy: -20 },
    });
    expect(scaleHitbox({ body: h.body }, 2)).toEqual({
      body: { rx: 200, ry: 100, ox: 20, oy: -40 },
    });
  });

  it('the guineafowl and the bosses keep their hitboxes (no sizeMul)', () => {
    for (const c of content.birds.creatures) {
      if (c.kind === 'helper') continue;
      if (c.id.startsWith('tarentaal') || c.kind === 'boss') {
        expect(sizeMulOf(c), c.id).toBe(1);
        expect(birdHitbox(c), c.id).toBe(c.hitbox);
      }
    }
  });

  it('the fly-overs and the kwêvoël are smaller than the guineafowl’s units', () => {
    for (const id of ['tortelduif', 'fisant', 'kwevoel', 'visarend']) {
      const m = sizeMulOf(creature(id));
      expect(m, id).toBeGreaterThan(0.3);
      expect(m, id).toBeLessThan(1);
    }
  });

  it('a mid-plane turtle dove is hit where it is drawn, not where the old, larger one was', () => {
    const c = creature('tortelduif');
    const bird: HitBird = {
      id: 1,
      plane: 'mid',
      x: 1000,
      y: 400,
      facing: 1,
      hitbox: birdHitbox(c),
      hittable: true,
      snappable: true,
    };
    const old: HitBird = { ...bird, hitbox: c.hitbox };
    const s = content.scoring.planes.mid.scale;
    const body = c.hitbox.body;
    // 0.8 of the old body's radius in front of its centre: inside the old shape, outside the new.
    const px = bird.x + body.ox * s + body.rx * s * 0.8;
    const py = bird.y + body.oy * s * sizeMulOf(c);
    expect(pointInBird(px, py, old, s, 0)).toBe(true);
    expect(pointInBird(px, py, bird, s, 0)).toBe(false);
    // Its new body centre still hits.
    const nb = birdHitbox(c).body;
    expect(pointInBird(bird.x + nb.ox * s, bird.y + nb.oy * s, bird, s, 0)).toBe(true);
  });

  it('the far plane’s minimum hit radius still holds for a small far target', () => {
    const c = creature('tortelduif');
    const s = content.scoring.planes.far.scale;
    const min = content.scoring.planes.far.minHitRadiusPx;
    const bird: HitBird = {
      id: 1,
      plane: 'far',
      x: 0,
      y: 0,
      facing: 1,
      hitbox: birdHitbox(c),
      hittable: true,
      snappable: true,
    };
    const b = birdHitbox(c).body;
    expect(b.rx * s).toBeLessThan(min);
    expect(pointInBird(b.ox * s + min * 0.95, b.oy * s, bird, s, 0, min)).toBe(true);
  });

  it('the kwêvoël sits lower on its perch by its feet × (1 − sizeMul), so its feet stay put', () => {
    const c = creature('kwevoel');
    const s = content.scoring.planes.mid.scale;
    const feet = 'perchFeetOy' in c ? (c.perchFeetOy ?? 0) : 0;
    expect(feet).toBeGreaterThan(0);
    const shift = perchFeetShift(c, s);
    // The feet: home + feet × scale × sizeMul, the same place as at sizeMul 1 (home + feet × scale).
    expect(shift + feet * s * sizeMulOf(c)).toBeCloseTo(feet * s, 9);
    expect(perchFeetShift(creature('tarentaal'), s)).toBe(0);
  });
});
