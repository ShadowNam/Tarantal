// `npm run text:apply -- <corrections.json> [--force-rest] [--dry-run]` (v1.14, D-076): writes the
// owner's corrections (admin → Texts & voices → Download corrections) into the text tables and
// voice.config.json, then prints and writes art-source/audio/voice/redo.json — the voiced lines
// to re-make per voice language. An edit whose `from` no longer matches is a conflict: they are
// printed and nothing is written, unless --force-rest (then the others are applied).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { voicedKeys } from '../src/game/audio/voicedKeys';
import { RaidActionSchema } from '../src/content/schemas';
import { VOICE_LANGUAGES } from '../src/i18n/i18n';
import { loadContent, loadFeel } from './testContent';
import { applyCorrections, CorrectionsSchema, mergeRedo, REDO_PATH } from './textApply';

const root = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
if (input === undefined) {
  console.error('usage: npm run text:apply -- <corrections.json> [--force-rest] [--dry-run]');
  process.exit(2);
}
const parsed = CorrectionsSchema.safeParse(JSON.parse(readFileSync(input, 'utf8')));
if (!parsed.success) {
  console.error(`text:apply — ${input} is not a corrections file:\n${parsed.error.message}`);
  process.exit(2);
}
const file = parsed.data;
const dryRun = args.includes('--dry-run');
const r = applyCorrections(root, file, {
  forceRest: args.includes('--force-rest'),
  voiced: new Set(voicedKeys(loadContent(), loadFeel().barks, RaidActionSchema.options).all),
  dryRun,
});
console.log(
  `text:apply — ${input} (build ${file.build.version} · ${file.build.commit}, ${file.exportedAt}): ${String(file.edits.length)} edits`,
);
for (const c of r.conflicts) {
  const e = c.edit;
  console.log(
    `  CONFLICT ${e.table}/${e.lang} ${e.key} (${e.field}): ${
      c.reason === 'missing'
        ? 'no such key'
        : c.reason === 'not-voice-language'
          ? `no voice in ${e.lang}`
          : `now ${JSON.stringify(c.now)}, the edit expected ${JSON.stringify(e.from)}`
    }`,
  );
}
if (r.conflicts.length > 0 && r.applied.length === 0) {
  console.log(
    `  nothing written: ${String(r.conflicts.length)} conflicts (fix them, or --force-rest applies the rest)`,
  );
  process.exit(1);
}
for (const e of r.already)
  console.log(`  already in: ${e.table}/${e.lang} ${e.key} (${e.field})`);
for (const e of r.applied)
  console.log(`  ${e.table}/${e.lang} ${e.key} (${e.field}): ${JSON.stringify(e.to)}`);
console.log(`  ${dryRun ? 'would write' : 'wrote'} ${r.written.join(', ') || 'nothing'}`);
// The files are written as 2-space JSON; Prettier has the last word on their layout.
if (!dryRun && r.written.length > 0)
  spawnSync('npx', ['prettier', '--write', ...r.written], { cwd: root, stdio: 'ignore' });
const redo = mergeRedo(root, basename(input), r.redo);
for (const l of VOICE_LANGUAGES)
  console.log(`  redo ${l}: ${redo.redo[l].length === 0 ? '—' : redo.redo[l].join(', ')}`);
if (!dryRun) {
  const path = join(root, REDO_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(redo, null, 2)}\n`);
  console.log(`  wrote ${REDO_PATH}`);
}
