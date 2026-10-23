// Which map a hunt plays (v1.2, GDD §11.5, D-033). Pure: the game passes in the UTC day number.
// The weekday is counted in UTC like the Daily Hunt, so everyone plays the same Monday map.
import { WEEKDAY_IDS, type WeekdayId } from '../content/schemas';
import { isoWeekday } from './dailyCalendar';

/** The layout of a UTC day: Monday's layout on every Monday. */
export function layoutForDay(day: number): WeekdayId {
  // Safe: isoWeekday is 1..7, so the index is 0..6.
  return WEEKDAY_IDS[isoWeekday(day) - 1] as WeekdayId;
}
