// The Android test app's launcher icon and splash (D-058), cut from the game's own guineafowl art
// (art-source/birds/tarentaal, the near plane's alert pose) on the Karoo colours. Writes
// android/app/src/main/res/: the adaptive icon's foreground per density (the background is the
// Karoo gradient in drawable/ic_launcher_background.xml), the legacy square and round icons, and
// the splash bird. Pure Node (pngjs). Rerun after the bird's art changes:
//   npx tsx tools/make-android-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dirname, '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const SOURCE = join(root, 'art-source', 'birds', 'tarentaal', 'planes', 'near', 'alert', '00.png');

/** Karoo dusk: the icon background's top and bottom (drawable/ic_launcher_background.xml). */
const KAROO_TOP: readonly [number, number, number] = [0xe8, 0xa4, 0x52];
const KAROO_BOTTOM: readonly [number, number, number] = [0xa8, 0x4a, 0x2a];

interface Img {
  readonly w: number;
  readonly h: number;
  /** Premultiplied RGBA, 0..1. */
  readonly px: Float32Array;
}

function load(path: string): Img {
  const p = PNG.sync.read(readFileSync(path));
  const px = new Float32Array(p.width * p.height * 4);
  for (let i = 0; i < p.width * p.height; i++) {
    const a = (p.data[i * 4 + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = ((p.data[i * 4 + c] ?? 0) / 255) * a;
    px[i * 4 + 3] = a;
  }
  return { w: p.width, h: p.height, px };
}

function blank(w: number, h: number): Img {
  return { w, h, px: new Float32Array(w * h * 4) };
}

/** Samples `src` over the box [sx0, sx1) × [sy0, sy1) (area average: good down and up). */
function sampleBox(src: Img, sx0: number, sy0: number, sx1: number, sy1: number): number[] {
  const out = [0, 0, 0, 0];
  const steps = 4;
  for (let j = 0; j < steps; j++)
    for (let i = 0; i < steps; i++) {
      const x = sx0 + ((i + 0.5) / steps) * (sx1 - sx0);
      const y = sy0 + ((j + 0.5) / steps) * (sy1 - sy0);
      // Bilinear inside the box.
      const x0 = Math.floor(x - 0.5);
      const y0 = Math.floor(y - 0.5);
      const fx = x - 0.5 - x0;
      const fy = y - 0.5 - y0;
      for (const [dx, dy, wgt] of [
        [0, 0, (1 - fx) * (1 - fy)],
        [1, 0, fx * (1 - fy)],
        [0, 1, (1 - fx) * fy],
        [1, 1, fx * fy],
      ] as const) {
        const px = Math.min(src.w - 1, Math.max(0, x0 + dx));
        const py = Math.min(src.h - 1, Math.max(0, y0 + dy));
        for (let c = 0; c < 4; c++)
          out[c] = (out[c] ?? 0) + (src.px[(py * src.w + px) * 4 + c] ?? 0) * wgt;
      }
    }
  return out.map((v) => v / (steps * steps));
}

/** Draws the crop (x, y, size × size of the source) into `dst` at (dx, dy), `ds` px square. */
function drawCrop(
  dst: Img,
  src: Img,
  crop: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  dw: number,
): void {
  const dh = (dw * crop.h) / crop.w;
  const k = crop.w / dw;
  for (let y = Math.max(0, Math.floor(dy)); y < Math.min(dst.h, Math.ceil(dy + dh)); y++)
    for (let x = Math.max(0, Math.floor(dx)); x < Math.min(dst.w, Math.ceil(dx + dw)); x++) {
      const sx = crop.x + (x - dx) * k;
      const sy = crop.y + (y - dy) * k;
      const s = sampleBox(src, sx, sy, sx + k, sy + k);
      const a = s[3] ?? 0;
      const i = (y * dst.w + x) * 4;
      for (let c = 0; c < 4; c++) dst.px[i + c] = (s[c] ?? 0) + (dst.px[i + c] ?? 0) * (1 - a);
    }
}

function fillGradient(img: Img, mask: (x: number, y: number) => number): void {
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const m = mask((x + 0.5) / img.w, (y + 0.5) / img.h);
      if (m <= 0) continue;
      const t = y / Math.max(1, img.h - 1);
      const i = (y * img.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = ((KAROO_TOP[c] ?? 0) * (1 - t) + (KAROO_BOTTOM[c] ?? 0) * t) / 255;
        img.px[i + c] = v * m;
      }
      img.px[i + 3] = m;
    }
}

/** Multiplies the alpha by a coverage mask (0..1, 4× supersampled by the caller's shape). */
function clip(img: Img, inside: (x: number, y: number) => boolean): void {
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      let hits = 0;
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++)
          if (inside((x + (i + 0.5) / 4) / img.w, (y + (j + 0.5) / 4) / img.h)) hits++;
      const m = hits / 16;
      const k = (y * img.w + x) * 4;
      for (let c = 0; c < 4; c++) img.px[k + c] = (img.px[k + c] ?? 0) * m;
    }
}

function save(img: Img, path: string): void {
  const p = new PNG({ width: img.w, height: img.h });
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.px[i * 4 + 3] ?? 0;
    for (let c = 0; c < 3; c++)
      p.data[i * 4 + c] = a > 0 ? Math.round(Math.min(1, (img.px[i * 4 + c] ?? 0) / a) * 255) : 0;
    p.data[i * 4 + 3] = Math.round(a * 255);
  }
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, PNG.sync.write(p, { deflateLevel: 9 }));
  console.log(`  wrote ${path.slice(root.length + 1)}`);
}

const bird = load(SOURCE);
/** The head, the neck and the top of the spotted back (source px). */
const HEAD = { x: 735, y: 228, w: 225, h: 225 };
/** The whole bird for the splash. */
const WHOLE = { x: 330, y: 240, w: 620, h: 545 };

const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
] as const;

for (const [name, k] of DENSITIES) {
  // Adaptive foreground: 108 dp, the head inside the 66 dp safe circle.
  const fg = blank(108 * k, 108 * k);
  const head = 72 * k;
  drawCrop(fg, bird, HEAD, (fg.w - head) / 2, (fg.h - head) / 2, head);
  save(fg, join(res, `mipmap-${name}`, 'ic_launcher_foreground.png'));
  // Legacy icons (Android 7 and older launchers): 48 dp, gradient + head, square and round.
  for (const round of [false, true]) {
    const icon = blank(48 * k, 48 * k);
    fillGradient(icon, () => 1);
    const h = 42 * k;
    drawCrop(icon, bird, HEAD, (icon.w - h) / 2, (icon.h - h) / 2 + 1 * k, h);
    clip(icon, (x, y) => {
      if (round) return (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.25;
      const r = 0.16;
      const qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
      const qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
      return qx * qx + qy * qy <= r * r;
    });
    save(icon, join(res, `mipmap-${name}`, round ? 'ic_launcher_round.png' : 'ic_launcher.png'));
  }
  // Splash: the whole bird, 220 dp wide, centred on the Karoo gradient (drawable/splash.xml).
  const sw = 220 * k;
  const splash = blank(sw, Math.round((sw * WHOLE.h) / WHOLE.w));
  drawCrop(splash, bird, WHOLE, 0, 0, sw);
  save(splash, join(res, `drawable-${name}`, 'splash_bird.png'));
}
