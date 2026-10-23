import { describe, expect, it } from 'vitest';
import { dayNumber, parseDayKey } from './dailyCalendar';
import { layoutForDay } from './maps';

const day = (key: string): number => {
  const d = parseDayKey(key);
  if (d === null) throw new Error(key);
  return d;
};

describe('weekday layout (v1.2, UTC)', () => {
  it('follows the UTC weekday', () => {
    expect(layoutForDay(day('2026-10-19'))).toBe('mon');
    expect(layoutForDay(day('2026-10-23'))).toBe('fri');
    expect(layoutForDay(day('2026-10-25'))).toBe('sun');
    expect(layoutForDay(day('2026-10-26'))).toBe('mon');
  });

  it('changes at UTC midnight, whatever the device zone', () => {
    const before = Date.UTC(2026, 9, 25, 23, 59, 59, 999);
    expect(layoutForDay(dayNumber(before))).toBe('sun');
    expect(layoutForDay(dayNumber(before + 1))).toBe('mon');
  });
});
