// UTC calendar for the Daily Hunt (Tech §12): day numbers, YYYY-MM-DD keys and ISO weeks from
// plain integer arithmetic. No Date and no time zones, so DST and the device's zone can never
// move a day boundary. The only clock read happens in the game layer (Date.now() → dayNumber).

export const MS_PER_DAY = 86_400_000;

/** UTC day number (days since 1970-01-01) of an epoch time in ms. */
export function dayNumber(epochMs: number): number {
  return Math.floor(epochMs / MS_PER_DAY);
}

/** Days since 1970-01-01 of a proleptic Gregorian date (H. Hinnant's days_from_civil). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil (H. Hinnant's civil_from_days). */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/** "YYYY-MM-DD" of a UTC day number (the string hashed into the daily seed). */
export function dayKey(day: number): string {
  const { year, month, day: d } = civilFromDays(day);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(d, 2)}`;
}

/** UTC day number of a "YYYY-MM-DD" key, or null if it is not a calendar date. */
export function parseDayKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (m === null) return null;
  const day = daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3]));
  return dayKey(day) === key ? day : null;
}

/** ISO weekday, Monday = 1 … Sunday = 7 (1970-01-01 was a Thursday). */
export function isoWeekday(day: number): number {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

/** ISO 8601 week key, e.g. "2026-W43" (weeks start on Monday; week 1 holds the first Thursday). */
export function isoWeekKey(day: number): string {
  const thursday = day - isoWeekday(day) + 4;
  const year = civilFromDays(thursday).year;
  const week = Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1;
  return `${pad(year, 4)}-W${pad(week, 2)}`;
}
