// D-035: finds interim art cut off by its texture edge. A layer must be clear along its top row
// (art above the crop is lost: the v1.2 Karoo farmhouse trees); a prop must be clear along all
// four edges (its frame is too small). Reads the PNGs in art-source/ (run after art:interim).
//   npx tsx tools/art/edgeAudit.ts        (exit 1 when something touches an edge)
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, type Rgba } from '../assets/image';

const ROOT = join(import.meta.dirname, '..', '..', 'art-source');
/** A row/column counts as cut when this many pixels in it are this opaque. */
const MIN_ALPHA = 24;

/** Opaque pixels on each edge (top, bottom, left, right). */
export function edgeHits(img: Rgba): { top: number; bottom: number; left: number; right: number } {
  const a = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3] ?? 0;
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;
  for (let x = 0; x < img.width; x++) {
    if (a(x, 0) >= MIN_ALPHA) top++;
    if (a(x, img.height - 1) >= MIN_ALPHA) bottom++;
  }
  for (let y = 0; y < img.height; y++) {
    if (a(0, y) >= MIN_ALPHA) left++;
    if (a(img.width - 1, y) >= MIN_ALPHA) right++;
  }
  return { top, bottom, left, right };
}

const pngs = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pngs(join(dir, e.name)) : e.name.endsWith('.png') ? [join(dir, e.name)] : [],
  );

/** Scenery prop folders (FX, UI, omen and crate sprites are effects that may fill their frame). */
const PROP_DIRS = ['karoo', 'bushveld', 'kalahari', 'okavango', 'secret', 'helper'];
/** Sprites meant to touch an edge: a water strip tiles sideways. */
const EDGE_OK = new Set(['sprites/biome/water.png']);

/**
 * Every cut in art-source/: a layer with art on its top row (the sky fills its texture), a scenery
 * prop with art on its top, left or right edge (its bottom may touch: that is the ground).
 */
export function edgeProblems(root = ROOT): string[] {
  const problems: string[] = [];
  for (const biome of readdirSync(join(root, 'layers'))) {
    for (const f of pngs(join(root, 'layers', biome))) {
      if (f.endsWith('sky.png')) continue;
      const h = edgeHits(readPng(f));
      if (h.top > 0)
        problems.push(`${f.slice(root.length + 1)}: ${String(h.top)} px cut at the top`);
    }
  }
  for (const dir of PROP_DIRS) {
    const d = join(root, 'sprites', dir);
    if (!existsSync(d)) continue;
    for (const f of pngs(d)) {
      const rel = f.slice(root.length + 1);
      if (EDGE_OK.has(rel)) continue;
      const { top, left, right } = edgeHits(readPng(f));
      const cut = Object.entries({ top, left, right }).filter(([, n]) => n > 0);
      if (cut.length > 0)
        problems.push(`${rel}: ${cut.map(([k, n]) => `${k} ${String(n)}`).join(', ')}`);
    }
  }
  return problems;
}

if (process.argv[1]?.endsWith('edgeAudit.ts')) {
  const problems = edgeProblems();
  for (const p of problems) console.log(p);
  console.log(`edge audit: ${String(problems.length)} cut`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}
