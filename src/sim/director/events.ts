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

/** World events with a handler in M1: non-target fly-overs that cost points when shot. */
export const FLYOVER_EVENTS: ReadonlySet<WorldEventId> = new Set<WorldEventId>([
  'hadeda',
  'cropSprayer',
]);

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
