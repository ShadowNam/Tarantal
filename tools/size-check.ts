// Download-size budget check (Tech §15, M9): gzip and brotli size of a build, split into what
// the first playable hunt downloads (initial) and what loads later (lazy biome bundles), from
// Vite's build manifest (tools/sizeBudget.ts).
// Budget: initial ≤ 5 MB gzip (CLAUDE.md; `--strict` fails above it, as CI does), hard fail above
// 8 MB always (Poki < 8 MB). `--dir dist-poki` checks a portal build. `--json out.json` writes the
// report for PR evidence.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { ASSET_INDEX_PATH, parseAssetIndex } from '../src/game/assets/assetIndex';
import {
  BUDGET_BYTES,
  lazyAssetFiles,
  MB,
  splitInitialLazy,
  verdict,
  type ViteManifest,
} from './sizeBudget';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const distName = arg('--dir') ?? 'dist';
const strict = process.argv.includes('--strict');
const jsonOut = arg('--json');
const dist = join(import.meta.dirname, '..', distName);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

let files: string[];
let manifest: ViteManifest;
try {
  files = listFiles(dist)
    .map((f) => relative(dist, f).split(sep).join('/'))
    .sort();
  manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8')) as ViteManifest;
} catch {
  console.error(`size: ${distName}/ or its .vite/manifest.json not found — run the build first.`);
  process.exit(1);
}

interface Row {
  file: string;
  raw: number;
  gz: number;
  br: number;
}
function measure(file: string): Row {
  const bytes = readFileSync(join(dist, file));
  return {
    file,
    raw: bytes.length,
    gz: gzipSync(bytes, { level: 9 }).length,
    br: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
}
const kb = (n: number): string => `${(n / 1024).toFixed(1).padStart(8)} KB`;
const sum = (rows: readonly Row[]): Row =>
  rows.reduce((a, r) => ({ file: 'TOTAL', raw: a.raw + r.raw, gz: a.gz + r.gz, br: a.br + r.br }), {
    file: 'TOTAL',
    raw: 0,
    gz: 0,
    br: 0,
  });
const line = (r: Row): string =>
  `  ${r.file.padEnd(44)} ${kb(r.raw)} raw  ${kb(r.gz)} gz  ${kb(r.br)} br`;

// M10: delivered art and audio of the non-home biomes load with their biome (asset index groups).
const indexPath = join(dist, ASSET_INDEX_PATH);
let lazyAssets = new Set<string>();
if (existsSync(indexPath)) {
  const { index, error } = parseAssetIndex(JSON.parse(readFileSync(indexPath, 'utf8')));
  if (error !== null) {
    console.error(`size: ${ASSET_INDEX_PATH} is invalid:\n${error}`);
    process.exit(1);
  }
  lazyAssets = lazyAssetFiles(index);
}
const split = splitInitialLazy(manifest, files, lazyAssets);
const initial = split.initial.map(measure);
const lazy = split.lazy.map(measure);
const ti = sum(initial);
const tl = sum(lazy);
console.log(`size report — ${distName}/`);
console.log('initial (first playable hunt):');
console.log(initial.map(line).join('\n'));
console.log(line({ ...ti, file: 'INITIAL TOTAL' }));
console.log('lazy (loaded on first use):');
console.log(lazy.length === 0 ? '  (none)' : lazy.map(line).join('\n'));
console.log(line({ ...tl, file: 'LAZY TOTAL' }));
console.log(line({ ...sum([ti, tl]), file: 'BUILD TOTAL' }));

if (jsonOut !== undefined) {
  writeFileSync(
    jsonOut,
    JSON.stringify({ dir: distName, initial: ti, lazy: tl, files: { initial, lazy } }, null, 2),
  );
}

// Judge on gzip: every host serves it; brotli is a bonus.
const v = verdict(ti.gz);
const mb = (ti.gz / MB).toFixed(2);
const pct = ((ti.gz / BUDGET_BYTES) * 100).toFixed(1);
if (v === 'hard-fail') {
  console.error(`size: FAILED — initial ${mb} MB gzip is over the 8 MB hard limit.`);
  process.exit(1);
}
if (v === 'over-budget') {
  const msg = `size: initial ${mb} MB gzip is over the 5 MB budget.`;
  if (strict) {
    console.error(`${msg} FAILED (--strict).`);
    process.exit(1);
  }
  console.warn(`${msg} WARNING (CI runs --strict).`);
} else {
  console.log(`size: OK — initial ${mb} MB gzip (${pct}% of the 5 MB budget).`);
}
