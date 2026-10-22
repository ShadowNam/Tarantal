// Validates every JSON file in content/ against the Zod schemas, then checks cross-references.
// Usage: npx tsx tools/validate-content.ts [--strict] [--dir <content dir>]
//   --strict  turns warnings (content due in later milestones) into errors. CI uses it from M8.
import { join } from 'node:path';
import { parseContent } from '../src/content/bundle';
import { checkCrossRefs } from '../src/content/crossRefs';
import { readContentDir, readI18nKeys } from '../src/content/loadNode';
import { parseFeel } from '../src/content/feel';
import { parseDailyMeta } from '../src/content/daily';
import { findEpochCopies } from './epochCheck';
import { parseNotaboek } from '../src/content/notaboek';
import { readdirSync, readFileSync } from 'node:fs';
import { checkLanguage, checkLanguageSet } from '../src/content/i18nCheck';
import { LANGUAGES } from '../src/i18n/i18n';

const root = join(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');
const dirArg = process.argv.indexOf('--dir');
const contentDir = dirArg >= 0 ? (process.argv[dirArg + 1] ?? '') : join(root, 'content');

const raw = readContentDir(contentDir);
const parsed = parseContent(raw);
const fileNames = [...Object.keys(raw.files), ...Object.keys(raw.biomes)].sort();

if (!parsed.ok) {
  console.error('content: schema validation FAILED');
  for (const e of parsed.errors) console.error(`  ✗ ${e.file}: ${e.message}`);
  process.exit(1);
}

// Client-only feel file (not part of the sim bundle, D-019).
const feel = parseFeel(JSON.parse(readFileSync(join(contentDir, 'client/feel.json'), 'utf8')));
if (!feel.ok) {
  console.error('content: client/feel.json FAILED');
  for (const e of feel.errors) console.error(`  ✗ client/feel.json: ${e}`);
  process.exit(1);
}
fileNames.push('client/feel.json');

// Meta-only Notaboek challenges (not part of the sim bundle).
const notaboek = parseNotaboek(
  JSON.parse(readFileSync(join(contentDir, 'meta/notaboek.json'), 'utf8')),
);
if (!notaboek.ok) {
  console.error('content: meta/notaboek.json FAILED');
  for (const e of notaboek.errors) console.error(`  ✗ meta/notaboek.json: ${e}`);
  process.exit(1);
}
fileNames.push('meta/notaboek.json');

// Meta-only Daily Hunt settings (not part of the sim bundle, D-024).
const daily = parseDailyMeta(JSON.parse(readFileSync(join(contentDir, 'meta/daily.json'), 'utf8')));
if (!daily.ok) {
  console.error('content: meta/daily.json FAILED');
  for (const e of daily.errors) console.error(`  ✗ meta/daily.json: ${e}`);
  process.exit(1);
}
fileNames.push('meta/daily.json');
fileNames.sort();

const report = checkCrossRefs(parsed.bundle, {
  i18nKeys: readI18nKeys(join(root, 'src/i18n/en.json')),
  strict,
  notaboek: notaboek.notaboek,
  daily: daily.value,
});

const errors = [...report.errors];
// v1.0.1 (D-028 §2): the epoch lives only in meta/daily.json — no copy in game, tool or e2e code.
const codeFiles = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? codeFiles(`${dir}/${d.name}`)
      : d.name.endsWith('.ts')
        ? [`${dir}/${d.name}`]
        : [],
  );
const copies = findEpochCopies(
  [...codeFiles('src'), ...codeFiles('tools'), ...codeFiles('tests')].map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  })),
  daily.value.epoch,
);
for (const c of copies)
  errors.push({
    file: 'meta/daily.json',
    message: `epoch ${daily.value.epoch} is hard-coded in ${c.path}:${c.line} (read meta.epoch)`,
  });
// M9: every language has every string (src/i18n/<lang>.json against en.json).
const i18nDir = join(root, 'src/i18n');
const readTable = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(i18nDir, f), 'utf8')) as Record<string, unknown>;
const enTable = readTable('en.json');
const langFiles = readdirSync(i18nDir)
  .filter((x) => /^[a-z]{2}\.json$/.test(x))
  .map((x) => x.slice(0, 2));
for (const message of checkLanguageSet(LANGUAGES, langFiles))
  errors.push({ file: 'i18n/', message });
for (const f of readdirSync(i18nDir).filter((x) => /^[a-z]{2}\.json$/.test(x) && x !== 'en.json')) {
  const file = `i18n/${f}`;
  fileNames.push(file);
  for (const issue of checkLanguage(f.slice(0, 2), enTable, readTable(f)))
    errors.push({ file, message: `"${issue.key}": ${issue.message}` });
}
fileNames.sort();

for (const name of fileNames) {
  const bad = errors.some((e) => e.file === name);
  console.log(`  ${bad ? '✗' : '✓'} ${name}`);
}
for (const w of report.warnings) console.log(`  ⚠ ${w.file}: ${w.message}`);
for (const e of errors) console.error(`  ✗ ${e.file}: ${e.message}`);

const summary = `${fileNames.length} files, ${errors.length} errors, ${report.warnings.length} warnings${strict ? ' (strict)' : ''}`;
if (errors.length > 0) {
  console.error(`content: FAILED — ${summary}`);
  process.exit(1);
}
console.log(`content: all files valid — ${summary}`);
