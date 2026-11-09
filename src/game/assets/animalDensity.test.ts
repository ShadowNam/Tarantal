// v1.17b (D-080, review 4): the true-size cameos and ostriches stay crisp — every frame on their
// sheets has at least 0.5 texture px per drawn design px in Standard and, where an HD twin is
// packed, at least 1.0 in HD (it is the Standard file at 2×). The first pass drew the cameos at
// 0.25 and showed the ostriches 2.8× their 1.5× sheet (0.54): blurry. v1.20.3 (D-083): the birds
// drawn at a sizeMul (the fly-overs and the kwêvoël) keep that density too; smaller than the
// guineafowl's units, they get crisper, and the fish eagle, drawn at a third of its size in the
// bird box (rig.json boxShrink), is packed three times larger.
import { describe, expect, it } from 'vitest';
import std from '../../../public/assets/asset-index.json' with { type: 'json' };
import hd from '../../../public/assets/asset-index-hd.json' with { type: 'json' };
import { loadContent } from '../../../tools/testContent';
import { sizeMulOf } from '../../sim/birds/size';
import { BRAKKIE_SHEET, BRAKKIE_SHEET_W } from '../brakkie/brakkieKeys';
import { BRAKKIE_DRAWN_MUL, brakkieFrames } from '../brakkie/brakkieSheet';
import { CAMEO_SHEETS, CAMEO_SHEET_AREAS, CAMEO_SHEET_SIZE } from '../cameos/cameoKeys';
import { cameoFrames } from '../cameos/cameoSheet';
import {
  OSTRICH_DRAWN_MUL,
  OSTRICH_HEN_SCALE,
  OSTRICH_MASTER,
  OSTRICH_SHEET,
  OSTRICH_SHEET_W,
} from '../view/namib/ostrichSheet';

type Img = { width: number; height: number };
const images = std.images as Record<string, Img>;
const hdImages = hd.images as Record<string, Img | undefined>;
type BirdPlane = { scale: number; x1: { pages: unknown[] } };
const birds = std.birds as Record<string, Partial<Record<string, BirdPlane>>>;
const hdBirds = hd.birds as Record<
  string,
  Partial<Record<string, { pages: unknown[] }>> | undefined
>;

describe('the true-size animals’ texture density (D-080)', () => {
  for (const area of CAMEO_SHEET_AREAS)
    it(`cameos/${area}: ≥ 0.5 texture px per drawn px (Standard), ≥ 1.0 in its HD twin`, () => {
      const key = CAMEO_SHEETS[area];
      const file = images[key];
      if (file === undefined) throw new Error(`no ${key} in the index`);
      const k = file.width / CAMEO_SHEET_SIZE[area].w;
      for (const f of cameoFrames(area)) expect(f.res * k, f.name).toBeGreaterThanOrEqual(0.5);
      const twin = hdImages[key];
      if (twin !== undefined) {
        const kh = twin.width / CAMEO_SHEET_SIZE[area].w;
        for (const f of cameoFrames(area)) expect(f.res * kh, f.name).toBeGreaterThanOrEqual(1);
      }
    });

  it('the mid ostriches: drawn for their true size, ≥ 0.5 (Standard) and ≥ 1.0 (HD twin)', () => {
    expect(OSTRICH_DRAWN_MUL).toBe(loadContent().birds.ostriches.sizeMul);
    // D-082: the hen's frames are drawn smaller from the same shapes, at the same density.
    expect(OSTRICH_HEN_SCALE).toBe(loadContent().birds.ostriches.henScale);
    const file = images[OSTRICH_SHEET];
    if (file === undefined) throw new Error('no ostrich sheet in the index');
    // Texture px per layout px, over the layout px each drawn px stands for (sizeMul).
    expect(file.width / OSTRICH_SHEET_W / OSTRICH_DRAWN_MUL).toBeGreaterThanOrEqual(0.5);
    expect(file.width / OSTRICH_SHEET_W).toBeCloseTo(OSTRICH_MASTER, 3);
    const twin = hdImages[OSTRICH_SHEET];
    expect(twin, 'the ostriches’ HD twin').toBeDefined();
    if (twin !== undefined)
      expect(twin.width / OSTRICH_SHEET_W / OSTRICH_DRAWN_MUL).toBeGreaterThanOrEqual(1);
  });

  it('D-083: the birds drawn at a sizeMul, ≥ 0.5 (Standard) and ≥ 1.0 (HD) per drawn px', () => {
    const sized = loadContent().birds.creatures.filter((c) => sizeMulOf(c) !== 1);
    expect(sized.map((c) => c.id).sort()).toEqual(['fisant', 'kwevoel', 'tortelduif', 'visarend']);
    for (const c of sized) {
      const planes = birds[c.id];
      if (planes === undefined) throw new Error(`no ${c.id} in the index`);
      for (const plane of c.planes) {
        const e = planes[plane];
        if (e === undefined) throw new Error(`no ${c.id} ${plane} atlas`);
        // Texture px per drawn design px: 1 / (the atlas's own scale × sizeMul); HD is 2×.
        const d = 1 / (e.scale * sizeMulOf(c));
        expect(d, `${c.id} ${plane}`).toBeGreaterThanOrEqual(0.5);
        expect(hdBirds[c.id]?.[plane], `${c.id} ${plane} HD`).toBeDefined();
        expect(2 * d, `${c.id} ${plane} HD`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('Brakkie: his frames drawn for his true size, ≥ 0.5 (Standard) and ≥ 1.0 (HD twin) per drawn px', () => {
    const content = loadContent();
    expect(BRAKKIE_DRAWN_MUL).toBe(content.brakkie.sizeMul);
    const file = images[BRAKKIE_SHEET];
    const twin = hdImages[BRAKKIE_SHEET];
    if (file === undefined || twin === undefined) throw new Error('no Brakkie sheet or HD twin');
    const k = file.width / BRAKKIE_SHEET_W;
    const kh = twin.width / BRAKKIE_SHEET_W;
    for (const f of brakkieFrames()) {
      // The bird he carries and the point's marker keep their size; his own frames grow.
      const grown = f.name !== 'bird' && f.name !== 'marker' ? BRAKKIE_DRAWN_MUL : 1;
      expect((f.res * k) / grown, f.name).toBeGreaterThanOrEqual(0.5);
      expect((f.res * kh) / grown, f.name).toBeGreaterThanOrEqual(1);
    }
  });
});
