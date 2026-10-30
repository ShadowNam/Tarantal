// Feesdae, the special days (GDD §15 Feesdae, Tech §12 Feesdae, D-048): which special (if any) a UTC day is,
// and the test/admin override. Pure: the game passes in the UTC day number (Date.now() in the
// game layer, or the e2e ?today= day); nothing here reads a clock. The special's id then goes
// into the Daily's mode config, so its replays and challenge links carry it.
import type { Feesdag, Feesdae } from '../content/schemas';
import { civilFromDays } from './dailyCalendar';

/** True when the special's date rule matches this UTC day. */
export function onDay(special: Feesdag, day: number): boolean {
  const { month, day: d } = civilFromDays(day);
  return specialDays(special).some((r) => r.month === month && r.day === d);
}

/** Every month/day a special's date rule covers (a fixed day, or D-065's list of days). */
export function specialDays(special: Feesdag): readonly { month: number; day: number }[] {
  const rule = special.date;
  return rule.type === 'fixed' ? [{ month: rule.month, day: rule.day }] : rule.days;
}

/** The special of a UTC day (the first that matches), or null on an ordinary day. */
export function feesdagForDay(feesdae: Feesdae, day: number): Feesdag | null {
  return feesdae.specials.find((s) => onDay(s, day)) ?? null;
}

/** A special by id (replays, challenge links, the override), or null if there is none. */
export function feesdagById(feesdae: Feesdae, id: string | null | undefined): Feesdag | null {
  if (id === null || id === undefined || id === '') return null;
  return feesdae.specials.find((s) => s.id === id) ?? null;
}

/**
 * The special today's Daily plays: the override (`?feesdag=<id>` on dev/e2e builds and the web
 * admin page only, never a portal) wins over the date; `?feesdag=none` forces an ordinary day.
 */
export function todaysFeesdag(
  feesdae: Feesdae,
  day: number,
  override: string | null,
): Feesdag | null {
  if (override === 'none') return null;
  return feesdagById(feesdae, override) ?? feesdagForDay(feesdae, day);
}

/** The year of a UTC day (the share card's "Spookjag 2026"). */
export function yearOfDay(day: number): number {
  return civilFromDays(day).year;
}

/** The share card's year of a special played on a UTC day: D-065's New Year shows the year that
 *  starts (shareYearDays 1: 31 Dec 2026 → 2027). */
export function shareYear(special: Feesdag | null, day: number): number {
  return yearOfDay(day + (special?.shareYearDays ?? 0));
}
