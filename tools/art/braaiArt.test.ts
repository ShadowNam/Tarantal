// v1.15 (D-077): Die Braai's art against its frame table — the drawings fit their boxes with a
// margin (lesson 12: nothing clipped at a canvas edge; the bakkie's tyres stand on the frame's
// foot by design), and the fire ring is made of distinct fieldstones (the owner: "not tyres").
import { describe, expect, it } from 'vitest';
import { braaiFrame, type BraaiFrame } from '../../src/game/braai/braaiSheet';
import { frameArtForFit, hearthStones } from './braai';
import { renderSvg } from './raster';
import { g, svgDoc } from './svg';

/** The drawing's extent round its origin (design px), from a render on a roomy canvas. */
function extent(name: BraaiFrame) {
  const W = 480;
  const H = 360;
  const OX = 240;
  const OY = 260;
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

describe('Die Braai art (D-077)', () => {
  it('the fire ring is at least 12 distinct fieldstones of several rocks and sizes', () => {
    const stones = hearthStones();
    expect(stones.length).toBeGreaterThanOrEqual(12);
    expect(new Set(stones.map((s) => s.colour)).size).toBeGreaterThanOrEqual(4);
    const sizes = stones.map((s) => s.rx);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(1.25);
    // Irregular outlines, every one its own (no stamped copies), both rows present.
    for (const s of stones) expect(s.pts.length).toBeGreaterThanOrEqual(7);
    const shapes = new Set(
      stones.map((s) =>
        s.pts.map(([x, y]) => `${Math.round(x - s.x)},${Math.round(y - s.y)}`).join(' '),
      ),
    );
    expect(shapes.size).toBe(stones.length);
    expect(stones.some((s) => s.front)).toBe(true);
    expect(stones.some((s) => !s.front)).toBe(true);
  });

  it.each(['hearth', 'sit_idle', 'sit_sip', 'sit_poke', 'dance_a', 'dance_b'] as const)(
    '%s fits its frame with a margin (the kettle and its bail inside the hearth)',
    (name) => {
      const f = braaiFrame(name);
      expect(f).toBeDefined();
      if (f === undefined) return;
      const e = extent(name);
      expect(e.left).toBeLessThanOrEqual(f.ox - 1);
      expect(e.right).toBeLessThanOrEqual(f.w - f.ox - 1);
      expect(e.up).toBeLessThanOrEqual(f.oy - 1);
      expect(e.down).toBeLessThanOrEqual(f.h - f.oy);
    },
  );

  it('the bakkie fits its frame left, right and above (its tyres stand on the foot line)', () => {
    const f = braaiFrame('bakkie');
    expect(f).toBeDefined();
    if (f === undefined) return;
    const e = extent('bakkie');
    expect(e.left).toBeLessThanOrEqual(f.ox - 1);
    expect(e.right).toBeLessThanOrEqual(f.w - f.ox - 1);
    expect(e.up).toBeLessThanOrEqual(f.oy - 1);
  });
});
