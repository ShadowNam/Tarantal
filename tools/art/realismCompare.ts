// v1.16 (D-078) `npm run art:compare-realism [-- --ref <git ref>]`: BEFORE | AFTER sheets of the
// baboons and the bakkie, without a browser. BEFORE is the delivered art at `ref` (default: main
// before v1.16, e6748555), read with `git show`; AFTER is art-source/ as it is now. The baboons:
// the whole sheet each side (the frame set changed: the ridge's sitting row became the peeks and
// the sentinel); the bakkie: the hunt's Karoo bakkie (Standard, on the veld) and the braai's (its
// frame, at night). Writes docs/art-preview/compare/v116-realism-before-after-<item>.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { braaiFrames, sheetRect as braaiRect } from '../../src/game/braai/braaiSheet';
import { blank, blit, crop, decodePng, encodePng8, resize, type Rgba } from '../assets/image';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'docs', 'art-preview', 'compare');
/** main before v1.16's changes. */
const DEFAULT_REF = 'e6748555';
const NIGHT = [24, 28, 44] as const;
const VELD = [196, 184, 150] as const;

function readAt(ref: string | null, file: string): Rgba {
  const bytes =
    ref === null
      ? readFileSync(join(ROOT, file))
      : execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, maxBuffer: 64 << 20 });
  return decodePng(new Uint8Array(bytes));
}

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

interface Item {
  readonly name: string;
  readonly bg: readonly [number, number, number];
  /** One side's picture at `ref` (null: now). */
  readonly at: (ref: string | null) => Rgba;
}

function items(): Item[] {
  const braaiBakkie = (ref: string | null): Rgba => {
    const f = braaiFrames().find((x) => x.name === 'bakkie');
    if (f === undefined) throw new Error('braai: no bakkie frame');
    const r = braaiRect(f);
    const sheet = readAt(ref, 'art-source/sprites/braai/sheet.png');
    const c = crop(sheet, r.x * 2, r.y * 2, r.w * 2, r.h * 2);
    return resize(c, Math.round(c.width * 0.8), Math.round(c.height * 0.8));
  };
  return [
    {
      name: 'baboons',
      bg: VELD,
      at: (ref) => {
        const s = readAt(ref, 'art-source/sprites/baboons/sheet.png');
        return resize(s, Math.round(s.width * 0.6), Math.round(s.height * 0.6));
      },
    },
    {
      name: 'bakkie-hunt',
      bg: VELD,
      at: (ref) => readAt(ref, 'art-source/sprites/karoo/bakkie.png'),
    },
    { name: 'bakkie-braai', bg: NIGHT, at: braaiBakkie },
  ];
}

/** Writes each item's BEFORE | AFTER sheet; returns the files written. */
export function writeRealismCompare(ref = DEFAULT_REF): string[] {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  for (const item of items()) {
    const a = flatten(item.at(ref), item.bg);
    const b = flatten(item.at(null), item.bg);
    const bar = 8;
    const out = blank(a.width + bar + b.width, Math.max(a.height, b.height));
    out.data.fill(255);
    blit(out, a, 0, 0);
    blit(out, b, a.width + bar, 0);
    const file = join(OUT, `v116-realism-before-after-${item.name}.png`);
    writeFileSync(file, encodePng8(out));
    written.push(file);
  }
  return written;
}

if (process.argv[1]?.endsWith('realismCompare.ts')) {
  const i = process.argv.indexOf('--ref');
  const ref = i >= 0 ? process.argv[i + 1] : undefined;
  for (const f of writeRealismCompare(ref)) console.log(f);
}
