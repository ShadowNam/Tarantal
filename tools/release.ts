// `npm run release` (M10): builds web, Poki and CrazyGames, checks each against the size budget
// (--strict: ≤ 5 MB initial gzip), writes the asset audit (report mode: placeholders are listed,
// not fatal, until the art lands), and zips each build into release/ (gitignored):
//   release/tarantal-madness-<version>-<platform>.zip   upload this (index.html at the root)
//   release/size-<platform>.txt, release/asset-audit.txt
// It never uploads or submits anything (docs/07-PORTAL-SUBMISSION.md is for the person who does).
// v1.0.1 (D-028 §2): pre-launch check of the Daily epoch (content/meta/daily.json): a warning while
// it is still the placeholder (or older than epochMaxAgeDays); `--strict` makes that a failure.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDailyMeta } from '../src/content/daily';
import { dayNumber } from '../src/meta/dailyCalendar';
import { epochReleaseIssues } from './epochCheck';
import { zip } from './zip';

const root = join(import.meta.dirname, '..');
const out = join(root, 'release');
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;
const BUILDS = [
  { platform: 'web', script: 'build', dir: 'dist' },
  { platform: 'poki', script: 'build:poki', dir: 'dist-poki' },
  { platform: 'crazygames', script: 'build:crazygames', dir: 'dist-crazygames' },
] as const;
/** Build metadata that is not part of the game. */
const SKIP = [/^\.vite\//, /\.map$/];

function run(cmd: string): string {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const strict = process.argv.includes('--strict');
mkdirSync(out, { recursive: true });
let failed = false;

const daily = parseDailyMeta(
  JSON.parse(readFileSync(join(root, 'content/meta/daily.json'), 'utf8')) as unknown,
);
if (!daily.ok) {
  console.log(`epoch: FAILED — meta/daily.json is invalid: ${daily.errors.join('; ')}`);
  failed = true;
} else {
  const issues = epochReleaseIssues(daily.value, dayNumber(Date.now()));
  for (const i of issues) console.log(`epoch: ${strict ? 'FAILED' : 'WARNING'} — ${i}`);
  if (issues.length === 0) console.log(`epoch: OK — Daily #1 is ${daily.value.epoch}.`);
  else if (strict) failed = true;
}
for (const b of BUILDS) {
  process.stdout.write(`${b.platform}: build… `);
  try {
    run(`npm run ${b.script}`);
  } catch (e) {
    // Keep going: the other builds and the summary still matter; this one gets no zip.
    const err = e as { stdout?: string; stderr?: string };
    writeFileSync(
      join(out, `build-${b.platform}.txt`),
      `${err.stdout ?? ''}\n${err.stderr ?? String(e)}`,
    );
    console.log(`FAILED (see release/build-${b.platform}.txt)`);
    failed = true;
    continue;
  }
  let size: string;
  try {
    size = run(`npx tsx tools/size-check.ts --strict --dir ${b.dir}`);
  } catch (e) {
    size = String((e as { stdout?: string }).stdout ?? e);
    failed = true;
  }
  writeFileSync(join(out, `size-${b.platform}.txt`), size);
  const dist = join(root, b.dir);
  const entries = files(dist)
    .map((p) => relative(dist, p).split(sep).join('/'))
    .filter((p) => !SKIP.some((re) => re.test(p)))
    .map((name) => ({ name, data: readFileSync(join(dist, name)) }));
  const name = `tarantal-madness-${version}-${b.platform}.zip`;
  const bytes = zip(entries);
  writeFileSync(join(out, name), bytes);
  const verdict = size.split('\n').find((l) => l.startsWith('size:')) ?? '';
  console.log(
    `${entries.length} files → release/${name} (${(bytes.length / 1024).toFixed(0)} KB). ${verdict}`,
  );
}
let audit: string;
try {
  audit = run('npx tsx tools/asset-audit.ts');
} catch (e) {
  audit = String((e as { stdout?: string }).stdout ?? e);
  failed = true;
}
writeFileSync(join(out, 'asset-audit.txt'), audit);
console.log(
  audit
    .split('\n')
    .filter((l) => /keys:|assets:audit/.test(l))
    .join('\n'),
);
console.log(
  failed
    ? 'release: FAILED (see above and release/*.txt)'
    : `release: ${version} ready in release/ — nothing was uploaded.`,
);
process.exit(failed ? 1 : 0);
