// Validates every JSON file in content/ against the Zod schemas, then checks cross-references.
// Usage: npx tsx tools/validate-content.ts [--strict] [--dir <content dir>]
//   --strict  turns warnings (content due in later milestones) into errors. CI uses it from M8.
import { join } from 'node:path';
import { parseContent } from '../src/content/bundle';
import { checkCrossRefs } from '../src/content/crossRefs';
import { readContentDir, readI18nKeys } from '../src/content/loadNode';
import { parseFeel } from '../src/content/feel';
import { parseDailyMeta } from '../src/content/daily';
import { parseNotaboek } from '../src/content/notaboek';
import { readFileSync } from 'node:fs';

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

for (const name of fileNames) {
  const bad = report.errors.some((e) => e.file === name);
  console.log(`  ${bad ? '✗' : '✓'} ${name}`);
}
for (const w of report.warnings) console.log(`  ⚠ ${w.file}: ${w.message}`);
for (const e of report.errors) console.error(`  ✗ ${e.file}: ${e.message}`);

const summary = `${fileNames.length} files, ${report.errors.length} errors, ${report.warnings.length} warnings${strict ? ' (strict)' : ''}`;
if (report.errors.length > 0) {
  console.error(`content: FAILED — ${summary}`);
  process.exit(1);
}
console.log(`content: all files valid — ${summary}`);
