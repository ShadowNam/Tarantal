import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createStream } from '../rng';
import type { PlaneId } from '../types';
import {
  assistSnap,
  buildSlices,
  pelletsNeeded,
  pointInBird,
  pointInCapsule,
  resolvePattern,
  resolvePellet,
  type HitBird,
  type HitExtra,
  type ShotGeometry,
} from './hitTest';
import { pelletOffsets } from './pellets';

const content = loadContent();
const biome = content.biomes.find((b) => b.id === 'karoo-autumn');
if (biome === undefined) throw new Error('no biome');
const tarentaal = content.birds.creatures.find((c) => c.id === 'tarentaal');
if (tarentaal?.kind !== 'target') throw new Error('no tarentaal');
const hitbox = tarentaal.hitbox;

const geometry: ShotGeometry = {
  slices: buildSlices(biome),
  planeScale: { near: 1, mid: 0.5, far: 0.22, ver: 0.1 },
  assistPx: { near: 0, mid: 0, far: 0, ver: 0 },
};
const CX = 960; // left camera end: every plane's centre x is 960 (tapToPlane at dx 0)

function bird(id: number, plane: PlaneId, x: number, y: number, facing: 1 | -1 = 1): HitBird {
  return { id, plane, x, y, facing, hitbox, hittable: true, snappable: true };
}
function planes(list: HitBird[]): Record<PlaneId, HitBird[]> {
  const out: Record<PlaneId, HitBird[]> = { near: [], mid: [], far: [], ver: [] };
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
  it('orders layers by scroll factor: foreground, near, mid, far, ver (v1.3)', () => {
    expect(geometry.slices.map((s) => s.layerId)).toEqual([
      'foreground',
      'near',
      'mid',
      'far_veld',
      'ver_veld',
      'far_ridge',
      'sky',
    ]);
    expect(geometry.slices.find((s) => s.layerId === 'ver_veld')?.plane).toBe('ver');
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

describe('touch aim assist rescues a miss (M9, D-026)', () => {
  const assisted: ShotGeometry = { ...geometry, assistPx: { near: 8, mid: 14, far: 18, ver: 6 } };

  it('1.9.3 (review M6): a shot that only clips a makalani nut still snaps onto a bird', () => {
    const b = bird(1, 'far', 1000, 300);
    // A near nut right under the aim point (plane x 1026), the far bird 26 px off it.
    const nearLayer = geometry.slices.find((x) => x.plane === 'near')?.layerId ?? 'near';
    const nut: HitExtra = {
      kind: 'can',
      canId: 3_000_000,
      x: 1026,
      y: 302.2,
      r: 6,
      hx: 0,
      hy: 0,
      passThrough: true,
    };
    const extras = new Map([[nearLayer, [nut]]]);
    const one = [{ ox: 0, oy: 0 }];
    const plain = resolvePattern(66, 302.2, CX, one, geometry, null, planes([b]), extras);
    expect(plain[0]?.r.canId).toBe(3_000_000);
    const out = resolvePattern(66, 302.2, CX, one, geometry, assisted, planes([b]), extras);
    expect(out[0]?.r.birdId).toBe(1);
    expect(out[0]?.r.canId).toBeUndefined();
    // No bird to snap to: the nut keeps the pellet.
    const alone = resolvePattern(66, 302.2, CX, one, geometry, assisted, planes([]), extras);
    expect(alone[0]?.r.canId).toBe(3_000_000);
  });

  it('an aim point inside the grown hitbox snaps onto the bird body centre', () => {
    const b = bird(1, 'far', 1000, 300);
    // far body centre (1000, 302.2); aim at plane x 1026 (dx 66): outside, but within 18 px.
    expect(resolvePellet(66, 302.2, CX, geometry, planes([b])).birdId).toBeNull();
    const snap = assistSnap(66, 302.2, CX, assisted, planes([b]));
    expect(snap?.birdId).toBe(1);
    expect(snap?.sx).toBeCloseTo(-26, 6);
    expect(snap?.sy).toBeCloseTo(0, 6);
    expect(resolvePellet(66 + (snap?.sx ?? 0), 302.2, CX, geometry, planes([b])).birdId).toBe(1);
  });

  it('no snap beyond the assist radius, or onto a bird behind a nearer one', () => {
    const b = bird(1, 'far', 1000, 300);
    expect(assistSnap(100, 302.2, CX, assisted, planes([b]))).toBeNull();
    // A near bird under the aim point wins (front to back), so the snap targets it.
    const near = bird(2, 'near', 1040, 300);
    const snap = assistSnap(66, 302.2, CX, assisted, planes([b, near]));
    expect(snap?.sx).toBeCloseTo(1040 - 1026, 6);
  });

  it("never snaps onto a don't-shoot creature, nor past one onto a target behind it", () => {
    const hadeda = { ...bird(5, 'far', 1000, 300), snappable: false };
    expect(assistSnap(66, 302.2, CX, assisted, planes([hadeda]))).toBeNull();
    const behind = bird(1, 'far', 1004, 300);
    expect(assistSnap(66, 302.2, CX, assisted, planes([hadeda, behind]))).toBeNull();
  });
});

describe('minimum hit radius (D-049)', () => {
  const far = (minHitPx: number): ShotGeometry => ({
    ...geometry,
    planeScale: { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    minHitPx: { near: 0, mid: 0, far: minHitPx, ver: 0 },
  });
  // A far bird at the left camera end: its body centre is (1000, 300 + 10 × 0.15).
  const b = bird(1, 'far', 1000, 300);
  const cy = 300 + 10 * 0.15;

  it('a far body is drawn 16.5 × 12.75 px; the floor widens it to 18 px on both axes', () => {
    expect(pointInBird(1017, cy, b, 0.15, 0)).toBe(false);
    expect(pointInBird(1017, cy, b, 0.15, 0, 18)).toBe(true);
    expect(pointInBird(1000, cy + 15, b, 0.15, 0)).toBe(false);
    expect(pointInBird(1000, cy + 15, b, 0.15, 0, 18)).toBe(true);
    expect(pointInBird(1019, cy, b, 0.15, 0, 18)).toBe(false);
  });

  it('touch assist grows the floored radius', () => {
    expect(pointInBird(1027, cy, b, 0.15, 10, 18)).toBe(true);
    expect(pointInBird(1029, cy, b, 0.15, 10, 18)).toBe(false);
  });

  it('the head is not floored (it stays the size it is drawn)', () => {
    // Head centre (1000 + 120 × 0.15, 300 − 70 × 0.15) = (1018, 289.5), r 5.7.
    expect(pointInBird(1018, 289.5 - 7, b, 0.15, 0, 18)).toBe(false);
    expect(pointInBird(1018, 289.5 - 5, b, 0.15, 0, 18)).toBe(true);
  });

  it('resolvePellet uses the plane floor from the geometry', () => {
    const list = planes([b]);
    const hit = (g: ShotGeometry): number | null =>
      resolvePellet(1017 - 960, cy, CX, g, list).birdId;
    expect(hit(far(0))).toBeNull();
    expect(hit(far(18))).toBe(1);
  });
});

describe('the hit floor is for targets only (D-049 review)', () => {
  it("a don't-shoot bird stays the size it is drawn; a target gets the floor", () => {
    const g: ShotGeometry = {
      ...geometry,
      planeScale: { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
      minHitPx: { near: 0, mid: 0, far: 18, ver: 10 },
    };
    const cy = 300 + 10 * 0.15;
    const target = bird(1, 'far', 1000, 300);
    const protectedBird: HitBird = { ...bird(2, 'far', 1000, 300), snappable: false };
    // 17 px right of the body centre: outside the drawn 16.5 px, inside the 18 px floor.
    expect(resolvePellet(1017 - 960, cy, CX, g, planes([target])).birdId).toBe(1);
    expect(resolvePellet(1017 - 960, cy, CX, g, planes([protectedBird])).birdId).toBeNull();
  });
});

describe('tin can capsules (v1.8, D-050)', () => {
  it('a point is in when within r of the turned axis', () => {
    const upright = { x: 100, y: 100, r: 10, hx: 0, hy: -20 };
    expect(pointInCapsule(100, 75, upright)).toBe(true);
    expect(pointInCapsule(100, 69, upright)).toBe(false);
    expect(pointInCapsule(109, 100, upright)).toBe(true);
    expect(pointInCapsule(111, 100, upright)).toBe(false);
    // Turned a quarter: the axis lies along x.
    const lying = { x: 100, y: 100, r: 10, hx: 20, hy: 0 };
    expect(pointInCapsule(129, 100, lying)).toBe(true);
    expect(pointInCapsule(100, 75, lying)).toBe(false);
  });
});

describe('1.9.3 (review M17): a target behind a makalani nut takes the pellet', () => {
  // Two plain slices at scroll factor 1: a near layer with the nut, a mid layer behind it.
  const geo: ShotGeometry = {
    slices: [
      { layerId: 'near', scrollFactor: 1, plane: 'near', occluders: [] },
      { layerId: 'mid', scrollFactor: 1, plane: 'mid', occluders: [] },
    ],
    planeScale: { near: 1, mid: 1, far: 1, ver: 1 },
    assistPx: { near: 0, mid: 0, far: 0, ver: 0 },
  };
  const nut: HitExtra = {
    kind: 'can',
    canId: 3_000_000,
    x: 960,
    y: 500,
    r: 20,
    hx: 0,
    hy: 0,
    passThrough: true,
  };
  const box = { type: 'rect' as const, w: 60, h: 60, ox: 0, oy: 0 };
  const behind = (e: HitExtra): ReadonlyMap<string, readonly HitExtra[]> =>
    new Map([
      ['near', [nut]],
      ['mid', [e]],
    ]);
  const none = planes([]);
  it('a Spookjag owl or bat behind it', () => {
    const r = resolvePellet(
      0,
      500,
      960,
      geo,
      none,
      behind({ kind: 'spook', spookId: 7, x: 960, y: 500, shape: box }),
    );
    expect(r.spookId).toBe(7);
    expect(r.canId).toBeUndefined();
  });
  it('a crate behind it', () => {
    const r = resolvePellet(
      0,
      500,
      960,
      geo,
      none,
      behind({ kind: 'crate', crateId: 4, x: 960, y: 500, shape: box }),
    );
    expect(r.crateId).toBe(4);
  });
  it('a secret part behind it', () => {
    const r = resolvePellet(
      0,
      500,
      960,
      geo,
      none,
      behind({ kind: 'secret', propId: 'hippo', partId: 'water', x: 960, y: 500, shape: box }),
    );
    expect(r.partId).toBe('water');
  });
  it('a plain prop occluder behind it: the nut keeps the pellet', () => {
    const g2: ShotGeometry = {
      ...geo,
      slices: [
        { layerId: 'near', scrollFactor: 1, plane: 'near', occluders: [] },
        {
          layerId: 'mid',
          scrollFactor: 1,
          plane: 'mid',
          occluders: [{ propId: 'reeds_a', x: 960, y: 500, shape: box }],
        },
      ],
    };
    const r = resolvePellet(0, 500, 960, g2, none, new Map([['near', [nut]]]));
    expect(r.canId).toBe(3_000_000);
    expect(r.propId).toBeNull();
  });
});
