// v1.17b (D-080, review 4): the true-size cameos and ostriches stay crisp — every frame on their
// sheets has at least 0.5 texture px per drawn design px in Standard and, where an HD twin is
// packed, at least 1.0 in HD (it is the Standard file at 2×). The first pass drew the cameos at
// 0.25 and showed the ostriches 2.8× their 1.5× sheet (0.54): blurry.
import { describe, expect, it } from 'vitest';
import std from '../../../public/assets/asset-index.json' with { type: 'json' };
import hd from '../../../public/assets/asset-index-hd.json' with { type: 'json' };
import { loadContent } from '../../../tools/testContent';
import { CAMEO_SHEETS, CAMEO_SHEET_AREAS, CAMEO_SHEET_SIZE } from '../cameos/cameoKeys';
import { cameoFrames } from '../cameos/cameoSheet';
import {
  OSTRICH_DRAWN_MUL,
  OSTRICH_MASTER,
  OSTRICH_SHEET,
  OSTRICH_SHEET_W,
} from '../view/namib/ostrichSheet';

type Img = { width: number; height: number };
const images = std.images as Record<string, Img>;
const hdImages = hd.images as Record<string, Img | undefined>;

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
});
