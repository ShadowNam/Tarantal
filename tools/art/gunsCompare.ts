// v1.19 (D-084) `npm run art:compare-guns [-- --ref <git ref>]`: BEFORE | AFTER sheets of the Gun
// Shed's pictures, the first-person guns and the meerkats, without a browser. BEFORE is the art at
// `ref` (default: main before v1.19, 412128d3), read with `git show`; AFTER is art-source/ now.
//   shed: what each Guns-tab card showed (the first-person idle frame, cropped like ShedScene did)
//         | the painted side view (art-source/sprites/shed/guns.png);
//   guns: each gun's idle frame (2× master, half size) on the veld colour;
//   meerkats: the colony sheet on sand.
// Writes docs/art-preview/compare/v119-guns-before-after-<item>.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHED_GUN_ORDER, shedGunCell } from '../../src/game/ui/shedGunSheet';
import {
  blank,
  blit,
  crop,
  decodePng,
  encodePng8,
  opaqueBounds,
  resize,
  type Rgba,
} from '../assets/image';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'docs', 'art-preview', 'compare');
/** main before v1.19's changes. */
const DEFAULT_REF = '412128d3';
const CARD = [139, 90, 43] as const;
const VELD = [196, 184, 150] as const;
const SAND = [207, 138, 87] as const;

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

/** Images stacked top to bottom (each on its own row), `gap` px apart. */
function column(images: readonly Rgba[], gap = 8): Rgba {
  const w = Math.max(...images.map((i) => i.width));
  const h = images.reduce((t, i) => t + i.height + gap, -gap);
  const out = blank(w, h);
  out.data.fill(255);
  let y = 0;
  for (const i of images) {
    blit(out, i, 0, y);
    y += i.height + gap;
  }
  return out;
}

function sideBySide(a: Rgba, b: Rgba): Rgba {
  const bar = 12;
  const out = blank(a.width + bar + b.width, Math.max(a.height, b.height));
  out.data.fill(255);
  blit(out, a, 0, 0);
  blit(out, b, a.width + bar, 0);
  return out;
}

/** A gun's idle frame cropped to its opaque bounds. */
function idle(ref: string | null, id: string): Rgba {
  const img = readAt(ref, `art-source/guns/${id}/idle/00.png`);
  const b = opaqueBounds(img);
  return b === null ? img : crop(img, b.x, b.y, b.w, b.h);
}

/** A card-sized tile (h px tall) on the card's wood colour. */
function card(img: Rgba, h: number, w: number): Rgba {
  const k = Math.min(h / img.height, w / img.width);
  const pic = flatten(
    resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k))),
    CARD,
  );
  const out = blank(w, h);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = CARD[0];
    out.data[i + 1] = CARD[1];
    out.data[i + 2] = CARD[2];
    out.data[i + 3] = 255;
  }
  blit(out, pic, Math.round((w - pic.width) / 2), Math.round((h - pic.height) / 2));
  return out;
}

export function writeGunsCompare(ref = DEFAULT_REF): string[] {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  const put = (name: string, img: Rgba): void => {
    const file = join(OUT, `v119-guns-before-after-${name}.png`);
    writeFileSync(file, encodePng8(img));
    written.push(file);
  };
  // The shed: the primary guns' cards, then the two crate guns (new side views only).
  const sheet = readAt(null, 'art-source/sprites/shed/guns.png');
  const before: Rgba[] = [];
  const after: Rgba[] = [];
  for (const id of SHED_GUN_ORDER) {
    const c = shedGunCell(id);
    if (c === null) continue;
    before.push(card(idle(ref, id), 140, 400));
    after.push(card(crop(sheet, c.x, c.y, c.w, c.h), 140, 400));
  }
  put('shed', sideBySide(column(before), column(after)));
  // The first-person guns at half the 2× master.
  const gunsBefore: Rgba[] = [];
  const gunsAfter: Rgba[] = [];
  for (const id of SHED_GUN_ORDER) {
    for (const [side, list] of [
      [ref, gunsBefore],
      [null, gunsAfter],
    ] as const) {
      const img = idle(side, id);
      list.push(flatten(resize(img, Math.round(img.width / 2), Math.round(img.height / 2)), VELD));
    }
  }
  const pairs = SHED_GUN_ORDER.map((_, i) => {
    const a = gunsBefore[i];
    const b = gunsAfter[i];
    return a === undefined || b === undefined ? blank(1, 1) : sideBySide(a, b);
  });
  // Two columns of pairs keep the sheet ≲ 1600 px tall.
  const half = Math.ceil(pairs.length / 2);
  put('guns', sideBySide(column(pairs.slice(0, half)), column(pairs.slice(half))));
  // The meerkats' sheet.
  const mk = (r: string | null): Rgba => {
    const s = readAt(r, 'art-source/sprites/desert/meerkats.png');
    return flatten(resize(s, Math.round(s.width * 0.5), Math.round(s.height * 0.5)), SAND);
  };
  put('meerkats', sideBySide(mk(ref), mk(null)));
  return written;
}

if (process.argv[1]?.endsWith('gunsCompare.ts')) {
  const i = process.argv.indexOf('--ref');
  const ref = i >= 0 ? process.argv[i + 1] : undefined;
  for (const f of writeGunsCompare(ref)) console.log(f);
}
