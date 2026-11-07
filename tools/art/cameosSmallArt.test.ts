// v1.13 (D-075): the small cameos' art (the dung beetle, the leopard tortoise, the ostrich and its
// dust) against the frame table — every drawing fits its box with a margin (lesson 12: nothing
// clipped at a cell edge), every animal stands on its origin (lesson 18: nothing floats), and every
// animal keeps the no-ink rule (lesson 43): its outermost ring of pixels darker than its inside.
import { describe, expect, it } from 'vitest';
import { cameoFrames, type CameoFrame } from '../../src/game/cameos/cameoSheet';
import type { Rgba } from '../assets/image';
import { smallFrameArt } from './cameosSmall';
import { renderSvg } from './raster';
import { g, svgDoc } from './svg';

const K = 2;
const W = 300;
const H = 280;
const OX = 150;
const OY = 240;

function render(name: CameoFrame): Rgba {
  const art = smallFrameArt(name);
  return renderSvg(
    svgDoc(
      W * K,
      H * K,
      [0, 0, W, H],
      art.defs,
      g({ transform: `translate(${OX} ${OY})` }, art.body),
    ),
  );
}

const alpha = (img: Rgba, x: number, y: number): number =>
  x < 0 || y < 0 || x >= img.width || y >= img.height
    ? 0
    : (img.data[(y * img.width + x) * 4 + 3] ?? 0);

/** The drawing's extent round its origin (design px) for pixels above an alpha threshold. */
function extent(img: Rgba, minAlpha: number) {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (alpha(img, x, y) > minAlpha) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return {
    left: OX - x0 / K,
    right: (x1 + 1) / K - OX,
    up: OY - y0 / K,
    down: (y1 + 1) / K - OY,
  };
}

/** Mean luminance of the outermost ring of solid pixels, of everything inside it, and of the
 *  inside just behind each ring pixel (3–4 px in: the part that edge belongs to). */
function ringVsInside(img: Rgba): { ring: number; inside: number; behind: number } {
  const solid = (x: number, y: number): boolean => alpha(img, x, y) >= 128;
  const lum = (x: number, y: number): number => {
    const i = (y * img.width + x) * 4;
    return (
      0.2126 * (img.data[i] ?? 0) +
      0.7152 * (img.data[i + 1] ?? 0) +
      0.0722 * (img.data[i + 2] ?? 0)
    );
  };
  const isRing = (x: number, y: number): boolean =>
    solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1));
  let rs = 0;
  let rn = 0;
  let is = 0;
  let inN = 0;
  let bs = 0;
  let bn = 0;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (!solid(x, y)) continue;
      if (!isRing(x, y)) {
        is += lum(x, y);
        inN++;
        continue;
      }
      rs += lum(x, y);
      rn++;
      let ls = 0;
      let ln = 0;
      for (const r of [3, 4])
        for (const [dx, dy] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
          [r, r],
          [r, -r],
          [-r, r],
          [-r, -r],
        ] as const)
          if (solid(x + dx, y + dy) && !isRing(x + dx, y + dy)) {
            ls += lum(x + dx, y + dy);
            ln++;
          }
      if (ln > 0) {
        bs += ls / ln;
        bn++;
      }
    }
  return {
    ring: rs / Math.max(1, rn),
    inside: is / Math.max(1, inN),
    behind: bs / Math.max(1, bn),
  };
}

const MINE = (['bushveld', 'karoo'] as const).flatMap((area) =>
  cameoFrames(area).filter((f) => /^(beetle_|tort_|ost_|dust$)/.test(f.name)),
);

describe('small cameo art (D-075)', () => {
  it('covers the beetle, the tortoise, the ostrich and the dust', () => {
    expect(MINE.length).toBe(6 + 4 + 4 + 1);
  });
  for (const f of MINE) {
    const animal = f.name !== 'dust';
    it(`${f.name} fits its box with a margin${animal ? ', stands on its feet and keeps darker edges' : ''}`, () => {
      const img = render(f.name);
      const e = extent(img, 8);
      expect(e.left).toBeLessThanOrEqual(f.ox - 4);
      expect(e.right).toBeLessThanOrEqual(f.w - f.ox - 4);
      expect(e.up).toBeLessThanOrEqual(f.oy - 4);
      expect(e.down).toBeLessThanOrEqual(f.h - f.oy - 4);
      if (!animal) return;
      // The lowest solid pixel (not the soft contact shadow) on the ground line, ±2 px.
      const s = extent(img, 127);
      expect(Math.abs(s.down)).toBeLessThanOrEqual(2);
      // No ink (lesson 43): the edges a shade darker than the part behind them; the near-plane
      // beetle and tortoise also darker than their whole inside. (The ostrich is ostrich.ts's
      // drawing: white plumes and pink legs at his edges round a black body, so only per part.)
      const { ring, inside, behind } = ringVsInside(img);
      expect(ring).toBeLessThan(behind);
      if (!f.name.startsWith('ost_')) expect(ring).toBeLessThan(inside);
    });
  }
});
