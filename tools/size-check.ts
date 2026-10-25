// Download-size budget check (Tech §15, M9): gzip and brotli size of a build, split into what
// the first playable hunt downloads (initial) and what loads later (lazy biome bundles), from
// Vite's build manifest (tools/sizeBudget.ts).
// Budget: initial ≤ 5 MB gzip (CLAUDE.md; `--strict` fails above it, as CI does), hard fail above
// 8 MB always (Poki < 8 MB). `--dir dist-poki` checks a portal build. `--json out.json` writes the
// report for PR evidence.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { ASSET_INDEX_PATH, indexFiles, parseAssetIndex } from '../src/game/assets/assetIndex';
import {
  BUDGET_BYTES,
  alternateAssetFiles,
  LAZY_CHUNK_BYTES,
  lazyAssetFiles,
  lazyGroups,
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
let groups: string[] = [];
let alternates = new Set<string>();
if (existsSync(indexPath)) {
  const { index, error } = parseAssetIndex(JSON.parse(readFileSync(indexPath, 'utf8')));
  if (error !== null) {
    console.error(`size: ${ASSET_INDEX_PATH} is invalid:\n${error}`);
    process.exit(1);
  }
  lazyAssets = lazyAssetFiles(index);
  groups = [...new Set(indexFiles(index).map((f) => f.group))].sort();
  alternates = alternateAssetFiles(index);
}
const split = splitInitialLazy(manifest, files, lazyAssets, alternates);
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
// v1.1: each lazy chunk (a biome, the late group) on its own, against its 1.5 MB cap.
const overChunks: string[] = [];
console.log('lazy chunks (each ≤ 1.5 MB gzip):');
for (const [g, fs] of [...lazyGroups(split.lazy, groups)].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const t = sum(lazy.filter((r) => fs.includes(r.file)));
  console.log(line({ ...t, file: `  ${g}` }));
  if (t.gz > LAZY_CHUNK_BYTES) overChunks.push(`${g} ${(t.gz / MB).toFixed(2)} MB`);
}
if (split.alternate.length > 0) {
  const alt = split.alternate.map(measure);
  console.log('alternates (the other audio format / atlas set; one player never downloads both):');
  console.log(alt.map(line).join('\n'));
  console.log(line({ ...sum(alt), file: 'ALTERNATES (not counted)' }));
}
console.log(line({ ...sum([ti, tl]), file: 'BUILD TOTAL' }));

// v1.3x (D-037): the Skietbaan (admin-only training ground) is its own lazy chunk on builds with
// the admin page, and absent from portal builds (their adapters have no admin page). D-045: the
// admin page's Project overview follows the same rule.
const portal = distName !== 'dist';
for (const [name, dir, decision] of [
  ['Skietbaan', 'src/game/range/', 'D-037'],
  ['Project overview', 'src/game/project/', 'D-045'],
] as const) {
  const keys = Object.keys(manifest).filter((k) => k.includes(dir));
  const chunks = [...new Set(keys.map((k) => manifest[k]?.file).filter((f) => f !== undefined))];
  if (portal && keys.length > 0) {
    console.error(`size: ${distName}/ carries ${name} code (${keys.join(', ')}) — FAILED.`);
    process.exit(1);
  }
  if (chunks.length > 0) {
    const rc = sum(chunks.map(measure));
    console.log(line({ ...rc, file: `${name} chunk (${chunks.join(', ')})` }));
    if (chunks.some((f) => split.initial.includes(f))) {
      console.error(`size: the ${name} chunk is in the first download — FAILED.`);
      process.exit(1);
    }
  } else console.log(`  ${name}: not in this build${portal ? ` (portal build, ${decision})` : ''}`);
}

if (jsonOut !== undefined) {
  writeFileSync(
    jsonOut,
    JSON.stringify({ dir: distName, initial: ti, lazy: tl, files: { initial, lazy } }, null, 2),
  );
}

if (overChunks.length > 0) {
  const msg = `size: lazy chunk over 1.5 MB gzip: ${overChunks.join(', ')}.`;
  if (strict) {
    console.error(`${msg} FAILED (--strict).`);
    process.exit(1);
  }
  console.warn(`${msg} WARNING (CI runs --strict).`);
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
