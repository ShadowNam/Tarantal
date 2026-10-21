import { describe, expect, it } from 'vitest';
import {
  civilFromDays,
  dayKey,
  dayNumber,
  daysFromCivil,
  isoWeekday,
  isoWeekKey,
  MS_PER_DAY,
  parseDayKey,
} from './dailyCalendar';

/** Reference ISO week from Date (UTC getters only), the textbook algorithm. */
function refIsoWeek(day: number): string {
  const d = new Date(day * MS_PER_DAY);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / MS_PER_DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

describe('dailyCalendar', () => {
  it('matches Date (UTC) for every day 1970–2100', () => {
    const end = daysFromCivil(2100, 12, 31);
    for (let day = 0; day <= end; day++) {
      const iso = new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
      expect(dayKey(day)).toBe(iso);
      expect(parseDayKey(iso)).toBe(day);
      if (day % 7 === 0 || day > end - 400) expect(isoWeekKey(day)).toBe(refIsoWeek(day));
    }
  });

  it('round-trips civil dates, including before 1970', () => {
    for (const day of [-1, -719468, 0, 11016, 20747, 47482]) {
      const c = civilFromDays(day);
      expect(daysFromCivil(c.year, c.month, c.day)).toBe(day);
    }
  });

  it('a UTC day starts exactly at midnight UTC', () => {
    const midnight = Date.UTC(2026, 9, 22);
    expect(dayKey(dayNumber(midnight - 1))).toBe('2026-10-21');
    expect(dayKey(dayNumber(midnight))).toBe('2026-10-22');
  });

  it('rejects keys that are not calendar dates', () => {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-1-1', 'x', '2026-10-21T00'])
      expect(parseDayKey(bad)).toBeNull();
    expect(parseDayKey('2028-02-29')).not.toBeNull();
  });

  it('ISO weeks: Monday starts a week; year-end weeks belong to the Thursday’s year', () => {
    const d = (k: string): number => parseDayKey(k) ?? NaN;
    expect(isoWeekday(d('2026-10-19'))).toBe(1); // Monday
    expect(isoWeekday(d('2026-10-25'))).toBe(7); // Sunday
    expect(isoWeekKey(d('2026-10-25'))).toBe('2026-W43');
    expect(isoWeekKey(d('2026-10-26'))).toBe('2026-W44');
    expect(isoWeekKey(d('2026-12-31'))).toBe('2026-W53');
    expect(isoWeekKey(d('2027-01-03'))).toBe('2026-W53');
    expect(isoWeekKey(d('2027-01-04'))).toBe('2027-W01');
    expect(isoWeekKey(d('2024-12-30'))).toBe('2025-W01');
  });
});
