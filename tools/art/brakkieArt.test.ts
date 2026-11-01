// v1.12 (D-069): Brakkie's art against its frame table — every drawing fits its box with a margin
// (lesson 12: nothing clipped at a canvas edge), and every pose but the bird stands on its origin:
// its lowest paw within 2 px of the feet line (lesson 18: nothing floats).
import { describe, expect, it } from 'vitest';
import { brakkieFrames } from '../../src/game/brakkie/brakkieSheet';
import { frameArtForFit } from './brakkie';
import { renderSvg } from './raster';
import { g, svgDoc } from './svg';

/** The drawing's extent round its origin (design px), from a render on a roomy canvas. */
function extent(name: Parameters<typeof frameArtForFit>[0]) {
  const W = 600;
  const H = 400;
  const OX = 300;
  const OY = 300;
  const img = renderSvg(
    svgDoc(
      W,
      H,
      [0, 0, W, H],
      '',
      g({ transform: `translate(${OX} ${OY})` }, frameArtForFit(name)),
    ),
  );
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((img.data[(y * W + x) * 4 + 3] ?? 0) > 8) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return { left: OX - x0, right: x1 - OX + 1, up: OY - y0, down: y1 - OY + 1 };
}

describe('Brakkie art (D-069)', () => {
  for (const f of brakkieFrames()) {
    it(`${f.name} fits its box with a margin${f.name === 'bird' ? '' : ' and stands on its feet'}`, () => {
      const e = extent(f.name);
      expect(e.left).toBeLessThanOrEqual(f.ox - 2);
      expect(e.right).toBeLessThanOrEqual(f.w - f.ox - 2);
      expect(e.up).toBeLessThanOrEqual(f.oy - 2);
      expect(e.down).toBeLessThanOrEqual(f.h - f.oy - 2);
      if (f.name !== 'bird') {
        // The paw's ink reaches the ground line: within 2 px above it, ≤ 6 px below (its outline).
        expect(e.down).toBeGreaterThanOrEqual(-2);
        expect(e.down).toBeLessThanOrEqual(6);
      }
    });
  }
});
