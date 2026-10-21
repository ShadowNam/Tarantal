// Daily Hunt (GDD §12, §15; Tech §12): the day's seed, biome and number, the first-attempt rule,
// and the streak with one free freeze per ISO week. Pure: the game passes in the UTC day number
// (from Date.now() in the game layer) and the content; nothing here reads a clock.
import type { DailyMeta } from '../content/schemas';
import { sha256HexOfString } from '../content/hash';
import type { ModeConfig } from '../sim/types';
import { dayKey, isoWeekKey, parseDayKey } from './dailyCalendar';
import { defaultSave, type DailySave } from './saveSchema';

/** u32 of the first 4 bytes (big-endian) of SHA-256("tm-daily|" + YYYY-MM-DD + "|" + contentHash). */
export function dailySeed(key: string, contentHash: string): number {
  return parseInt(sha256HexOfString(`tm-daily|${key}|${contentHash}`).slice(0, 8), 16) >>> 0;
}

/** Daily number #n: the epoch day is #1. */
export function dailyNumber(day: number, epoch: string): number {
  const first = parseDayKey(epoch);
  // Safe: the schema only accepts calendar dates, so a validated epoch always parses.
  return day - (first ?? day) + 1;
}

/**
 * The day's biome: rotation[day mod rotation length] — the same for every client on the same day,
 * whatever it can draw (D-025: indexing the playable subset gave a client with a different set,
 * e.g. an old cached PWA, another biome for the same Daily #). If that biome isn't playable here,
 * `fallback` (modes.json daily).
 */
export function dailyBiome(
  day: number,
  rotation: readonly string[],
  playable: readonly string[],
  fallback: string,
): string {
  const n = rotation.length;
  if (n === 0) return fallback;
  const b = rotation[((day % n) + n) % n];
  return b !== undefined && playable.includes(b) ? b : fallback;
}

export interface DailySetup {
  readonly day: number;
  readonly key: string;
  readonly number: number;
  readonly seed: number;
  readonly biome: string;
}

export function dailySetup(
  day: number,
  opts: {
    readonly meta: DailyMeta;
    readonly contentHash: string;
    readonly playable: readonly string[];
    readonly fallbackBiome: string;
  },
): DailySetup {
  const key = dayKey(day);
  return {
    day,
    key,
    number: dailyNumber(day, opts.meta.epoch),
    seed: dailySeed(key, opts.contentHash),
    biome: dailyBiome(day, opts.meta.biomeRotation, opts.playable, opts.fallbackBiome),
  };
}

/** The sim mode of a daily hunt: Classic rules with the omen on (modes.json daily, D-021). */
export function dailyMode(setup: DailySetup, weapon: string | undefined): ModeConfig {
  return { id: 'daily', biome: setup.biome, ...(weapon === undefined ? {} : { weapon }) };
}

// --- first attempt and streak ---------------------------------------------------------------

export function defaultDaily(): DailySave {
  return defaultSave().daily;
}

/** True once today's official attempt has started (later attempts are practice). */
export function playedToday(s: DailySave, day: number): boolean {
  return s.lastDay !== null && s.lastDay >= day;
}

/**
 * ISO weeks whose freezes would cover the days missed between `lastDay` and `day` (exclusive),
 * or null if the streak can't be saved. Every missed day needs the unused freeze of its own ISO
 * week, and each week has one (GDD §15: one free freeze per week).
 */
export function freezesNeeded(s: DailySave, day: number): string[] | null {
  if (s.lastDay === null) return null;
  const missed = day - s.lastDay - 1;
  if (missed <= 0) return [];
  // Three missed days in a row always put two in one week; don't walk long gaps.
  if (missed > 2) return null;
  const weeks: string[] = [];
  for (let d = s.lastDay + 1; d < day; d++) {
    const w = isoWeekKey(d);
    if (weeks.includes(w) || s.freezesUsed.includes(w)) return null;
    weeks.push(w);
  }
  return weeks;
}

/** The streak shown today: 0 once it can no longer be saved by playing today. */
export function liveStreak(s: DailySave, day: number): number {
  if (s.lastDay === null) return 0;
  if (s.lastDay >= day) return s.streak;
  return freezesNeeded(s, day) === null ? 0 : s.streak;
}

/** This ISO week's freeze is still unused. */
export function freezeReady(s: DailySave, day: number): boolean {
  return !s.freezesUsed.includes(isoWeekKey(day));
}

export interface AttemptStart {
  readonly save: DailySave;
  /** The day's first attempt: it counts for the streak, the share card and the best. */
  readonly official: boolean;
  /** ISO weeks whose freeze this start used. */
  readonly frozen: readonly string[];
  /** Cosmetics awarded by reaching a streak milestone. */
  readonly cosmetics: readonly string[];
}

/**
 * Claims the day's official attempt when a daily hunt starts (quitting or closing the tab still
 * uses it up, so a bad start can't be retried). Later attempts that day are practice.
 */
export function startAttempt(s: DailySave, day: number, meta: DailyMeta): AttemptStart {
  if (playedToday(s, day)) return { save: s, official: false, frozen: [], cosmetics: [] };
  const frozen = freezesNeeded(s, day);
  const streak = frozen === null ? 1 : s.streak + 1;
  const won = meta.streakMilestones
    .filter((m) => m.days <= streak && !s.cosmetics.includes(m.cosmetic))
    .map((m) => m.cosmetic);
  const freezesUsed = [...s.freezesUsed, ...(frozen ?? [])].sort().slice(-meta.freezeWeeksKept);
  const history = [
    ...s.history.filter((e) => e.day > day - meta.historyDays && e.day !== day),
    { day, score: null, rank: null, wholeFlocks: 0, grid: '' },
  ];
  return {
    save: {
      ...s,
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      lastDay: day,
      freezesUsed,
      cosmetics: [...s.cosmetics, ...won],
      history,
    },
    official: true,
    frozen: frozen ?? [],
    cosmetics: won,
  };
}

export interface OfficialResult {
  readonly score: number;
  readonly rank: string;
  readonly wholeFlocks: number;
  /** Share-card emoji grid. */
  readonly grid: string;
}

/** Records the official attempt's result (once). newBest: beat the previous best daily score. */
export function finishAttempt(
  s: DailySave,
  day: number,
  r: OfficialResult,
): { save: DailySave; newBest: boolean } {
  const i = s.history.findIndex((e) => e.day === day && e.score === null);
  if (i < 0) return { save: s, newBest: false };
  const history = s.history.map((e, j) =>
    j === i ? { ...e, score: r.score, rank: r.rank, wholeFlocks: r.wholeFlocks, grid: r.grid } : e,
  );
  const newBest = s.bestScore === null || r.score > s.bestScore;
  return {
    save: { ...s, history, bestScore: newBest ? r.score : s.bestScore },
    newBest: newBest && s.bestScore !== null,
  };
}

/** The official result of `day`, if that attempt finished. */
export function officialEntry(s: DailySave, day: number): DailySave['history'][number] | null {
  return s.history.find((e) => e.day === day && e.score !== null) ?? null;
}
