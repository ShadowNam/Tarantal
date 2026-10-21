// World-event schedule (Tech §3.6): generated once at hunt start from rng.stream('events'), so
// a seed fixes every event time (this is what makes the Daily Hunt identical for everyone).
// Every biome event is scheduled — even ones whose handler arrives later — so adding a handler
// does not reshuffle the others.
import type { Biome, WorldEventId } from '../../content/schemas';
import type { RandomStream } from '../rng';
import type { ModeId } from '../types';

export interface ScheduledEvent {
  readonly tick: number;
  /** Index of the event in the biome's events list (stable tie-break). */
  readonly index: number;
  readonly id: WorldEventId;
  readonly creature: string | null;
}

/**
 * How the sim handles each world-event id (Tech §3.6). Every id has an entry, so a new id in the
 * schema fails the typecheck until it gets a handler.
 * - flyover: a non-target crosses the sky (hadeda, crop sprayer); creatures that alertsAllFlocks
 *   threaten every flock.
 * - perch: a creature flies in, perches on one of `perchProps`, calls, flies off (kwêvoël).
 * - boss: a boss appears at one of `perchProps` (Generaal).
 * - dustDevil: an omen whirl that flushes flocks on contact.
 * - secretReward: set off by a secret (props[].secret.reward), never scheduled.
 * - crate: scheduled from powerups.json crates, never from the biome.
 * - stampede: scoring.json stampede.
 * - farmDog: Bles die Plaashond (charm) runs through and sends the visible flock nearest the
 *   screen centre to RUN; needs no biome entry.
 */
export type WorldEventHandler =
  'flyover' | 'perch' | 'boss' | 'dustDevil' | 'farmDog' | 'secretReward' | 'crate' | 'stampede';

export const WORLD_EVENT_HANDLERS: Readonly<Record<WorldEventId, WorldEventHandler>> = {
  hadeda: 'flyover',
  cropSprayer: 'flyover',
  kwevoel: 'perch',
  dustDevil: 'dustDevil',
  farmDog: 'farmDog',
  carAlarm: 'secretReward',
  reservoirFlush: 'secretReward',
  bossAppearance: 'boss',
  crate: 'crate',
  stampede: 'stampede',
};

/** Non-target fly-over events (cost points when shot). */
export const FLYOVER_EVENTS: ReadonlySet<WorldEventId> = new Set(
  (Object.keys(WORLD_EVENT_HANDLERS) as WorldEventId[]).filter(
    (id) => WORLD_EVENT_HANDLERS[id] === 'flyover',
  ),
);

/** Whether a biome event takes place in this hunt (mode filter, omen, Season Run boss hunt). */
function eventApplies(
  event: Biome['events'][number],
  mode: ModeId,
  omen: boolean,
  bossHunt: boolean,
): boolean {
  // A Season Run boss hunt always brings the biome's boss (GDD §13.1).
  const forcedBoss = bossHunt && WORLD_EVENT_HANDLERS[event.id] === 'boss';
  if (event.modes !== undefined && !event.modes.includes(mode) && !forcedBoss) return false;
  if (event.omenOnly === true && !omen) return false;
  return true;
}

export function scheduleWorldEvents(
  biome: Biome,
  mode: ModeId,
  omen: boolean,
  durationTicks: number,
  rng: RandomStream,
  bossHunt = false,
): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  biome.events.forEach((event, index) => {
    if (!eventApplies(event, mode, omen, bossHunt)) return;
    const count = rng.int(event.perHunt[0], event.perHunt[1]);
    for (let i = 0; i < count; i++) {
      const t = rng.range(event.window[0], event.window[1]);
      out.push({
        tick: Math.floor(t * durationTicks),
        index,
        id: event.id,
        creature: event.creature ?? null,
      });
    }
  });
  return out.sort((a, b) => a.tick - b.tick || a.index - b.index);
}

/**
 * Extra events for charms that make a creature's events more frequent (spawnRateMul, e.g.
 * Kwêvoël se Seën ×3): (mul − 1) × the event's mean count, timed from the `charms` stream so the
 * base schedule (the `events` stream) is the same with or without the charm.
 */
export function scheduleExtraEvents(
  biome: Biome,
  mode: ModeId,
  omen: boolean,
  durationTicks: number,
  mulByCreature: ReadonlyMap<string, number>,
  rng: RandomStream,
): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  biome.events.forEach((event, index) => {
    const mul = event.creature === undefined ? undefined : mulByCreature.get(event.creature);
    if (mul === undefined || mul <= 1 || !eventApplies(event, mode, omen, false)) return;
    const extra = Math.round(((event.perHunt[0] + event.perHunt[1]) / 2) * (mul - 1));
    for (let i = 0; i < extra; i++) {
      const t = rng.range(event.window[0], event.window[1]);
      out.push({
        tick: Math.floor(t * durationTicks),
        index,
        id: event.id,
        creature: event.creature ?? null,
      });
    }
  });
  return out;
}

/** Merges schedules in time order (ties: biome order, then the first list first). */
export function mergeSchedules(
  a: readonly ScheduledEvent[],
  b: readonly ScheduledEvent[],
): ScheduledEvent[] {
  return [...a, ...b]
    .map((e, i) => ({ e, i }))
    .sort((x, y) => x.e.tick - y.e.tick || x.e.index - y.e.index || x.i - y.i)
    .map((x) => x.e);
}
