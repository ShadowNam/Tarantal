// `npm run assets:standins` (M10): generates the stand-in delivery that proves the art swap path
// — one tarentaal atlas (every §3.4 clip), the Karoo mid layer, two SFX (shot, poof) and (PR C)
// two Karoo music stems plus its ambience loop. It is
// drawn by this script (flat magenta shapes stamped "STAND-IN", synthesised noise), never human
// art, and packed by the real pipeline into tests/fixtures/standin-assets/. Nothing here ships:
// the e2e serves it with page.route, and `STANDIN=1 npm run dev` serves it for a look.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BIRD_CLIPS } from '../src/game/assets/assetIndex';
import { buildCatalog } from './assets/catalog';
import { blank, encodePng, type Rgba } from './assets/image';
import { packAssets } from './assets/pack';
import { BIRD_BOX, CLIP_SPEC } from './assets/targets';
import { writeWav } from './assets/wav';
import { loadContent } from './testContent';

export const STANDIN_PUBLIC = join(
  import.meta.dirname,
  '..',
  'tests',
  'fixtures',
  'standin-assets',
);

type Colour = readonly [number, number, number, number];
const MAGENTA: Colour = [255, 0, 200, 255];
const INK: Colour = [27, 20, 16, 255];
const WHITE: Colour = [255, 255, 255, 255];
const TEAL: Colour = [0, 190, 170, 255];

function plot(img: Rgba, x: number, y: number, c: Colour): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(c, (Math.floor(y) * img.width + Math.floor(x)) * 4);
}

function ellipse(
  img: Rgba,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: Colour,
  line: number,
): void {
  for (let y = Math.floor(cy - ry - line); y <= cy + ry + line; y++)
    for (let x = Math.floor(cx - rx - line); x <= cx + rx + line; x++) {
      const d = Math.hypot((x - cx) / (rx + line), (y - cy) / (ry + line));
      const inner = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (inner <= 1) plot(img, x, y, fill);
      else if (d <= 1) plot(img, x, y, INK);
    }
}

function rect(img: Rgba, x: number, y: number, w: number, h: number, c: Colour): void {
  for (let yy = Math.floor(y); yy < y + h; yy++)
    for (let xx = Math.floor(x); xx < x + w; xx++) plot(img, xx, yy, c);
}

// 5×7 bitmap glyphs for the stamp text.
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function text(img: Rgba, s: string, x: number, y: number, px: number, c: Colour): void {
  // ASCII only (the glyph table above), so indexing by UTF-16 unit is safe.
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS[s.charAt(i)] ?? GLYPHS[' '];
    g?.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++)
        if (row.charAt(rx) === '1') rect(img, x + (i * 6 + rx) * px, y + ry * px, px, px, c);
    });
  }
}

/** One frame of the stand-in bird: body, head and a wing whose angle steps with the frame. */
function birdFrame(scale: number, clipIndex: number, frame: number, frames: number): Rgba {
  const img = blank(BIRD_BOX.width * scale, BIRD_BOX.height * scale);
  const ox = BIRD_BOX.originX * scale;
  const oy = BIRD_BOX.originY * scale;
  const line = 6 * scale;
  ellipse(img, ox, oy, 150 * scale, 95 * scale, MAGENTA, line);
  ellipse(img, ox + 150 * scale, oy - 80 * scale, 48 * scale, 44 * scale, MAGENTA, line);
  const t = frames > 1 ? frame / (frames - 1) : 0;
  const wingY = oy - 40 * scale + (t - 0.5) * 140 * scale;
  ellipse(img, ox - 30 * scale, wingY, 110 * scale, 34 * scale, TEAL, line);
  // Legs, so walking clips read as standing.
  rect(img, ox - 40 * scale, oy + 90 * scale, 10 * scale, 70 * scale, INK);
  rect(img, ox + 30 * scale, oy + 90 * scale, 10 * scale, 70 * scale, INK);
  text(img, 'STAND-IN', ox - 115 * scale, oy - 18 * scale, 6 * scale, WHITE);
  // Clip index as a row of pips, frame as a bar: easy to tell clips apart in screenshots.
  for (let i = 0; i <= clipIndex; i++)
    rect(img, (20 + i * 22) * scale, 16 * scale, 14 * scale, 14 * scale, INK);
  rect(img, 20 * scale, 40 * scale, (40 + frame * 30) * scale, 10 * scale, TEAL);
  return img;
}

function layer(width: number, height: number): Rgba {
  const img = blank(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      plot(img, x, y, Math.floor((x + y) / 40) % 2 === 0 ? TEAL : [0, 120, 110, 255]);
  rect(img, 0, 0, width, 8, INK);
  for (let x = 200; x < width; x += 700) text(img, 'STAND-IN', x, height / 2 - 28, 8, MAGENTA);
  return img;
}

/** Tiny seeded PRNG so the stand-in sounds (and their hashes) never change. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sound(seconds: number, seed: number, f: (t: number, noise: number) => number): Uint8Array {
  const rate = 44100;
  const n = Math.round(seconds * rate);
  const rnd = prng(seed);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = f(i / rate, rnd() * 2 - 1);
  return writeWav({ sampleRate: rate, channels: [ch] });
}

function put(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

export async function makeStandins(publicDir = STANDIN_PUBLIC): Promise<string[]> {
  const content = loadContent();
  const catalog = await buildCatalog(content);
  const src = mkdtempSync(join(tmpdir(), 'tm-standin-'));
  try {
    // Masters at 1× the bird box: @1x on every plane, @2x where that is no bigger (mid, far).
    BIRD_CLIPS.forEach((clip, ci) => {
      const frames = CLIP_SPEC[clip].frames;
      for (let f = 0; f < frames; f++)
        put(
          join(src, 'birds', 'tarentaal', clip, `${String(f).padStart(2, '0')}.png`),
          encodePng(birdFrame(1, ci, f, frames)),
        );
    });
    const mid = catalog.layers.get('karoo/mid');
    if (mid === undefined) throw new Error('karoo/mid layer missing from the catalog');
    put(join(src, 'layers', 'karoo-autumn', 'mid.png'), encodePng(layer(mid.width, mid.height)));
    // Shot: a hard noise crack with a fast decay. Poof: a softer noise puff with a falling tone.
    put(
      join(src, 'audio', 'sfx', 'shot.wav'),
      sound(0.5, 1, (t, n) => n * Math.exp(-t * 18)),
    );
    put(
      join(src, 'audio', 'sfx', 'poof.wav'),
      sound(
        0.45,
        2,
        (t, n) =>
          (0.6 * n + 0.4 * Math.sin(2 * Math.PI * (500 - 600 * t) * t)) *
          Math.exp(-t * 9) *
          Math.min(1, t * 80),
      ),
    );
    // M10 PR C: two Karoo music stems and an ambience loop (3 s each, seamless: whole cycles of
    // the tones), so the e2e can watch the music start, crossfade and mute.
    const chord = (freqs: readonly number[], seed: number) =>
      sound(
        3,
        seed,
        (t, n) =>
          (freqs.reduce((a, f) => a + Math.sin(2 * Math.PI * f * t), 0) / freqs.length) * 0.5 +
          n * 0.02,
      );
    put(join(src, 'audio', 'music', 'karoo-autumn', 'calm.wav'), chord([220, 277, 330], 3));
    put(join(src, 'audio', 'music', 'karoo-autumn', 'build.wav'), chord([247, 311, 370, 440], 4));
    put(
      join(src, 'audio', 'ambience', 'karoo-autumn.wav'),
      sound(3, 5, (_t, n) => n * 0.3),
    );
    const report = await packAssets({ src, publicDir, content, catalog });
    if (report.errors.length > 0) throw new Error(report.errors.join('\n'));
    for (const w of report.warnings) console.warn(`warning: ${w}`);
    return [...report.written];
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('make-standins.ts')) {
  const written = await makeStandins();
  console.log(`assets:standins — ${written.length} files in tests/fixtures/standin-assets/`);
}
