import { describe, expect, it } from 'vitest';
import { parseDayKey } from '../src/meta/dailyCalendar';
import {
  epochReleaseIssues,
  findEpochCopies,
  testHooksSources,
  type SourceFile,
} from './epochCheck';

const day = (k: string): number => parseDayKey(k) ?? NaN;
const meta = { epoch: '2027-03-01', epochPlaceholder: true, epochMaxAgeDays: 7 };

describe('epochReleaseIssues (D-028 §2)', () => {
  it('a placeholder epoch is an issue; one older than epochMaxAgeDays is a second one', () => {
    expect(epochReleaseIssues(meta, day('2027-03-08'))).toHaveLength(1);
    const old = epochReleaseIssues(meta, day('2027-03-09'));
    expect(old).toHaveLength(2);
    expect(old[1]).toMatch(/8 days before the build date 2027-03-09.*Daily #9/);
  });

  it('a confirmed epoch near the build day passes', () => {
    const real = { ...meta, epochPlaceholder: false };
    expect(epochReleaseIssues(real, day('2027-02-22'))).toEqual([]);
    expect(epochReleaseIssues(real, day('2027-03-08'))).toEqual([]);
  });

  it('a confirmed epoch far from the build (a typo) is an issue unless --allow-epoch-gap', () => {
    const typo = { ...meta, epoch: '2062-03-01', epochPlaceholder: false };
    expect(epochReleaseIssues(typo, day('2027-03-01'))[0]).toMatch(/days after the build date/);
    const old = { ...meta, epoch: '2025-03-01', epochPlaceholder: false };
    expect(epochReleaseIssues(old, day('2027-03-01'))[0]).toMatch(/730 days before/);
    expect(epochReleaseIssues(old, day('2027-03-01'), { allowGap: true })).toEqual([]);
  });
});

describe('findEpochCopies (D-028 §2)', () => {
  it('finds the date in code and e2e specs, skipping unit tests and the allowed lines only', () => {
    const files: SourceFile[] = [
      { path: 'src/a.ts', text: "x\nconst e = '2027-03-01';" },
      { path: 'src/a.test.ts', text: "'2027-03-01'" },
      { path: 'tests/e2e/visual.spec.ts', text: "boot(page, 'today=2027-03-01');" },
      {
        path: 'tools/goldenCases.ts',
        text: "    name: 'daily-2027-03-01-aim-touch',\n  // the daily of 2027-03-01",
      },
      {
        path: 'tests/e2e/daily.spec.ts',
        text: "const GOLDEN_DAY = '2027-03-01';\nx('2027-03-01')",
      },
    ];
    expect(findEpochCopies(files, '2027-03-01')).toEqual([
      { path: 'src/a.ts', line: 2 },
      { path: 'tests/e2e/visual.spec.ts', line: 1 },
      { path: 'tools/goldenCases.ts', line: 2 },
      { path: 'tests/e2e/daily.spec.ts', line: 2 },
    ]);
  });
});

describe('testHooksSources (D-028 §1: no CI test flag in a release build)', () => {
  it('finds the flag in the environment or a production .env file', () => {
    expect(testHooksSources({}, {})).toEqual([]);
    expect(testHooksSources({ VITE_TEST_HOOKS: '' }, { '.env': '# VITE_TEST_HOOKS=1' })).toEqual(
      [],
    );
    expect(
      testHooksSources({ VITE_TEST_HOOKS: '1' }, { '.env.local': 'A=1\nVITE_TEST_HOOKS=1\n' }),
    ).toEqual(['the environment (VITE_TEST_HOOKS)', '.env.local']);
  });
});
