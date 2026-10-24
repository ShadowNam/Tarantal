import { describe, expect, it } from 'vitest';
import { propPlaneRes } from '../assets/pack';
import { loadContent } from '../testContent';
import {
  camelthornLook,
  camelthornSpec,
  camelthornTree,
  lastNestStats,
  nestTreeSpec,
} from './camelthorn';
import { resetIds } from './scenery';
import { prng } from './svg';

const c = (name: string): string =>
  ({ camelthorn: '#7B8F3A', greyGreen: '#A8AE84', trunk: '#5E4636', deadwood: '#9C9086' })[name] ??
  '#C9A66A';
const pen = { ink: '#1B1410', w: 3 };

// v1.4 B (D-039): the detail floor the product owner asked for (24 Oct).
describe('camelthorn and family nest detail', () => {
  it('the nest has 1500+ straws and 10–20 entrance holes; the crown 30–60 clumps', () => {
    const art = camelthornTree(prng(7), nestTreeSpec(), camelthornLook(c, pen), pen);
    const nest = lastNestStats();
    expect(nest.straws).toBeGreaterThanOrEqual(1500);
    expect(nest.holes).toBeGreaterThanOrEqual(10);
    expect(nest.holes).toBeLessThanOrEqual(20);
    expect(art.clumps).toBeGreaterThanOrEqual(30);
    expect(art.clumps).toBeLessThanOrEqual(60);
  });

  it('every plain variant has a crown of 30–60 clumps and furrowed bark', () => {
    for (const v of ['young', 'mature', 'old'] as const) {
      const art = camelthornTree(prng(3), camelthornSpec(v, 0, 0), camelthornLook(c, pen), pen);
      expect(art.clumps, v).toBeGreaterThanOrEqual(30);
      expect(art.clumps, v).toBeLessThanOrEqual(60);
      expect(art.strokes, v).toBeGreaterThan(100);
    }
  });

  it('is deterministic for a seed', () => {
    resetIds();
    const a = camelthornTree(prng(11), nestTreeSpec(), camelthornLook(c, pen), pen).svg;
    resetIds();
    const b = camelthornTree(prng(11), nestTreeSpec(), camelthornLook(c, pen), pen).svg;
    expect(a).toBe(b);
  });
});

describe('2× props pack per plane', () => {
  it('mid and near props keep 2×, others 1×', () => {
    const content = loadContent();
    expect(propPlaneRes(content, 'kalahari/weaver_camelthorn')).toBe(2);
    expect(propPlaneRes(content, 'ui/not-a-prop')).toBe(1);
  });
});
