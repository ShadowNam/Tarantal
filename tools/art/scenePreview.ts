// Scenery previews (D-031): composes a biome's interim layers and props from art-source/ the way
// ParallaxView places them (container x = screen centre − planeCentreX(cx, f); a prop at
// u × core width), at camera centre cx on a 1920 × 1080 screen. Optionally stamps bird
// silhouettes and frames on top to check contrast. Docs only (docs/art-preview/), never game art.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { Biome } from '../../src/content/schemas';
import { planeCentreX } from '../../src/sim/camera';
import { coreWidth, LAYER_BLEED_PX } from '../../src/sim/world';
import { blank, resize, type Rgba } from '../assets/image';

const SRC = join(import.meta.dirname, '..', '..', 'art-source');

function read(path: string): Rgba {
  const p = PNG.sync.read(readFileSync(path));
  return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
}

interface Sidecar {
  readonly top?: number;
  readonly originX?: number;
  readonly originY?: number;
}

function json(path: string): Sidecar | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Sidecar;
  } catch {
    return null;
  }
}

/** Source-over blend of `src` onto `dst` at integer (x, y), with an optional alpha multiplier. */
export function over(dst: Rgba, src: Rgba, x0: number, y0: number, alpha = 1): void {
  const x = Math.round(x0);
  const y = Math.round(y0);
  for (let sy = Math.max(0, -y); sy < src.height && sy + y < dst.height; sy++) {
    for (let sx = Math.max(0, -x); sx < src.width && sx + x < dst.width; sx++) {
      const si = (sy * src.width + sx) * 4;
      const a = ((src.data[si + 3] ?? 0) / 255) * alpha;
      if (a <= 0) continue;
      const di = ((sy + y) * dst.width + sx + x) * 4;
      const da = (dst.data[di + 3] ?? 0) / 255;
      const oa = a + da * (1 - a);
      for (let k = 0; k < 3; k++) {
        const s = src.data[si + k] ?? 0;
        const d = dst.data[di + k] ?? 0;
        dst.data[di + k] = Math.round((s * a + d * da * (1 - a)) / Math.max(1e-6, oa));
      }
      dst.data[di + 3] = Math.round(oa * 255);
    }
  }
}

export interface Stamp {
  /** Plane layer id the stamp stands on (its x is in that layer's coordinates). */
  readonly layer: string;
  readonly x: number;
  readonly y: number;
  readonly img: Rgba;
  /** Origin within img (px). */
  readonly ox: number;
  readonly oy: number;
}

/** The scene at camera centre `cx` (960 … 4160), `width` design px wide (1080 tall). */
export function composeScene(
  biome: Biome,
  cx: number,
  width = 1920,
  stamps: readonly Stamp[] = [],
  /** The placeholder's origin (fractions) for props whose sidecar gives none. */
  originOf: (key: string) => { x: number; y: number } = () => ({ x: 0.5, y: 0.5 }),
): Rgba {
  const out = blank(width, 1080);
  const order = [...biome.layers].sort((a, b) => a.scrollFactor - b.scrollFactor);
  for (const layer of order) {
    const rootX = width / 2 - planeCentreX(cx, layer.scrollFactor);
    const png = join(SRC, 'layers', biome.id, `${layer.id}.png`);
    if (existsSync(png)) {
      const side = json(png.replace(/\.png$/, '.json'));
      over(out, read(png), rootX - LAYER_BLEED_PX, side?.top ?? 0);
    }
    for (const prop of biome.props) {
      if (prop.layer !== layer.id) continue;
      const p = join(SRC, 'sprites', `${prop.asset}.png`);
      if (!existsSync(p)) continue;
      const img = read(p);
      const side = json(p.replace(/\.png$/, '.json'));
      const base = originOf(prop.asset);
      const ox = (side?.originX ?? base.x) * img.width;
      const oy = (side?.originY ?? base.y) * img.height;
      over(out, img, rootX + prop.u * coreWidth(layer.scrollFactor) - ox, prop.y - oy);
    }
    for (const s of stamps)
      if (s.layer === layer.id) over(out, s.img, rootX + s.x - s.ox, s.y - s.oy);
  }
  return out;
}

/** Downscaled copy for contact sheets. */
export const shrink = (img: Rgba, w: number): Rgba =>
  resize(img, w, Math.round((img.height * w) / img.width));
