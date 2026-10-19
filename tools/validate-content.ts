// Validates every JSON file in content/ against the Zod schemas, then checks cross-references.
// Usage: npx tsx tools/validate-content.ts [--strict]
//   --strict  turns warnings (content due in later milestones) into errors. CI uses it from M8.
import { join } from 'node:path';
import { parseContent } from '../src/content/bundle';
import { checkCrossRefs } from '../src/content/crossRefs';
import { readContentDir, readI18nKeys } from '../src/content/loadNode';

const root = join(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');

const raw = readContentDir(join(root, 'content'));
const parsed = parseContent(raw);
const fileNames = [...Object.keys(raw.files), ...Object.keys(raw.biomes)].sort();

if (!parsed.ok) {
  console.error('content: schema validation FAILED');
  for (const e of parsed.errors) console.error(`  ✗ ${e.file}: ${e.message}`);
  process.exit(1);
}

const report = checkCrossRefs(parsed.bundle, {
  i18nKeys: readI18nKeys(join(root, 'src/i18n/en.json')),
  strict,
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
