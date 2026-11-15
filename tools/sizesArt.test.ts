// v1.20.2 (D-082): the sizes in tools/sizes.ts MEASURED_ART are re-read from the delivered art
// (art-source/: opaque bounds, alpha ≥ 64) and must agree within ±3 %, so the true-size table
// (tools/sizes.test.ts, ±15 % of real) fails when the art drifts — D-080 computed most rows from
// the same metres the art was drawn to, and the audit found the ostrich hen drawn as tall as the
// cock and Brakkie's bird at 0.27× without a test failing. v1.23.1 (D-083): the fly-overs and the
// kwêvoël, read from their bird frames (art-source/birds/<creature>/planes/<plane>/<clip>/<NN>.png).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAKKIE_SHEET_W } from '../src/game/brakkie/brakkieKeys';
import { brakkieFrames } from '../src/game/brakkie/brakkieSheet';
import { CAMEO_SHEETS, CAMEO_SHEET_SIZE } from '../src/game/cameos/cameoKeys';
import { cameoFrames } from '../src/game/cameos/cameoSheet';
import {
  HARVEST_SHEET,
  HARVEST_SHEET_W,
  harvestFrames,
} from '../src/game/view/harvest/harvestSheet';
import { OSTRICH_SHEET, OSTRICH_SHEET_W, ostrichFrames } from '../src/game/view/namib/ostrichSheet';
import {
  RESIDENT_SHEET,
  RESIDENT_SHEET_W,
  residentFrames,
} from '../src/game/view/tree/residentSheet';
import { BRAKKIE_SHEET } from '../src/game/brakkie/brakkieKeys';
import { EAGLE_WINGSPAN_M, FLYER_BOX_SHRINK } from './art/flyers';
import { decodePng, type Rgba } from './assets/image';
import { BIRD_BOX } from './assets/targets';
import { EAGLE_HALF_SPAN_M, MEASURED_ART, type ArtSource } from './sizes';

const ALPHA = 64;
const TOLERANCE = 0.03;

const art = new Map<string, Rgba>();
function png(key: string): Rgba {
  let img = art.get(key);
  if (img === undefined) {
    img = decodePng(readFileSync(join(process.cwd(), 'art-source', 'sprites', `${key}.png`)));
    art.set(key, img);
  }
  return img;
}

/** A frame in an image: its box in file px, its feet in file px, and file px per art px. */
interface Cell {
  readonly img: Rgba;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fx: number;
  readonly fy: number;
  readonly k: number;
}

const opaque = (img: Rgba, x: number, y: number): boolean =>
  (img.data[(y * img.width + x) * 4 + 3] ?? 0) >= ALPHA;

/** The measure in art px: the highest opaque pixel above the feet (within the band's columns),
 *  the opaque width, or the opaque height. */
function measure(
  c: Cell,
  extent: 'top' | 'width' | 'height',
  band?: readonly [number, number],
): number {
  const x0 = Math.max(Math.floor(c.x), band === undefined ? 0 : Math.round(c.fx + band[0] * c.k));
  const x1 = Math.min(
    Math.ceil(c.x + c.w),
    band === undefined ? Infinity : Math.round(c.fx + band[1] * c.k) + 1,
  );
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (let x = x0; x < x1; x++)
    for (let y = Math.floor(c.y); y < Math.ceil(c.y + c.h); y++)
      if (opaque(c.img, x, y)) {
        top = Math.min(top, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
        for (let yb = Math.ceil(c.y + c.h) - 1; yb >= y; yb--)
          if (opaque(c.img, x, yb)) {
            bottom = Math.max(bottom, yb);
            break;
          }
        break;
      }
  if (extent === 'top') return (c.fy - top) / c.k;
  return extent === 'width' ? (right - left + 1) / c.k : (bottom - top + 1) / c.k;
}

/** One far herd look: the top of its body part, or of all its parts, above its feet (art px). */
function faunaTop(sheet: string, look: string, part: 'body' | 'all'): number {
  const img = png(`fauna/${sheet}`);
  const meta = JSON.parse(
    readFileSync(join(process.cwd(), 'art-source', 'sprites', 'fauna', `${sheet}.json`), 'utf8'),
  ) as { frames: Record<string, readonly number[]> };
  let top = -Infinity;
  for (const [name, t] of Object.entries(meta.frames)) {
    if (!name.startsWith(`${look}.`) || (part === 'body' && name !== `${look}.body`)) continue;
    const [x = 0, y = 0, w = 0, h = 0, , py = 0, , oy = 0] = t;
    for (let xx = x; xx < x + w; xx++)
      for (let yy = y; yy < y + h; yy++)
        if (opaque(img, xx, yy)) {
          // Above the feet: the pivot sits oy from the feet (the sheet is 1×: 1 file px per px).
          top = Math.max(top, py - (yy - y) - oy);
          break;
        }
  }
  return top;
}

/** D-083: a bird frame, in the creature's art units (its rig.json boxShrink undone). */
function flyerCell(s: Extract<ArtSource, { kind: 'flyer' }>): Cell {
  const dir = join(process.cwd(), 'art-source', 'birds', s.creature);
  const img = decodePng(readFileSync(join(dir, 'planes', s.artPlane, `${s.frame}.png`)));
  const rig = JSON.parse(readFileSync(join(dir, 'rig.json'), 'utf8')) as { boxShrink?: number };
  const box = img.width / BIRD_BOX.width;
  return {
    img,
    x: 0,
    y: 0,
    w: img.width,
    h: img.height,
    fx: BIRD_BOX.originX * box,
    fy: BIRD_BOX.originY * box,
    k: box / (rig.boxShrink ?? 1),
  };
}

function cell(s: Exclude<ArtSource, { kind: 'fauna' | 'flyer' }>): Cell {
  if (s.kind === 'ostrich') {
    const img = png(OSTRICH_SHEET);
    const k = img.width / OSTRICH_SHEET_W;
    const f = ostrichFrames().find((x) => x.name === s.frame);
    if (f === undefined) throw new Error(s.frame);
    return {
      img,
      x: f.x * k,
      y: f.y * k,
      w: f.w * k,
      h: f.h * k,
      fx: (f.x + f.ox) * k,
      fy: (f.y + f.oy) * k,
      k,
    };
  }
  if (s.kind === 'brakkie') {
    const img = png(BRAKKIE_SHEET);
    const f = brakkieFrames().find((x) => x.name === s.frame);
    if (f === undefined) throw new Error(s.frame);
    const ks = img.width / BRAKKIE_SHEET_W;
    const k = ks * f.res;
    return {
      img,
      x: f.x * ks,
      y: f.y * ks,
      w: f.w * k,
      h: f.h * k,
      fx: f.x * ks + f.ox * k,
      fy: f.y * ks + f.oy * k,
      k,
    };
  }
  if (s.kind === 'harvest') {
    const img = png(HARVEST_SHEET);
    const k = img.width / HARVEST_SHEET_W;
    const f = harvestFrames().find((x) => x.name === s.frame);
    if (f === undefined) throw new Error(s.frame);
    return {
      img,
      x: f.x * k,
      y: f.y * k,
      w: f.w * k,
      h: f.h * k,
      fx: (f.x + f.ox) * k,
      fy: (f.y + f.oy) * k,
      k,
    };
  }
  if (s.kind === 'resident') {
    const img = png(RESIDENT_SHEET);
    const k = img.width / RESIDENT_SHEET_W;
    const f = residentFrames().find((x) => x.name === s.frame);
    if (f === undefined) throw new Error(s.frame);
    return {
      img,
      x: f.x * k,
      y: f.y * k,
      w: f.w * k,
      h: f.h * k,
      fx: (f.x + f.ox) * k,
      fy: (f.y + f.oy) * k,
      k,
    };
  }
  const area = s.kind.slice('cameo:'.length) as keyof typeof CAMEO_SHEETS;
  const img = png(CAMEO_SHEETS[area]);
  const ks = img.width / CAMEO_SHEET_SIZE[area].w;
  const f = cameoFrames(area).find((x) => x.name === s.frame);
  if (f === undefined) throw new Error(s.frame);
  const k = ks * f.res;
  return {
    img,
    x: f.x * ks,
    y: f.y * ks,
    w: f.w * k,
    h: f.h * k,
    fx: f.x * ks + f.ox * k,
    fy: f.y * ks + f.oy * k,
    k,
  };
}

describe('the measured animal sizes are the delivered art’s (D-082)', () => {
  for (const m of MEASURED_ART)
    it(`${m.id}: ${m.artPx} art px (${m.measure})`, () => {
      const s = m.source;
      const got =
        s.kind === 'fauna'
          ? faunaTop(s.sheet, s.look, s.part)
          : s.kind === 'flyer'
            ? measure(flyerCell(s), s.extent)
            : measure(cell(s), s.extent, s.band);
      expect(Math.abs(got / m.artPx - 1), `measured ${got.toFixed(1)} px`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    });

  it('covers the far herds, the Ver waterhole, the cameos, both mid ostriches, Brakkie and his bird, the Harvest workers and post', () => {
    const ids = new Set(MEASURED_ART.map((m) => m.id));
    for (const id of [
      'far_elephant',
      'far_ostrich_hen',
      'ver_giraffe',
      'ver_ostrich_hen',
      'cameo_ostrich',
      'cameo_tortoise',
      'mid_ostrich_cock',
      'mid_ostrich_hen',
      'brakkie_withers',
      'brakkie_bird',
      'harvest_worker_1',
      'harvest_fence_post',
    ])
      expect(ids.has(id), id).toBe(true);
  });

  it('D-083: covers the fly-overs on both their planes, the kwêvoël and the fish eagle’s body and wings', () => {
    const ids = new Set(MEASURED_ART.map((m) => m.id));
    for (const id of [
      'flyover_tortelduif_mid',
      'flyover_tortelduif_far',
      'flyover_fisant_mid',
      'flyover_fisant_far',
      'kwevoel_perched',
      'visarend_body',
      'visarend_wing',
    ])
      expect(ids.has(id), id).toBe(true);
    // The wing row's real size is the span the art is drawn to.
    expect(EAGLE_HALF_SPAN_M).toBeCloseTo(EAGLE_WINGSPAN_M / 2, 6);
    // The eagle's rig says it is drawn small (its wings would not fit the box otherwise).
    const rig = JSON.parse(
      readFileSync(join(process.cwd(), 'art-source', 'birds', 'visarend', 'rig.json'), 'utf8'),
    ) as { boxShrink?: number };
    expect(rig.boxShrink).toBe(FLYER_BOX_SHRINK.visarend);
  });
});
