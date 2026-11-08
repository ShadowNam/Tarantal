// v1.15 (D-077) `npm run art:compare-polish [-- --ref <git ref>]`: BEFORE | AFTER sheets of the
// five polished items, without a browser. BEFORE is the delivered art at `ref` (default: main
// before v1.15, c9a6135e), read with `git show`; AFTER is art-source/ as it is now. Each sheet:
// before on the left, after on the right, the same crops at the same scale, on the scene's own
// background (night for the braai, veld for the rest). Writes
// docs/art-preview/compare/v115-polish-before-after-<item>.png (palette PNGs, small).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { braaiFrames, sheetRect as braaiRect } from '../../src/game/braai/braaiSheet';
import { brakkieFrames, sheetRect as brakkieRect } from '../../src/game/brakkie/brakkieSheet';
import { baboonFrames } from '../../src/game/view/baboon/baboonSheet';
import { blank, blit, crop, decodePng, encodePng8, resize, type Rgba } from '../assets/image';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'docs', 'art-preview', 'compare');
/** main before v1.15's art changes. */
const DEFAULT_REF = 'c9a6135e';

interface Crop {
  readonly file: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Display scale of this crop. */
  readonly k: number;
}

interface Item {
  readonly name: string;
  readonly bg: readonly [number, number, number];
  readonly crops: readonly Crop[];
}

const NIGHT = [24, 28, 44] as const;
const VELD = [196, 184, 150] as const;

function items(): Item[] {
  const braai = 'art-source/sprites/braai/sheet.png';
  const bf = (n: string, k: number): Crop => {
    const f = braaiFrames().find((x) => x.name === n);
    if (f === undefined) throw new Error(`braai: no ${n}`);
    const r = braaiRect(f);
    // The sheet is the 2× master; soft frames (res < 1) are shown at their drawn size.
    return { file: braai, x: r.x * 2, y: r.y * 2, w: r.w * 2, h: r.h * 2, k: k / f.res };
  };
  const brakkie = 'art-source/sprites/brakkie/sheet.png';
  const kf = (n: string): Crop => {
    const f = brakkieFrames().find((x) => x.name === n);
    if (f === undefined) throw new Error(`brakkie: no ${n}`);
    const r = brakkieRect(f);
    return { file: brakkie, x: r.x * 2, y: r.y * 2, w: r.w * 2, h: r.h * 2, k: 1.5 };
  };
  const baboons = 'art-source/sprites/baboons/sheet.png';
  const af = (n: string): Crop => {
    const f = baboonFrames().find((x) => x.name === n);
    if (f === undefined) throw new Error(`baboons: no ${n}`);
    return { file: baboons, x: f.x * 2, y: f.y * 2, w: f.w * 2, h: f.h * 2, k: 1.2 };
  };
  const bird = (plane: string, clip: string, frame: number, k: number): Crop => {
    const file = `art-source/birds/tarentaal/planes/${plane}/${clip}/${String(frame).padStart(2, '0')}.png`;
    const size = plane === 'near' ? [1240, 800] : plane === 'mid' ? [620, 400] : [310, 200];
    // The bird sits in the middle of its 620 × 400 box: crop the empty margins away.
    const [w = 0, h = 0] = size;
    return { file, x: w * 0.18, y: h * 0.12, w: w * 0.66, h: h * 0.8, k };
  };
  return [
    { name: 'braai', bg: NIGHT, crops: [bf('sit_idle', 2), bf('hearth', 2.4), bf('flame_0', 2)] },
    { name: 'bakkie', bg: NIGHT, crops: [bf('bakkie', 1.6)] },
    { name: 'brakkie', bg: VELD, crops: [kf('trot_a'), kf('sit'), kf('run_a')] },
    {
      name: 'guineafowl',
      bg: VELD,
      crops: [
        bird('near', 'peek', 0, 0.6),
        bird('mid', 'alert', 0, 0.9),
        bird('mid', 'flap', 1, 0.9),
      ],
    },
    { name: 'baboon', bg: VELD, crops: [af('walk_a'), af('throw_a'), af('mielie_a')] },
  ];
}

function readAt(ref: string | null, file: string): Rgba {
  const bytes =
    ref === null
      ? readFileSync(join(ROOT, file))
      : execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, maxBuffer: 64 << 20 });
  return decodePng(new Uint8Array(bytes));
}

/** Alpha-composites `img` over a flat background colour. */
function flatten(img: Rgba, bg: readonly [number, number, number]): Rgba {
  const o = blank(img.width, img.height);
  for (let i = 0; i < img.width * img.height; i++) {
    const a = (img.data[i * 4 + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++)
      o.data[i * 4 + c] = Math.round((img.data[i * 4 + c] ?? 0) * a + (bg[c] ?? 0) * (1 - a));
    o.data[i * 4 + 3] = 255;
  }
  return o;
}

/** One side: the item's crops in a row. */
function side(item: Item, ref: string | null, cache: Map<string, Rgba>): Rgba {
  const parts = item.crops.map((c) => {
    const key = `${ref ?? 'now'}|${c.file}`;
    let src = cache.get(key);
    if (src === undefined) {
      src = readAt(ref, c.file);
      cache.set(key, src);
    }
    const cut = crop(src, Math.round(c.x), Math.round(c.y), Math.round(c.w), Math.round(c.h));
    return resize(cut, Math.round(cut.width * c.k * 0.5), Math.round(cut.height * c.k * 0.5));
  });
  const gap = 12;
  const w = parts.reduce((a, p) => a + p.width + gap, gap);
  const h = Math.max(...parts.map((p) => p.height)) + gap * 2;
  const out = blank(w, h);
  let x = gap;
  for (const p of parts) {
    blit(out, p, x, h - gap - p.height);
    x += p.width + gap;
  }
  return flatten(out, item.bg);
}

/** Writes every item's BEFORE | AFTER sheet; returns the files written. */
export function writePolishCompare(ref = DEFAULT_REF): string[] {
  mkdirSync(OUT, { recursive: true });
  const cache = new Map<string, Rgba>();
  const written: string[] = [];
  for (const item of items()) {
    const a = side(item, ref, cache);
    const b = side(item, null, cache);
    const bar = 6;
    const out = blank(a.width + bar + b.width, Math.max(a.height, b.height));
    out.data.fill(255);
    blit(out, a, 0, 0);
    blit(out, b, a.width + bar, 0);
    const file = join(OUT, `v115-polish-before-after-${item.name}.png`);
    writeFileSync(file, encodePng8(out));
    written.push(file);
  }
  return written;
}

if (process.argv[1]?.endsWith('polishCompare.ts')) {
  const i = process.argv.indexOf('--ref');
  const ref = i >= 0 ? process.argv[i + 1] : undefined;
  const files = writePolishCompare(ref);
  console.log(`art:compare-polish: ${files.length} sheets → docs/art-preview/compare/`);
}
