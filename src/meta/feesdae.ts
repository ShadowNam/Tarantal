// Feesdae, the special days (GDD §15.4, Tech §12.3, D-048): which special (if any) a UTC day is,
// and the test/admin override. Pure: the game passes in the UTC day number (Date.now() in the
// game layer, or the e2e ?today= day); nothing here reads a clock. The special's id then goes
// into the Daily's mode config, so its replays and challenge links carry it.
import type { Feesdag, Feesdae } from '../content/schemas';
import { civilFromDays } from './dailyCalendar';

/** True when the special's date rule matches this UTC day. */
export function onDay(special: Feesdag, day: number): boolean {
  const { month, day: d } = civilFromDays(day);
  // Only fixed dates so far; a new kind of rule (a range) adds its case here.
  const rule = special.date;
  return rule.month === month && rule.day === d;
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
