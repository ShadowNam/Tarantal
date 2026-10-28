// Validates every JSON file in content/ against the Zod schemas, then checks cross-references.
// Usage: npx tsx tools/validate-content.ts [--strict] [--dir <content dir>]
//   --strict  turns warnings (content due in later milestones) into errors. CI uses it from M8.
import { join } from 'node:path';
import { parseContent } from '../src/content/bundle';
import { checkCrossRefs } from '../src/content/crossRefs';
import { readContentDir, readI18nKeys } from '../src/content/loadNode';
import { parseFeel } from '../src/content/feel';
import { LANTERN_BARE_GROUND_PX, LANTERN_GROUND_PX } from '../src/game/feesdae/feesdaeAssets';
import { checkGunLook } from '../src/game/ui/gunLook';
import { SFX_IDS } from '../src/game/audio/synth';
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
// v1.0.1 (D-028 §3): every bark line is an i18n key (its text, and its voice key voice/<line>).
const enKeys = new Set(readI18nKeys(join(root, 'src/i18n/en.json')));
for (const [trigger, cfg] of Object.entries(feel.feel.barks.triggers)) {
  for (const line of cfg.lines)
    if (!enKeys.has(line))
      errors.push({
        file: 'client/feel.json',
        message: `barks.triggers.${trigger}: "${line}" is not in src/i18n/en.json`,
      });
}
// D-048: every special has its look (client/feel.json feesdae.looks).
for (const f of parsed.bundle.feesdae.specials)
  if (feel.feel.feesdae.looks[f.id] === undefined)
    errors.push({
      file: 'client/feel.json',
      message: `special "${f.id}" has no feesdae.looks entry`,
    });
// D-048: a lantern's hit circle sits on the pumpkin of the sheet (feesdaeAssets.ts).
for (const f of parsed.bundle.feesdae.specials)
  if (
    f.twist.lanterns.lift !== LANTERN_GROUND_PX ||
    f.twist.lanterns.liftBare !== LANTERN_BARE_GROUND_PX
  )
    errors.push({
      file: 'feesdae.json',
      message: `special "${f.id}": lanterns.lift/liftBare must be ${LANTERN_GROUND_PX}/${LANTERN_BARE_GROUND_PX} (the sheet's pumpkin above its ground line)`,
    });
// D-048: a special's light is a preset too.
for (const f of parsed.bundle.feesdae.specials)
  if (feel.feel.lights[f.light] === undefined)
    errors.push({
      file: 'feesdae.json',
      message: `special "${f.id}" uses unknown light "${f.light}"`,
    });
// v1.2 (D-033): every layout and bonus map light is a preset, and its layers are the biome's.
for (const biome of parsed.bundle.biomes) {
  const layerIds = new Set(biome.layers.map((l) => l.id));
  const lights = [
    ...biome.layouts.map((l) => [`layout "${l.id}"`, l.light] as const),
    ...biome.bonusMaps.flatMap((b) =>
      b.light === undefined ? [] : [[`bonus map "${b.id}"`, b.light] as const],
    ),
  ];
  for (const [where, lightId] of lights) {
    const light = feel.feel.lights[lightId];
    if (light === undefined) {
      errors.push({
        file: `biomes/${biome.id}.json`,
        message: `${where} uses unknown light "${lightId}" (client/feel.json lights)`,
      });
      continue;
    }
    const used = [...Object.keys(light.tint ?? {}), ...(light.haze ?? []).map((h) => h.layer)];
    for (const layer of used)
      if (!layerIds.has(layer))
        errors.push({
          file: 'client/feel.json',
          message: `lights.${lightId} names layer "${layer}", which biome ${biome.id} lacks`,
        });
  }
}
// v1.1 (D-032): every weapon has its ammo display and crosshair, and they fit the weapon.
for (const message of checkGunLook(feel.feel.guns, parsed.bundle.weapons.weapons))
  errors.push({ file: 'client/feel.json', message });
for (const [gun, look] of Object.entries(feel.feel.guns.weapons))
  for (const [event, sfx] of Object.entries(look.sfx))
    if (typeof sfx === 'string' && !(SFX_IDS as readonly string[]).includes(sfx))
      errors.push({
        file: 'client/feel.json',
        message: `guns.weapons.${gun}.sfx.${event}: no sound "${sfx}" (src/game/audio/synth.ts SFX_IDS)`,
      });
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
// v1.3x (D-037): the Skietbaan's own string tables (src/i18n/range/<lang>.json, lazy chunk), and
// D-045: the Project overview's (src/i18n/project/) — the same rules: every language has every
// key of <dir>/en.json, no language is missing, and the keys are named <dir>.*.
for (const lazyDir of ['range', 'project', 'graphics', 'guide']) {
  const dir = join(i18nDir, lazyDir);
  const read = (f: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;
  const files = readdirSync(dir).filter((x) => /^[a-z]{2}\.json$/.test(x));
  for (const message of checkLanguageSet(
    LANGUAGES,
    files.map((x) => x.slice(0, 2)),
  ))
    errors.push({ file: `i18n/${lazyDir}/`, message });
  const base = read('en.json');
  for (const f of files) {
    const file = `i18n/${lazyDir}/${f}`;
    fileNames.push(file);
    if (f === 'en.json') {
      for (const key of Object.keys(base))
        if (!key.startsWith(`${lazyDir}.`))
          errors.push({ file, message: `"${key}": ${lazyDir} strings are named ${lazyDir}.*` });
      continue;
    }
    for (const issue of checkLanguage(f.slice(0, 2), base, read(f)))
      errors.push({ file, message: `"${issue.key}": ${issue.message}` });
  }
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
