import { describe, expect, it } from 'vitest';
import { parseDayKey } from '../src/meta/dailyCalendar';
import { epochReleaseIssues, findEpochCopies, type SourceFile } from './epochCheck';

const day = (k: string): number => parseDayKey(k) ?? NaN;
const meta = { epoch: '2027-03-01', epochPlaceholder: true, epochMaxAgeDays: 7 };

describe('epochReleaseIssues (D-028 §2)', () => {
  it('a placeholder epoch is an issue; one older than epochMaxAgeDays is a second one', () => {
    expect(epochReleaseIssues(meta, day('2027-03-08'))).toHaveLength(1);
    const old = epochReleaseIssues(meta, day('2027-03-09'));
    expect(old).toHaveLength(2);
    expect(old[1]).toMatch(/8 days before the build date 2027-03-09.*Daily #9/);
  });

  it('a confirmed epoch passes, also long after launch', () => {
    const real = { ...meta, epochPlaceholder: false };
    expect(epochReleaseIssues(real, day('2027-03-01'))).toEqual([]);
    expect(epochReleaseIssues(real, day('2028-12-31'))).toEqual([]);
  });
});

describe('findEpochCopies (D-028 §2)', () => {
  it('finds the date in code, skipping tests and the allowed golden cases', () => {
    const files: SourceFile[] = [
      { path: 'src/a.ts', text: "x\nconst e = '2027-03-01';" },
      { path: 'src/a.test.ts', text: "'2027-03-01'" },
      { path: 'tools/goldenCases.ts', text: "'2027-03-01'" },
    ];
    expect(findEpochCopies(files, '2027-03-01')).toEqual([{ path: 'src/a.ts', line: 2 }]);
  });
});
