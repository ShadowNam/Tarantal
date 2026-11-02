// Personal goals and keepsakes. Pure meta code: it never changes the hunt's score or RNG.
import { JOURNAL } from '../content/journal';
import { encodeChallenge, type Challenge } from './challenge';
import type { HuntLog } from './huntLog';
import type { JournalRecord, JournalSave, SaveData } from './saveSchema';
import type { SimEvent } from '../sim/events';

export type Moment = NonNullable<JournalRecord['highlight']>;
export const sightingKey = (id: string): string => `veld_${id}`;
export const isJournalSpecies = (id: string): boolean => JOURNAL.species.some((s) => s.id === id);

/** Highest-priority moment in one batch. A whole flock keeps the existing dedicated stamp. */
export function shotMoment(
  events: readonly SimEvent[],
): 'whole' | 'double' | 'horizon' | 'long' | null {
  if (events.some((e) => e.type === 'flockWiped')) return 'whole';
  if (events.some((e) => e.type === 'bonusAwarded' && e.bonus === 'twoFlies')) return 'double';
  if (events.some((e) => e.type === 'targetBagged' && e.plane === 'ver')) return 'horizon';
  if (events.some((e) => e.type === 'targetBagged' && e.plane === 'far')) return 'long';
  return null;
}

/** Keep urgent notices visible across frames; a later shot cannot immediately replace them. */
export class ShotFeedbackGate {
  private blockedUntil = -Infinity;
  private last = -Infinity;

  take(
    events: readonly SimEvent[],
    tick: number,
    holdTicks: number,
    busy = false,
  ): 'double' | 'horizon' | 'long' | null {
    const moment = shotMoment(events);
    const urgent =
      busy ||
      events.some(
        (e) =>
          e.type === 'stampedeStarted' ||
          e.type === 'alatesSwarm' ||
          e.type === 'powerupStarted' ||
          e.type === 'gadgetUsed' ||
          e.type === 'brakkieHit' ||
          e.type === 'penaltyApplied',
      );
    if (urgent || moment === 'whole') {
      this.blockedUntil = Math.max(this.blockedUntil, tick + holdTicks);
      return null;
    }
    if (
      moment === null ||
      tick < this.blockedUntil ||
      tick - this.last < JOURNAL.feedbackCooldownTicks
    )
      return null;
    this.last = tick;
    return moment;
  }
}

export function journalKey(log: HuntLog): string {
  return JSON.stringify([
    log.biome,
    log.layout ?? null,
    log.bonus ?? null,
    log.weapon ?? '',
    log.sight ?? null,
    log.rules ?? '',
    log.mode,
  ]);
}

export function coachTip(
  log: Pick<
    HuntLog,
    'emptyClicks' | 'shots' | 'accuracy' | 'wholeFlocks' | 'baggedFar' | 'baggedVer'
  >,
): JournalRecord['tip'] {
  if ((log.emptyClicks ?? 0) > 0) return 'reload';
  if (log.shots >= JOURNAL.minAccuracyShots && (log.accuracy ?? 0) < JOURNAL.lowAccuracy)
    return 'steady';
  if (log.wholeFlocks === 0) return 'flock';
  if (log.baggedFar + log.baggedVer === 0) return 'distance';
  return 'weapon';
}

export function huntMoment(
  log: Pick<
    HuntLog,
    'wholeFlocks' | 'twoFlies' | 'baggedVer' | 'baggedFar' | 'bagged' | 'penalties'
  >,
): Moment | null {
  if (log.wholeFlocks > 0) return 'whole';
  if ((log.twoFlies ?? 0) > 0) return 'double';
  if (log.baggedVer > 0) return 'horizon';
  if (log.baggedFar > 0) return 'long';
  if (log.bagged >= JOURNAL.minCleanBag && log.penalties === 0) return 'clean';
  return log.bagged > 0 ? 'bag' : null;
}

export function recordHunt(
  journal: JournalSave,
  log: HuntLog,
  ranked: boolean,
): {
  readonly journal: JournalSave;
  readonly improved: readonly string[];
} {
  // Missing setup on a legacy test/log is not enough information for a fair comparison.
  if (!ranked || !['classic', 'daily'].includes(log.mode) || !log.weapon || !log.rules)
    return { journal, improved: [] };
  const key = journalKey(log);
  const prev = journal.records[key];
  const qualified = log.shots >= JOURNAL.minAccuracyShots;
  const accuracy = qualified ? (log.accuracy ?? 0) : 0;
  const cleanBag = log.penalties === 0 ? log.bagged : 0;
  const improved =
    prev === undefined
      ? []
      : [
          ...(log.score > prev.score ? ['score'] : []),
          ...(qualified && accuracy > prev.accuracy ? ['accuracy'] : []),
          ...(log.wholeFlocks > prev.wholeFlocks ? ['flocks'] : []),
          ...(cleanBag > prev.cleanBag ? ['clean'] : []),
        ];
  const record: JournalRecord = {
    mode: log.mode === 'daily' ? 'daily' : 'classic',
    biome: log.biome,
    layout: log.layout ?? null,
    bonus: log.bonus ?? null,
    weapon: log.weapon,
    sight: log.sight ?? null,
    rules: log.rules,
    hunts: (prev?.hunts ?? 0) + 1,
    score: Math.max(prev?.score ?? log.score, log.score),
    accuracy: Math.max(prev?.accuracy ?? 0, accuracy),
    wholeFlocks: Math.max(prev?.wholeFlocks ?? 0, log.wholeFlocks),
    cleanBag: Math.max(prev?.cleanBag ?? 0, cleanBag),
    bagged: Math.max(prev?.bagged ?? 0, log.bagged),
    tip: coachTip(log),
    highlight: huntMoment(log),
  };
  const previous = Object.entries(journal.records).filter(([id]) => id !== key);
  const room = JOURNAL.maxRecords - 1;
  const records = Object.fromEntries([...(room === 0 ? [] : previous.slice(-room)), [key, record]]);
  return { journal: { ...journal, records, latest: key }, improved };
}

/** Only equal-rule challenges count as a fair rivalry. The history stores shared claims. */
export function recordRival(
  journal: JournalSave,
  c: Challenge | null,
  score: number,
  rules: string,
): JournalSave {
  if (c === null || c.h !== rules.slice(0, 8)) return journal;
  const link = encodeChallenge(c);
  const previous = journal.rivals.find((r) => r.link === link);
  const entry = {
    link,
    best: Math.max(previous?.best ?? score, score),
    target: c.score,
    by: c.by ?? null,
    biome: c.biome,
    weapon: c.weapon,
    mode: c.mode,
  };
  return {
    ...journal,
    rivals: [...journal.rivals.filter((r) => r.link !== link), entry].slice(-JOURNAL.maxRivals),
  };
}

export interface PersonalGoal {
  readonly id: string;
  readonly best: number;
  readonly target: number;
  readonly complete: boolean;
}
export function personalGoals(r: JournalRecord): PersonalGoal[] {
  const score =
    Math.ceil(
      (r.score + Math.max(JOURNAL.scoreStep, Math.abs(r.score) * JOURNAL.scoreGrowth)) /
        JOURNAL.scoreStep,
    ) * JOURNAL.scoreStep;
  return [
    { id: 'score', best: r.score, target: score, complete: false },
    {
      id: 'accuracy',
      best: r.accuracy,
      target: Math.min(1, r.accuracy + JOURNAL.accuracyStep),
      complete: r.accuracy >= 1,
    },
    {
      id: 'flocks',
      best: r.wholeFlocks,
      target: Math.min(JOURNAL.maxFlockGoal, r.wholeFlocks + 1),
      complete: r.wholeFlocks >= JOURNAL.maxFlockGoal,
    },
    {
      id: 'clean',
      best: r.cleanBag,
      target: Math.min(JOURNAL.maxCleanBagGoal, Math.max(JOURNAL.minCleanBag, r.cleanBag + 1)),
      complete: r.cleanBag >= JOURNAL.maxCleanBagGoal,
    },
  ];
}

export function plaqueProgress(
  save: Pick<SaveData, 'journal' | 'birdBook'>,
): { id: string; value: number; target: number; earned: boolean }[] {
  const records = Object.values(save.journal.records);
  const max = (get: (r: JournalRecord) => number): number => Math.max(0, ...records.map(get));
  const values = {
    sightings: JOURNAL.species.filter((s) => save.birdBook.creatures.includes(sightingKey(s.id)))
      .length,
    bagged: max((r) => r.bagged),
    accuracy: max((r) => r.accuracy),
    wholeFlocks: max((r) => r.wholeFlocks),
    cleanBag: max((r) => r.cleanBag),
    rivalWins: save.journal.rivals.filter((r) => r.best > r.target).length,
  };
  return JOURNAL.plaques.map((p) => ({
    id: p.id,
    value: values[p.metric],
    target: p.target,
    earned: save.journal.earned.includes(p.id) || values[p.metric] >= p.target,
  }));
}

export function equipPlaque(save: SaveData, id: string | null): SaveData {
  if (id !== null && !plaqueProgress(save).some((p) => p.id === id && p.earned)) return save;
  return { ...save, journal: { ...save.journal, plaque: id } };
}

/** Earned keepsakes survive record/history eviction and later balance updates. */
export function awardPlaques(save: SaveData): SaveData {
  const earned = [
    ...new Set([
      ...save.journal.earned,
      ...plaqueProgress(save)
        .filter((p) => p.earned)
        .map((p) => p.id),
    ]),
  ].sort();
  return { ...save, journal: { ...save.journal, earned } };
}
