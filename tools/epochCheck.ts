// Daily epoch checks (v1.0.1, D-028 §2). `content/meta/daily.json → epoch` (the UTC day of Daily #1)
// is the only copy of that date: `findEpochCopies` (run by content:validate) finds the same date
// hard-coded in game, tool or e2e code. `epochReleaseIssues` (run by `npm run release`) lists why
// the epoch is not ready for a launch build: still the placeholder, older than epochMaxAgeDays, or
// a confirmed date far from the build day (a typo). `testHooksSources` keeps the CI-only
// VITE_TEST_HOOKS flag out of release builds.
import { dayKey, parseDayKey } from '../src/meta/dailyCalendar';

export interface SourceFile {
  /** Repo-relative path with forward slashes. */
  readonly path: string;
  readonly text: string;
}

export interface EpochCopy {
  readonly path: string;
  readonly line: number;
}

/**
 * Lines allowed to contain the epoch's date for another reason: the golden Daily replays are
 * pinned to the day they were recorded (their case names, and the day daily.spec.ts replays them
 * on), which only happens to equal the placeholder epoch. Anything else on those files is checked.
 */
export const EPOCH_COPY_ALLOWED: readonly { readonly path: string; readonly line: RegExp }[] = [
  { path: 'tools/goldenCases.ts', line: /^\s*name: 'daily-\d{4}-\d{2}-\d{2}-[a-z-]+',$/ },
  { path: 'tests/e2e/daily.spec.ts', line: /^const GOLDEN_DAY = '\d{4}-\d{2}-\d{2}';$/ },
];

/**
 * Lines that contain the epoch's date in game, tool and test code (`src/`, `tools/`, `tests/`).
 * Unit tests (`*.test.ts`) are skipped: they pin fixed days for seed and calendar maths.
 */
export function findEpochCopies(files: readonly SourceFile[], epoch: string): EpochCopy[] {
  const out: EpochCopy[] = [];
  for (const f of files) {
    if (/\.test\.ts$/.test(f.path)) continue;
    const allowed = EPOCH_COPY_ALLOWED.filter((a) => a.path === f.path);
    f.text.split('\n').forEach((l, i) => {
      if (l.includes(epoch) && !allowed.some((a) => a.line.test(l)))
        out.push({ path: f.path, line: i + 1 });
    });
  }
  return out;
}

export interface EpochMeta {
  readonly epoch: string;
  readonly epochPlaceholder: boolean;
  readonly epochMaxAgeDays: number;
}

export interface EpochCheckOptions {
  /**
   * `npm run release -- --allow-epoch-gap`: a confirmed epoch may lie any distance from the build
   * (releases after the launch, or a portal build submitted weeks before it).
   */
  readonly allowGap: boolean;
}

/**
 * Why the epoch isn't launch-ready (empty = ready). `buildDay`: UTC day number of the build.
 * A placeholder epoch is always an issue (and a second one when it lies more than
 * epochMaxAgeDays before the build). A confirmed epoch (epochPlaceholder: false) is an issue when
 * it lies more than epochMaxAgeDays before or after the build day — a typo such as 2062 or 2025 —
 * unless `allowGap` (a release after the launch, when the epoch ages by design, or one built well
 * before it).
 */
export function epochReleaseIssues(
  meta: EpochMeta,
  buildDay: number,
  opts: EpochCheckOptions = { allowGap: false },
): string[] {
  const first = parseDayKey(meta.epoch);
  const gap = first === null ? 0 : buildDay - first;
  if (!meta.epochPlaceholder) {
    if (opts.allowGap || Math.abs(gap) <= meta.epochMaxAgeDays) return [];
    return [
      `confirmed epoch ${meta.epoch} lies ${Math.abs(gap)} days ${gap > 0 ? 'before' : 'after'} ` +
        `the build date ${dayKey(buildDay)} (more than ${meta.epochMaxAgeDays}): check it for a ` +
        'typo, or pass --allow-epoch-gap (a release after the launch, or well before it).',
    ];
  }
  const issues = [
    `meta/daily.json epoch ${meta.epoch} is still the placeholder (epochPlaceholder: true): ` +
      'set the launch date (Daily #1) and epochPlaceholder: false.',
  ];
  if (gap > meta.epochMaxAgeDays) {
    issues.push(
      `epoch ${meta.epoch} lies ${gap} days before the build date ${dayKey(buildDay)} ` +
        `(more than ${meta.epochMaxAgeDays}): a launch today would open on Daily #${gap + 1}.`,
    );
  }
  return issues;
}

/**
 * Where VITE_TEST_HOOKS=1 would reach a release build (D-028 §1: release builds never carry it):
 * the environment, or a `.env*` file Vite reads in production mode. Pure: takes the env and the
 * files' texts by name.
 */
export function testHooksSources(
  env: Readonly<Record<string, string | undefined>>,
  envFiles: Readonly<Record<string, string>>,
): string[] {
  const out: string[] = [];
  if ((env['VITE_TEST_HOOKS'] ?? '') !== '') out.push('the environment (VITE_TEST_HOOKS)');
  for (const [name, text] of Object.entries(envFiles)) {
    if (/^\s*VITE_TEST_HOOKS\s*=\s*\S/m.test(text)) out.push(name);
  }
  return out;
}

/** The `.env` files Vite loads for a production build (vite.dev/guide/env-and-mode). */
export const PRODUCTION_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
];
