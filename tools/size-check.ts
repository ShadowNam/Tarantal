// Download-size budget check (Tech §15): gzip and brotli size of everything in dist/ that the
// first playable hunt needs. Until biomes are lazy-loaded (M8), that is the whole of dist/.
// Budget: warn above 5 MB compressed, fail above 8 MB (CLAUDE.md, Poki < 8 MB).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const MB = 1024 * 1024;
const BUDGET_BYTES = 5 * MB;
const HARD_FAIL_BYTES = 8 * MB;

const dist = join(import.meta.dirname, '..', 'dist');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

let files: string[];
try {
  files = listFiles(dist).sort();
} catch {
  console.error('size: dist/ not found — run `npm run build` first.');
  process.exit(1);
}

let raw = 0;
let gz = 0;
let br = 0;
const rows: string[] = [];
for (const file of files) {
  const bytes = readFileSync(file);
  const g = gzipSync(bytes, { level: 9 }).length;
  const b = brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  raw += bytes.length;
  gz += g;
  br += b;
  rows.push(
    `  ${relative(dist, file).padEnd(44)} ${kb(bytes.length)} raw  ${kb(g)} gz  ${kb(b)} br`,
  );
}

function kb(n: number): string {
  return `${(n / 1024).toFixed(1).padStart(8)} KB`;
}

console.log(rows.join('\n'));
console.log(`  ${'TOTAL'.padEnd(44)} ${kb(raw)} raw  ${kb(gz)} gz  ${kb(br)} br`);
// Judge on gzip: every host serves it; brotli is a bonus.
const pct = ((gz / BUDGET_BYTES) * 100).toFixed(1);
if (gz > HARD_FAIL_BYTES) {
  console.error(`size: FAILED — ${(gz / MB).toFixed(2)} MB gzip is over the 8 MB hard limit.`);
  process.exit(1);
}
if (gz > BUDGET_BYTES) {
  console.warn(`size: WARNING — ${(gz / MB).toFixed(2)} MB gzip is over the 5 MB budget.`);
} else {
  console.log(`size: OK — ${(gz / MB).toFixed(2)} MB gzip (${pct}% of the 5 MB budget).`);
}
