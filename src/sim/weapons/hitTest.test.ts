import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createStream } from '../rng';
import type { PlaneId } from '../types';
import {
  buildSlices,
  pelletsNeeded,
  pointInBird,
  resolvePellet,
  type HitBird,
  type ShotGeometry,
} from './hitTest';
import { pelletOffsets } from './pellets';

const content = loadContent();
const biome = content.biomes[0];
if (biome === undefined) throw new Error('no biome');
const tarentaal = content.birds.creatures.find((c) => c.id === 'tarentaal');
if (tarentaal?.kind !== 'target') throw new Error('no tarentaal');
const hitbox = tarentaal.hitbox;

const geometry: ShotGeometry = {
  slices: buildSlices(biome),
  planeScale: { near: 1, mid: 0.5, far: 0.22 },
  assistPx: { near: 0, mid: 0, far: 0 },
};
const CX = 960; // left camera end: every plane's centre x is 960 (tapToPlane at dx 0)

function bird(id: number, plane: PlaneId, x: number, y: number, facing: 1 | -1 = 1): HitBird {
  return { id, plane, x, y, facing, hitbox, hittable: true };
}
function planes(list: HitBird[]): Record<PlaneId, HitBird[]> {
  const out: Record<PlaneId, HitBird[]> = { near: [], mid: [], far: [] };
  for (const b of [...list].sort((a, z) => z.id - a.id)) out[b.plane].push(b);
  return out;
}

describe('hitboxes (body ellipse + head circle, scaled by plane)', () => {
  it('hits the body centre and misses just outside the scaled ellipse', () => {
    const b = bird(1, 'mid', 1000, 300);
    // body: rx 110, ry 85, oy 10 → mid scale 0.5: rx 55, ry 42.5, centre y 305
    expect(pointInBird(1000, 305, b, 0.5, 0)).toBe(true);
    expect(pointInBird(1054, 305, b, 0.5, 0)).toBe(true);
    expect(pointInBird(1000 - 56, 305, b, 0.5, 0)).toBe(false);
  });

  it('places the head by facing', () => {
    // head: r 38, ox 120, oy -70 → mid: r 19 at (+60, -35)
    expect(pointInBird(1060, 265, bird(1, 'mid', 1000, 300, 1), 0.5, 0)).toBe(true);
    expect(pointInBird(1060, 265, bird(1, 'mid', 1000, 300, -1), 0.5, 0)).toBe(false);
    expect(pointInBird(940, 265, bird(1, 'mid', 1000, 300, -1), 0.5, 0)).toBe(true);
  });

  it('touch aim assist grows the radii', () => {
    const b = bird(1, 'far', 1000, 300);
    // far: rx 24.2 → 1026 is outside; with 18 px assist it is inside
    expect(pointInBird(1026, 302.2, b, 0.22, 0)).toBe(false);
    expect(pointInBird(1026, 302.2, b, 0.22, 18)).toBe(true);
  });
});

describe('front-to-back resolution', () => {
  it('orders layers by scroll factor: foreground, near, mid, far', () => {
    expect(geometry.slices.map((s) => s.layerId)).toEqual([
      'foreground',
      'near',
      'mid',
      'far_veld',
      'far_ridge',
      'sky',
    ]);
  });

  it('a near bird shields a mid bird behind it, which shields a far bird', () => {
    const all = [bird(1, 'far', 960, 500), bird(2, 'mid', 960, 500), bird(3, 'near', 960, 500)];
    expect(resolvePellet(0, 505, CX, geometry, planes(all)).birdId).toBe(3);
    expect(resolvePellet(0, 505, CX, geometry, planes(all.slice(0, 2))).birdId).toBe(2);
    expect(resolvePellet(0, 505, CX, geometry, planes(all.slice(0, 1))).birdId).toBe(1);
  });

  it('within a plane the higher id (drawn on top) is hit first', () => {
    const all = [bird(4, 'mid', 960, 500), bird(9, 'mid', 965, 500)];
    expect(resolvePellet(0, 505, CX, geometry, planes(all)).birdId).toBe(9);
  });

  it('skips birds that are not hittable', () => {
    const hidden = { ...bird(5, 'mid', 960, 500), hittable: false };
    expect(resolvePellet(0, 505, CX, geometry, planes([hidden])).birdId).toBeNull();
  });

  it('a foreground occluder stops the pellet before any bird', () => {
    // aloe_cluster_a: u 0.05 on the 1.2 layer → x = 0.05 × 5760 = 288, y 980, ellipse 140×120.
    // At cx 960 the foreground plane's centre is 960, so dx = 288 − 960 = −672.
    const b = bird(1, 'near', 288, 980);
    const r = resolvePellet(-672, 980, CX, geometry, planes([b]));
    expect(r).toEqual({ birdId: null, propId: 'aloe_cluster_a', partId: null, crateId: null });
  });

  it('a mid-plane prop blocks far birds behind it but not mid birds in front', () => {
    // bakkie: u 0.78 on mid → x = 0.78 × 3840 = 2995.2, y 690, rect 420×200.
    // Camera so the mid centre sits on the bakkie: (cx − 960) × 0.6 + 960 = 2995.2.
    const cx = (2995.2 - 960) / 0.6 + 960;
    const farX = (cx - 960) * 0.35 + 960;
    const far = bird(1, 'far', farX, 690);
    expect(resolvePellet(0, 690, cx, geometry, planes([far]))).toEqual({
      birdId: null,
      propId: 'bakkie',
      partId: null,
      crateId: null,
    });
    const mid = bird(2, 'mid', 2995.2, 690);
    expect(resolvePellet(0, 690, cx, geometry, planes([far, mid])).birdId).toBe(2);
  });
});

describe('pellets', () => {
  it('stay inside the spread disc and are uniform by area', () => {
    const rng = createStream(11);
    let inner = 0;
    const offsets = pelletOffsets(8000, 70, rng);
    for (const o of offsets) {
      const r = Math.sqrt(o.ox * o.ox + o.oy * o.oy);
      expect(r).toBeLessThanOrEqual(70);
      if (r <= 35) inner++;
    }
    // Uniform by area: the inner half-radius disc holds ~25 % of pellets.
    expect(inner / offsets.length).toBeGreaterThan(0.23);
    expect(inner / offsets.length).toBeLessThan(0.27);
  });

  it('a single no-spread projectile lands exactly on the aim point', () => {
    expect(pelletOffsets(1, 0, createStream(1))).toEqual([{ ox: 0, oy: 0 }]);
  });
});

describe('hit rule: pellets on target ≥ min(pelletsToBag, weapon.pellets)', () => {
  it('a 1-pellet weapon always qualifies, even against a 3-pellet boss', () => {
    expect(pelletsNeeded(3, 1)).toBe(1);
    expect(pelletsNeeded(3, 8)).toBe(3);
    expect(pelletsNeeded(1, 8)).toBe(1);
  });
});
