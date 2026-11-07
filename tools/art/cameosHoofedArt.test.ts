// v1.13 (D-075): the hoofed cameos' art against their frame tables — every drawing fits its box
// with a margin (lesson 12: nothing clipped at a cell's edge), stands on its origin (lesson 18:
// nothing floats; the pronking springbok too, the game lifts it), and keeps its edge a shade darker
// than the body inside it (lesson 43: no ink, but no melting into the veld either).
import { describe, expect, it } from 'vitest';
import type { CameoSheetArea } from '../../src/game/cameos/cameoKeys';
import { cameoFrames } from '../../src/game/cameos/cameoSheet';
import { hoofedFrameArt, isHoofedFrame } from './cameosHoofed';
import { renderSvg } from './raster';
import { g, svgDoc } from './svg';

const W = 600;
const H = 500;
const OX = 300;
const OY = 400;

function render(name: Parameters<typeof hoofedFrameArt>[0]) {
  const art = hoofedFrameArt(name);
  return renderSvg(
    svgDoc(W, H, [0, 0, W, H], art.defs, g({ transform: `translate(${OX} ${OY})` }, art.body)),
  );
}

const AREAS: readonly CameoSheetArea[] = ['bushveld', 'kalahari', 'namibie'];

describe('hoofed cameo art (D-075)', () => {
  for (const area of AREAS)
    for (const f of cameoFrames(area).filter((x) => isHoofedFrame(x.name)))
      it(`${f.name} fits its box, stands on its origin and keeps a darker edge`, () => {
        const img = render(f.name);
        const alpha = (x: number, y: number): number =>
          x < 0 || y < 0 || x >= W || y >= H ? 0 : (img.data[(y * W + x) * 4 + 3] ?? 0);
        const lum = (x: number, y: number): number => {
          const i = (y * W + x) * 4;
          return (
            0.299 * (img.data[i] ?? 0) +
            0.587 * (img.data[i + 1] ?? 0) +
            0.114 * (img.data[i + 2] ?? 0)
          );
        };
        let x0 = W;
        let y0 = H;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++)
            if (alpha(x, y) > 8) {
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
            }
        // (a) Inside its box with ≥ 4 px to spare on every side.
        expect(OX - x0).toBeLessThanOrEqual(f.ox - 4);
        expect(x1 - OX + 1).toBeLessThanOrEqual(f.w - f.ox - 4);
        expect(OY - y0).toBeLessThanOrEqual(f.oy - 4);
        expect(y1 - OY + 1).toBeLessThanOrEqual(f.h - f.oy - 4);
        // (b) The lowest hoof on the origin's line (within 2 px).
        expect(Math.abs(y1 + 1 - OY)).toBeLessThanOrEqual(2);
        // (c) The outermost opaque ring is darker than the interior (≥ 3 px in from the edge).
        const solid = (x: number, y: number): boolean => alpha(x, y) > 200;
        let ring = 0;
        let ringN = 0;
        let inner = 0;
        let innerN = 0;
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            if (!solid(x, y)) continue;
            let edge = false;
            let deep = true;
            for (let dy = -3; dy <= 3 && deep; dy++)
              for (let dx = -3; dx <= 3; dx++) {
                if (solid(x + dx, y + dy)) continue;
                deep = false;
                if (Math.abs(dx) + Math.abs(dy) === 1) edge = true;
                break;
              }
            if (!edge)
              edge = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ].some(([dx, dy]) => !solid(x + (dx ?? 0), y + (dy ?? 0)));
            if (edge) {
              ring += lum(x, y);
              ringN++;
            } else if (deep) {
              inner += lum(x, y);
              innerN++;
            }
          }
        expect(ringN).toBeGreaterThan(20);
        expect(innerN).toBeGreaterThan(20);
        expect(ring / ringN).toBeLessThan(inner / innerN - 15);
      });

  it('gives every frame its own ids (several frames share one sheet SVG)', () => {
    const a = hoofedFrameArt('sb_walk_a');
    const b = hoofedFrameArt('sb_walk_a');
    const ids = (s: string): string[] => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] ?? '');
    const idsA = ids(a.defs + a.body);
    const idsB = new Set(ids(b.defs + b.body));
    expect(idsA.length).toBeGreaterThan(0);
    expect(idsA.every((id) => id.startsWith('cmh') && !idsB.has(id))).toBe(true);
  });
});
