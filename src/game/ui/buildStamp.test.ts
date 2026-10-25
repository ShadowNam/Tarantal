import { describe, expect, it } from 'vitest';
import { buildLine, formatBuildTime, shortArea, stampText, weekdayKey } from './buildStamp';

describe('build stamp (v1.6, D-042)', () => {
  const info = { version: '1.6.0', sha: '1219b9d', time: '2026-10-25T08:40' };

  it('formats the build time in UTC as built', () => {
    expect(formatBuildTime('2026-10-25T08:40')).toBe('25 Oct 08:40');
    expect(formatBuildTime('2026-01-05T23:05')).toBe('5 Jan 23:05');
    expect(formatBuildTime('')).toBe('');
  });

  it('builds the stamp line', () => {
    expect(buildLine(info)).toBe('v1.6.0 · 1219b9d · 25 Oct 08:40');
    expect(stampText(info, { area: 'Karoo', day: 'Tue', art: 'art ok' })).toBe(
      'v1.6.0 · 1219b9d · 25 Oct 08:40 · Karoo · Tue · art ok',
    );
    expect(stampText({ ...info, time: '' }, { art: '2 placeholder' })).toBe(
      'v1.6.0 · 1219b9d · 2 placeholder',
    );
  });

  it('names the weekday of a UTC day and shortens an area name', () => {
    // 25 Oct 2026 is a Sunday: day 20751.
    expect(weekdayKey(Date.UTC(2026, 9, 25) / 86_400_000)).toBe('sun');
    expect(weekdayKey(0)).toBe('thu');
    expect(shortArea('Karoo Farm — Autumn')).toBe('Karoo Farm');
    expect(shortArea('Namibië')).toBe('Namibië');
  });
});
