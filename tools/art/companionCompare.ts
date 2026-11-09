// v1.17 (D-079) `npm run art:compare-companion [-- --ref <git ref>]`: BEFORE | AFTER sheets of
// Brakkie, without a browser. BEFORE is the delivered sheet at `ref` (default: main before v1.17,
// 910eabbf), read with `git show`; AFTER is art-source/ now. Two pictures: the whole sheet each
// side (the frame set grew: 4-frame cycles, the point, the proud hop, the tilt, the marker), and a
// close-up of his head and coat (trot_a, BEFORE's frame at its old place | AFTER's). Writes
// docs/art-preview/compare/v117-companion-before-after-<item>.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brakkieFrames, sheetRect } from '../../src/game/brakkie/brakkieSheet';
import { blank, blit, crop, decodePng, encodePng8, resize, type Rgba } from '../assets/image';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'docs', 'art-preview', 'compare');
const DEFAULT_REF = '910eabbf';
const SHEET = 'art-source/sprites/brakkie/sheet.png';
const VELD = [196, 184, 150] as const;
/** trot_a on the v1.16 sheet (2× master px): its packed place before v1.17's frames. */
const OLD_TROT_A = { x: 570, y: 4, w: 228, h: 170 };

function readAt(ref: string | null, file: string): Rgba {
  const bytes =
    ref === null
      ? readFileSync(join(ROOT, file))
      : execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, maxBuffer: 64 << 20 });
  return decodePng(new Uint8Array(bytes));
}

function flatten(img: Rgba): Rgba {
  const o = blank(img.width, img.height);
  for (let i = 0; i < img.width * img.height; i++) {
    const a = (img.data[i * 4 + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++)
      o.data[i * 4 + c] = Math.round((img.data[i * 4 + c] ?? 0) * a + (VELD[c] ?? 0) * (1 - a));
    o.data[i * 4 + 3] = 255;
  }
  return o;
}

function side(a: Rgba, b: Rgba): Rgba {
  const bar = 8;
  const out = blank(a.width + bar + b.width, Math.max(a.height, b.height));
  out.data.fill(255);
  blit(out, a, 0, 0);
  blit(out, b, a.width + bar, 0);
  return out;
}

export function writeCompanionCompare(ref = DEFAULT_REF): string[] {
  mkdirSync(OUT, { recursive: true });
  const before = readAt(ref, SHEET);
  const after = readAt(null, SHEET);
  const written: string[] = [];
  const whole = join(OUT, 'v117-companion-before-after-brakkie-sheet.png');
  writeFileSync(whole, encodePng8(side(flatten(before), flatten(after))));
  written.push(whole);
  const f = brakkieFrames().find((x) => x.name === 'trot_a');
  if (f === undefined) throw new Error('brakkie: no trot_a');
  const r = sheetRect(f);
  const o = OLD_TROT_A;
  const a = crop(before, o.x, o.y, Math.min(o.w, before.width - o.x), o.h);
  const b = crop(after, r.x * 2, r.y * 2, r.w * 2, r.h * 2);
  const up = (img: Rgba): Rgba => resize(img, img.width * 2, img.height * 2);
  const close = join(OUT, 'v117-companion-before-after-brakkie-closeup.png');
  writeFileSync(close, encodePng8(side(flatten(up(a)), flatten(up(b)))));
  written.push(close);
  return written;
}

if (process.argv[1]?.endsWith('companionCompare.ts')) {
  const i = process.argv.indexOf('--ref');
  const ref = i >= 0 ? process.argv[i + 1] : undefined;
  for (const file of writeCompanionCompare(ref)) console.log(file);
}
