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
 * - later: handler arrives in a later milestone (farmDog, M6 charm).
 */
export type WorldEventHandler =
  'flyover' | 'perch' | 'boss' | 'dustDevil' | 'secretReward' | 'crate' | 'stampede' | 'later';

export const WORLD_EVENT_HANDLERS: Readonly<Record<WorldEventId, WorldEventHandler>> = {
  hadeda: 'flyover',
  cropSprayer: 'flyover',
  kwevoel: 'perch',
  dustDevil: 'dustDevil',
  farmDog: 'later',
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

export function scheduleWorldEvents(
  biome: Biome,
  mode: ModeId,
  omen: boolean,
  durationTicks: number,
  rng: RandomStream,
): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  biome.events.forEach((event, index) => {
    if (event.modes !== undefined && !event.modes.includes(mode)) return;
    if (event.omenOnly === true && !omen) return;
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
