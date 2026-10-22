// Before | after preview pairs (D-029): docs/art-preview/screens/<name>-<before|after>-<project>.png
// → docs/art-preview/compare/<name>-<project>.png, capped in width and written as palette PNGs so
// the committed previews stay small. `npx tsx tools/art/compare.ts` rebuilds every pair.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { blank, blit, encodePng8, resize, type Rgba } from '../assets/image';

export const PREVIEW_DIR = join(import.meta.dirname, '..', '..', 'docs', 'art-preview');
const RAW = join(PREVIEW_DIR, 'screens');
const OUT = join(PREVIEW_DIR, 'compare');
/** Width of each half in the pair (px). */
const HALF_W = 800;
const GAP = 8;

function read(path: string): Rgba {
  const p = PNG.sync.read(readFileSync(path));
  return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
}

/** Writes one pair; returns false when either screenshot is missing. */
export function composePair(name: string, project: string): boolean {
  const paths = ['before', 'after'].map((v) => join(RAW, `${name}-${v}-${project}.png`));
  if (!paths.every((p) => existsSync(p))) return false;
  const [a, b] = paths.map((p) => {
    const img = read(p);
    return resize(img, HALF_W, Math.round((img.height * HALF_W) / img.width));
  }) as [Rgba, Rgba];
  const out = blank(HALF_W * 2 + GAP, Math.max(a.height, b.height));
  out.data.fill(255);
  blit(out, a, 0, 0);
  blit(out, b, HALF_W + GAP, 0);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}-${project}.png`), encodePng8(out));
  return true;
}

if (process.argv[1]?.endsWith('compare.ts')) {
  const pairs = new Set(
    readdirSync(RAW)
      .map((f) => /^(.*)-(before|after)-(.*)\.png$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1] ?? ''}|${m[3] ?? ''}`),
  );
  let n = 0;
  for (const p of pairs) {
    const [name = '', project = ''] = p.split('|');
    if (composePair(name, project)) n++;
  }
  console.log(`compare: ${n} pairs → docs/art-preview/compare/`);
}
