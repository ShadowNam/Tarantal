// RGBA images for the asset pipeline (M10): PNG read/write (pngjs, pure JS), area-average
// resizing and blitting. No native dependencies, so the pipeline runs the same on every machine.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export interface Rgba {
  readonly width: number;
  readonly height: number;
  /** width × height × 4 bytes, row-major, straight (not premultiplied) alpha. */
  readonly data: Uint8Array;
}

export function blank(width: number, height: number): Rgba {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function readPng(path: string): Rgba {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Deterministic PNG bytes (same pixels → same file, so content hashes are stable). */
export function encodePng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}

/**
 * Area-average resize (good for downscaling masters; upscaling falls back to nearest). Colour is
 * weighted by alpha so transparent edges don't darken the outline.
 */
export function resize(src: Rgba, width: number, height: number): Rgba {
  const out = blank(width, height);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = Math.max(y0 + 1e-9, (y + 1) * sy);
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = Math.max(x0 + 1e-9, (x + 1) * sx);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let py = Math.floor(y0); py < Math.min(src.height, Math.ceil(y1)); py++) {
        const wy = Math.min(y1, py + 1) - Math.max(y0, py);
        for (let px = Math.floor(x0); px < Math.min(src.width, Math.ceil(x1)); px++) {
          const w = (Math.min(x1, px + 1) - Math.max(x0, px)) * wy;
          if (w <= 0) continue;
          const i = (py * src.width + px) * 4;
          const al = (src.data[i + 3] ?? 0) * w;
          r += (src.data[i] ?? 0) * al;
          g += (src.data[i + 1] ?? 0) * al;
          b += (src.data[i + 2] ?? 0) * al;
          a += al;
          area += w;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = area > 0 ? Math.round(a / area) : 0;
    }
  }
  return out;
}

/** Copies `src` into `dst` at (x, y) (no blending: atlas cells don't overlap). */
export function blit(dst: Rgba, src: Rgba, x: number, y: number): void {
  for (let row = 0; row < src.height; row++) {
    const from = row * src.width * 4;
    dst.data.set(src.data.subarray(from, from + src.width * 4), ((y + row) * dst.width + x) * 4);
  }
}

/** A rectangle of `src` as its own image. */
export function crop(src: Rgba, x: number, y: number, width: number, height: number): Rgba {
  const out = blank(width, height);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * src.width + x) * 4;
    out.data.set(src.data.subarray(from, from + width * 4), row * width * 4);
  }
  return out;
}
