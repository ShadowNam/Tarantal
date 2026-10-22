// SVG → RGBA via resvg (D-029): pure Rust (tiny-skia), no GPU and no browser, so the interim art
// renders the same on this box and in CI.
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import type { Rgba } from '../assets/image';

export function renderSvg(svg: string): Rgba {
  const png = new Resvg(svg, { font: { loadSystemFonts: false }, shapeRendering: 2 })
    .render()
    .asPng();
  const img = PNG.sync.read(png);
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

/** Blends every visible pixel toward `hex` by `amount` (far-plane atmospheric tint, bible §1.4). */
export function tint(img: Rgba, hex: string, amount: number): Rgba {
  if (amount <= 0) return img;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = new Uint8Array(img.data);
  for (let i = 0; i < out.length; i += 4) {
    if ((out[i + 3] ?? 0) === 0) continue;
    for (let k = 0; k < 3; k++)
      out[i + k] = Math.round((out[i + k] ?? 0) * (1 - amount) + (c[k] ?? 0) * amount);
  }
  return { ...img, data: out };
}
