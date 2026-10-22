// Daily epoch checks (v1.0.1, D-028 §2). `content/meta/daily.json → epoch` (the UTC day of Daily #1)
// is the only copy of that date: `findEpochCopies` (run by content:validate) finds the same date
// hard-coded in game or tool code. `epochReleaseIssues` (run by `npm run release`) lists why the
// epoch is not ready for a launch build: still the placeholder, or older than epochMaxAgeDays.
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
 * Files allowed to contain the epoch's date for another reason. goldenCases.ts pins the golden
 * Daily replays to the day they were recorded (their names and seeds), which only happens to equal
 * the placeholder epoch; renaming them would change the golden file.
 */
export const EPOCH_COPY_ALLOWED: readonly string[] = ['tools/goldenCases.ts'];

/** Lines of non-test game and tool code that contain the epoch's date. */
export function findEpochCopies(files: readonly SourceFile[], epoch: string): EpochCopy[] {
  const out: EpochCopy[] = [];
  for (const f of files) {
    if (/\.test\.ts$/.test(f.path) || EPOCH_COPY_ALLOWED.includes(f.path)) continue;
    f.text.split('\n').forEach((l, i) => {
      if (l.includes(epoch)) out.push({ path: f.path, line: i + 1 });
    });
  }
  return out;
}

export interface EpochMeta {
  readonly epoch: string;
  readonly epochPlaceholder: boolean;
  readonly epochMaxAgeDays: number;
}

/**
 * Why the epoch isn't launch-ready (empty = ready). `buildDay`: UTC day number of the build.
 * Only a placeholder epoch is checked: once a person confirms the launch date
 * (epochPlaceholder: false), every later release keeps passing although the epoch ages (D-028).
 */
export function epochReleaseIssues(meta: EpochMeta, buildDay: number): string[] {
  if (!meta.epochPlaceholder) return [];
  const issues = [
    `meta/daily.json epoch ${meta.epoch} is still the placeholder (epochPlaceholder: true): ` +
      'set the launch date (Daily #1) and epochPlaceholder: false.',
  ];
  const first = parseDayKey(meta.epoch);
  if (first !== null && buildDay - first > meta.epochMaxAgeDays) {
    issues.push(
      `epoch ${meta.epoch} lies ${buildDay - first} days before the build date ${dayKey(buildDay)} ` +
        `(more than ${meta.epochMaxAgeDays}): a launch today would open on Daily #${buildDay - first + 1}.`,
    );
  }
  return issues;
}
