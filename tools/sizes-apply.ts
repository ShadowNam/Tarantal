// `npm run sizes:apply -- <sizes.json> [--force-rest] [--dry-run]` (v1.22.1, D-086): writes the
// owner's animal sizes (admin page → Sizes → Download sizes) into content/ — each value, with its px
// hit box sets × the same change — reports the code constants to change by hand, and records in
// tools/sizes.ts OWNER_SET every true-size row the owner's choice takes outside ±15 % of real. An
// edit whose `from` no longer matches is a conflict: they are printed and nothing is written,
// unless --force-rest (then the others are applied). The content files keep their layout (each
// number written in place, tools/jsonNumbers.ts). Run `npm run check` afterwards.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWNER_SET } from './sizes';
import {
  artAdvice,
  codeAdvice,
  planSizes,
  SIZES_TS,
  SizesFileSchema,
  writeOwnerSet,
} from './sizesApply';
import { writeNumbers } from './jsonNumbers';
import { loadContent, loadFeel } from './testContent';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
if (input === undefined) {
  console.error('usage: npm run sizes:apply -- <sizes.json> [--force-rest] [--dry-run]');
  process.exit(2);
}
const parsed = SizesFileSchema.safeParse(JSON.parse(readFileSync(input, 'utf8')));
if (!parsed.success) {
  console.error(`sizes:apply — ${input} is not a sizes file:\n${parsed.error.message}`);
  process.exit(2);
}
const file = parsed.data;
const dryRun = args.includes('--dry-run');
const r = planSizes(root, file, {
  forceRest: args.includes('--force-rest'),
  today: new Date().toISOString().slice(0, 10),
  content: loadContent(),
  feel: loadFeel(),
  ownerSet: OWNER_SET,
});
console.log(
  `sizes:apply — ${input} (build ${file.build.version} · ${file.build.commit}, ${file.exportedAt}): ${String(file.edits.length)} edits`,
);
for (const c of r.conflicts) {
  const e = c.edit;
  console.log(
    `  CONFLICT ${e.id} ${e.path}: ${
      c.reason === 'missing'
        ? 'no such value in the repo'
        : c.reason === 'bad-path'
          ? 'not a size path'
          : c.reason === 'schema'
            ? `outside the content's limits (${c.message ?? ''})`
            : `now ${String(c.now)}, the edit expected ${String(e.from)}`
    }`,
  );
}
if (r.conflicts.length > 0 && r.applied.length === 0 && r.code.length === 0) {
  console.log(
    `  nothing written: ${String(r.conflicts.length)} conflicts (fix them, or --force-rest applies the rest)`,
  );
  process.exit(1);
}
for (const e of r.already) console.log(`  already in: ${e.id} ${e.path} = ${String(e.to)}`);
for (const e of r.applied) {
  console.log(`  ${e.id} (${e.area}) ${e.path}: ${String(e.from)} → ${String(e.to)}`);
  const art = artAdvice(e);
  if (art !== null) console.log(`    note: ${art}`);
}
for (const e of r.code) console.log(`  CHANGE BY HAND ${e.id}: ${codeAdvice(e)}`);
for (const id of r.ownerAdded) console.log(`  OWNER_SET + ${id}: ${r.ownerSet[id]?.why ?? ''}`);
for (const id of r.ownerRemoved) console.log(`  OWNER_SET − ${id} (back within ±15 %)`);
const owner = r.ownerAdded.length > 0 || r.ownerRemoved.length > 0;
const written = [...r.written, ...(owner ? [SIZES_TS] : [])];
console.log(`  ${dryRun ? 'would write' : 'wrote'} ${written.join(', ') || 'nothing'}`);
if (!dryRun) {
  // Each number in place: the file keeps its layout and key order.
  for (const f of r.written) {
    const path = join(root, f);
    writeFileSync(path, writeNumbers(readFileSync(path, 'utf8'), r.docs[f]));
  }
  if (owner) {
    const path = join(root, SIZES_TS);
    writeFileSync(path, writeOwnerSet(readFileSync(path, 'utf8'), r.ownerSet));
  }
  // OWNER_SET is written as plain TS; Prettier has the last word on its layout.
  if (owner) spawnSync('npx', ['prettier', '--write', SIZES_TS], { cwd: root, stdio: 'ignore' });
  if (written.length > 0) console.log('  next: npm run check (content, sizes and art tests)');
}
// --force-rest applied the others; the conflicts left still fail the run.
if (r.conflicts.length > 0) process.exitCode = 1;
