// `npm run assets:audit` (M10): lists every manifest key in three groups — final (human art),
// interim (code-drawn stand-ins from tools/art/, D-029) and placeholder — with size and where it
// is used, and fails on delivered files nothing uses and on keys or files referenced but missing.
// `--strict` is the launch gate: it also fails while any placeholder or interim key remains (CI
// runs report mode until the art lands). `--public <dir>` audits another public folder (e.g. the
// stand-ins); `--json <file>` writes the report.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ASSET_INDEX_PATH, HD_INDEX_PATH, type AssetIndex } from '../src/game/assets/assetIndex';
import { readFullIndex } from './assets/fullIndex';
import { TEX } from '../src/game/assets/AssetManifest';
import { audit, formatAudit } from './assets/audit';
import { buildCatalog } from './assets/catalog';
import { loadContent } from './testContent';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const root = join(import.meta.dirname, '..');
const publicDir = join(root, arg('--public') ?? 'public');
const strict = process.argv.includes('--strict');
const posix = (p: string): string => p.split(sep).join('/');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const content = loadContent();
const catalog = await buildCatalog(content);
const indexPath = join(publicDir, ASSET_INDEX_PATH);
let index: AssetIndex | null = null;
const early: string[] = [];
if (existsSync(indexPath)) {
  // D-053: with the HD half merged in (its files are delivered files too).
  const parsed = readFullIndex(publicDir);
  if (parsed.error === null) index = parsed.index;
  else early.push(`invalid ${ASSET_INDEX_PATH}:\n${parsed.error}`);
}
const files = walk(join(publicDir, 'assets'))
  .map((p) => posix(relative(publicDir, p)))
  .filter((p) => p !== ASSET_INDEX_PATH && p !== HD_INDEX_PATH)
  .sort();
const sources = new Map<string, string>();
for (const p of [...walk(join(root, 'src')), ...walk(join(root, 'content'))]) {
  const rel = posix(relative(root, p));
  if (/\.test\.ts$/.test(rel) || !/\.(ts|json)$/.test(rel) || rel.startsWith('src/i18n/')) continue;
  sources.set(rel, readFileSync(p, 'utf8'));
}
const report = audit({
  catalog,
  index,
  files,
  sources,
  tex: TEX,
  bytesOf: (path) => {
    const full = join(publicDir, path);
    return existsSync(full) ? statSync(full).size : null;
  },
});
const problems = [...early, ...report.problems];
console.log(
  `asset audit — ${posix(relative(root, publicDir))}/ (${index === null ? 'no asset index: nothing delivered yet' : ASSET_INDEX_PATH})`,
);
console.log(formatAudit({ ...report, problems }, strict));
const jsonOut = arg('--json');
if (jsonOut !== undefined)
  writeFileSync(jsonOut, `${JSON.stringify({ ...report, problems }, null, 2)}\n`);
const fail = problems.length > 0 || (strict && report.placeholders + report.interims > 0);
console.log(fail ? '\nassets:audit: FAIL' : '\nassets:audit: OK');
process.exit(fail ? 1 : 0);
