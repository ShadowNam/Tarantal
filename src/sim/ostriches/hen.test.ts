// v1.20.2 (D-082): the hen is smaller than the cock (a real hen 1.7–2.0 m, a cock 2.1–2.8 m): her
// hit shapes are the cock's × henScale, around her own feet; the nest keeps the pair's size, and
// a shot aimed just above her (inside where a cock's body would be) is not aimed at her.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { HitExtra } from '../weapons/hitTest';
import { createStream } from '../rng';
import { birdSize, scareBands } from './ostriches';
import { createOstrichSystem } from './system';

const content = loadContent();
const T = content.birds.ostriches;
const biome = content.biomes.find((b) => b.id === 'namibie');
if (biome === undefined) throw new Error('no Namibië');

type OstrichExtra = Extract<HitExtra, { kind: 'ostrich' }>;

function setup(): { sys: ReturnType<typeof createOstrichSystem>; penalties: number[] } {
  const penalties: number[] = [];
  const sys = createOstrichSystem(biome as NonNullable<typeof biome>, content, createStream(3), {
    tick: () => 100,
    emit: () => undefined,
    penalty: (p) => penalties.push(p),
  });
  return { sys, penalties };
}

describe('ostriches: the hen at her own size (D-082)', () => {
  it('henScale makes her 0.7–0.8 of the cock', () => {
    expect(T.henScale).toBeGreaterThanOrEqual(0.7);
    expect(T.henScale).toBeLessThanOrEqual(0.8);
    expect(birdSize({ size: 2 }, { male: true }, T)).toBe(2);
    expect(birdSize({ size: 2 }, { male: false }, T)).toBeCloseTo(2 * T.henScale, 9);
  });

  it("her hit shapes are the cock's × henScale; the nest keeps the pair's size", () => {
    const { sys } = setup();
    const f = sys.view()[0];
    if (f === undefined) throw new Error('no family');
    const shapes: OstrichExtra[] = [];
    sys.extras((_layer, e) => {
      if (e.kind === 'ostrich') shapes.push(e);
    });
    for (const b of f.birds) {
      const mine = shapes.filter((e) => e.ostrichId === b.id);
      expect(mine.length).toBe(2);
      const box = b.pose === 'sit' ? T.hitboxes.sit : T.hitboxes.stand;
      const k = f.size * (b.male ? 1 : T.henScale);
      const body = mine[0];
      if (body === undefined || body.shape.type !== 'ellipse') throw new Error('no body ellipse');
      expect(body.shape.rx).toBeCloseTo(box.body.rx * k, 6);
      expect(body.shape.ry).toBeCloseTo(box.body.ry * k, 6);
      expect(body.y).toBeCloseTo(f.ground + box.body.oy * k, 6);
    }
    if (f.nest !== null) {
      const nest = shapes.find((e) => e.ostrichId === f.nest?.id);
      if (nest === undefined || nest.shape.type !== 'ellipse') throw new Error('no nest');
      expect(nest.shape.rx).toBeCloseTo(T.hitboxes.nest.rx * f.size, 6);
    }
  });

  // The hen standing (not on the nest): step until she stands, so her stand shapes are the ones hit.
  function standingHen(henScale: number): {
    sys: ReturnType<typeof createOstrichSystem>;
    penalties: number[];
    f: ReturnType<ReturnType<typeof createOstrichSystem>['view']>[number];
    hen: ReturnType<ReturnType<typeof createOstrichSystem>['view']>[number]['birds'][number];
  } {
    const c = { ...content, birds: { ...content.birds, ostriches: { ...T, henScale } } };
    const penalties: number[] = [];
    const sys = createOstrichSystem(biome as NonNullable<typeof biome>, c, createStream(3), {
      tick: () => 100,
      emit: () => undefined,
      penalty: (p) => penalties.push(p),
    });
    for (let i = 0; i < 60 * 600; i++) {
      const f = sys.view()[0];
      const hen = f?.birds.find((b) => !b.male);
      if (f !== undefined && hen !== undefined && hen.pose !== 'sit')
        return { sys, penalties, f, hen };
      sys.step();
    }
    throw new Error('the hen never stood up in 10 minutes');
  }

  // Just above her standing body, inside where a cock-sized body would be, over her feet.
  function aboveHer(
    f: { ground: number; size: number },
    hen: { x: number },
  ): { x: number; y: number } {
    const body = T.hitboxes.stand.body;
    return { x: hen.x, y: f.ground + (body.oy - body.ry * 0.9) * f.size };
  }

  it("a shot aimed where a cock's body would be, above her, is not aimed at her", () => {
    const { sys, penalties, f, hen } = standingHen(T.henScale);
    const p = aboveHer(f, hen);
    sys.shot(1, [hen.id], [], 960, true, false, {
      hitTarget: false,
      targetNearAim: false,
      aimOn: () => p,
    });
    expect(penalties).toEqual([]);
  });

  it('the same shot at a cock-sized hen (henScale 1) is aimed at her: the penalty', () => {
    const { sys, penalties, f, hen } = standingHen(1);
    const p = aboveHer(f, hen);
    sys.shot(1, [hen.id], [], 960, true, false, {
      hitTarget: false,
      targetNearAim: false,
      aimOn: () => p,
    });
    expect(penalties).toEqual([-T.hit.penalty]);
  });

  it("her scare band is her own height; the cock's and the nest's the pair's", () => {
    const f = {
      size: 1.2,
      birds: [
        { male: true, x: 100 },
        { male: false, x: 300 },
      ],
      nest: { x: 200 },
    };
    const bands = scareBands(f, T);
    expect(bands).toHaveLength(3);
    expect(bands[0]?.h).toBeCloseTo(T.heightPx * 1.2, 9);
    expect(bands[1]?.h).toBeCloseTo(T.heightPx * 1.2 * T.henScale, 9);
    expect(bands[1]?.h).toBeLessThan(bands[0]?.h ?? 0);
    expect(bands[2]).toEqual({ x: 200, h: T.heightPx * 1.2 });
    expect(scareBands({ ...f, nest: null }, T)).toHaveLength(2);
  });
});
