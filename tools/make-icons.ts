// Generates the placeholder PWA icons in public/icons/ (a helmeted guineafowl on the night
// colour). Pure Node: a tiny RGBA rasteriser + PNG encoder (zlib), no image dependencies.
// Final icons are human-authored art (M10, art bible); rerun with: npx tsx tools/make-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

type RGB = readonly [number, number, number];

const BG: RGB = [0x1b, 0x14, 0x10];
const BODY: RGB = [0x3a, 0x3f, 0x4a];
const DOT: RGB = [0xf3, 0xea, 0xd3];
const FACE: RGB = [0x5b, 0x8f, 0xd6];
const WATTLE: RGB = [0xd2, 0x3c, 0x2e];
const HELMET: RGB = [0xc9, 0x8a, 0x3a];
const EYE: RGB = [0x1b, 0x14, 0x10];

class Canvas {
  readonly px: Uint8Array;
  constructor(readonly size: number) {
    this.px = new Uint8Array(size * size * 4);
  }
  /** Fills every pixel whose centre (in 0..1 units) passes `inside`, with 4× supersampling. */
  fill(colour: RGB, inside: (x: number, y: number) => boolean): void {
    const n = this.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let hits = 0;
        for (let sy = 0; sy < 2; sy++)
          for (let sx = 0; sx < 2; sx++)
            if (inside((x + 0.25 + sx * 0.5) / n, (y + 0.25 + sy * 0.5) / n)) hits++;
        if (hits === 0) continue;
        const a = hits / 4;
        const i = (y * n + x) * 4;
        for (let c = 0; c < 3; c++)
          this.px[i + c] = Math.round((this.px[i + c] ?? 0) * (1 - a) + (colour[c] ?? 0) * a);
        this.px[i + 3] = 255;
      }
    }
  }
}

const ellipse =
  (cx: number, cy: number, rx: number, ry: number) =>
  (x: number, y: number): boolean =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Draws the bird into the unit square scaled by `k` around the centre (k < 1 = padding). */
function drawIcon(size: number, k: number): Uint8Array {
  const c = new Canvas(size);
  c.fill(BG, () => true);
  const t = (f: (x: number, y: number) => boolean) => (x: number, y: number) =>
    f(0.5 + (x - 0.5) / k, 0.5 + (y - 0.5) / k);
  c.fill(BODY, t(ellipse(0.45, 0.6, 0.3, 0.22)));
  for (let i = 0; i < 18; i++) {
    const dx = 0.22 + (i % 6) * 0.08 + (Math.floor(i / 6) % 2) * 0.04;
    const dy = 0.52 + Math.floor(i / 6) * 0.07;
    if (ellipse(0.45, 0.6, 0.27, 0.19)(dx, dy)) c.fill(DOT, t(ellipse(dx, dy, 0.016, 0.016)));
  }
  c.fill(
    BODY,
    t((x, y) => x > 0.62 && x < 0.7 && y > 0.36 && y < 0.55),
  );
  c.fill(FACE, t(ellipse(0.7, 0.33, 0.085, 0.075)));
  c.fill(
    HELMET,
    t((x, y) => y < 0.28 && y > 0.16 && Math.abs(x - 0.7) < (y - 0.16) * 0.35),
  );
  c.fill(WATTLE, t(ellipse(0.71, 0.42, 0.03, 0.045)));
  c.fill(
    HELMET,
    t((x, y) => x > 0.77 && x < 0.84 && Math.abs(y - 0.34) < (0.84 - x) * 0.35),
  );
  c.fill(EYE, t(ellipse(0.72, 0.31, 0.014, 0.014)));
  return c.px;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

const outDir = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
const icons: [string, number, number][] = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Maskable: keep the bird inside the 80 % safe zone.
  ['icon-maskable-512.png', 512, 0.75],
  ['apple-touch-icon.png', 180, 0.9],
];
for (const [name, size, k] of icons) {
  writeFileSync(join(outDir, name), encodePng(size, drawIcon(size, k)));
  console.log(`  wrote public/icons/${name}`);
}
