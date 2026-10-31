// v1.9 (D-066): when the hunt's penalty creatures (hadeda, fish eagle, kwêvoël) will appear, so the
// soundscape can stay quiet BEFORE their world events (their own calls are the player's warning).
// The sim keeps its event schedule to itself and doesn't change for presentation, so this re-runs
// the sim's own pure schedule functions (forecastSim.ts) on the hunt's seed and mode, read-only: the same streams
// (`events`, and `charms` for the extra events of a charm), the same map, light and omen. Nothing
// here can touch the sim. warningForecast.test.ts checks it against every event the real sim
// emits, so a change to the sim's schedule fails the test rather than silently drifting.
import type { ContentBundle } from '../../content/schemas';
import type { ModeConfig } from '../../sim/types';
import type { ForecastSim } from './forecastSim';

export interface ForecastEvent {
  readonly tick: number;
  readonly event: string;
  readonly creature: string;
}

/** The world events of these creatures the hunt (seed, mode) will schedule, by tick. */
export function forecastWarnings(
  content: ContentBundle,
  seed: number,
  mode: ModeConfig,
  creatures: ReadonlySet<string>,
  sim: ForecastSim,
): ForecastEvent[] {
  const { createRng, mapOmen, mergeSchedules, passivesOf, resolveMap, scheduleExtraEvents } = sim;
  const { scheduleWorldEvents, secondsToTicks } = sim;
  // The Skietbaan and the FTUE script schedule nothing of the biome's.
  if (mode.id === 'range') return [];
  const defaults = mode.id === 'seasonHunt' ? undefined : content.modes.modes[mode.id];
  const biomeId = mode.biome ?? defaults?.biome;
  const base = content.biomes.find((b) => b.id === biomeId);
  if (base === undefined) return [];
  const timed = defaults !== undefined && 'huntSeconds' in defaults ? defaults : undefined;
  const huntSeconds = mode.huntSeconds ?? timed?.huntSeconds ?? content.run.huntSeconds;
  let map;
  try {
    map = resolveMap(base, mode.layout, mode.bonus, false);
  } catch {
    return [];
  }
  const season = mode.season ?? null;
  const omen = mapOmen(
    map.weather,
    mode.omen,
    (season === null ? defaults?.omen : season.kind === 'omen') ?? false,
  );
  const duration = secondsToTicks(huntSeconds);
  const light = map.layout?.light ?? null;
  const rng = createRng(seed);
  let schedule = scheduleWorldEvents(
    map.biome,
    mode.id,
    omen,
    duration,
    rng.stream('events'),
    season?.kind === 'boss',
    light,
  );
  const charms = (season?.charms ?? []).flatMap((id) => {
    const c = content.charms.charms.find((x) => x.id === id);
    return c === undefined ? [] : [c];
  });
  const mul = passivesOf(charms).spawnRateMul;
  if (mul.size > 0)
    schedule = mergeSchedules(
      schedule,
      scheduleExtraEvents(map.biome, mode.id, omen, duration, mul, rng.stream('charms'), light),
    );
  const out: ForecastEvent[] = [];
  for (const e of schedule)
    if (e.creature !== null && creatures.has(e.creature))
      out.push({ tick: e.tick, event: e.id, creature: e.creature });
  return out;
}

/**
 * Keeps the quiet windows: a creature's calls are quiet from `beforeTicks` before each of its
 * forecast events until `afterTicks` after the event (or after it was last seen on screen,
 * whichever is later). Seen = present in the snapshot's birds (observe, once a frame).
 */
export class WarningQuiet {
  private forecast: readonly ForecastEvent[] = [];
  private readonly lastSeen = new Map<string, number>();
  private readonly watched: ReadonlySet<string>;

  constructor(
    creatures: Iterable<string>,
    private readonly beforeTicks: number,
    private readonly afterTicks: number,
  ) {
    this.watched = new Set(creatures);
  }

  /** A new hunt (or the title: none). */
  reset(forecast: readonly ForecastEvent[]): void {
    this.forecast = forecast;
    this.lastSeen.clear();
  }

  /** Once a frame: which watched creatures are on screen now (no allocation). */
  observe(tick: number, birds: readonly { readonly creature: string }[]): void {
    for (const b of birds) if (this.watched.has(b.creature)) this.lastSeen.set(b.creature, tick);
  }

  /** A world event the sim emitted (a creature arrives even if the forecast missed it). */
  arrived(creature: string, tick: number): void {
    if (this.watched.has(creature)) this.lastSeen.set(creature, tick);
  }

  quiet(creature: string, tick: number): boolean {
    const seen = this.lastSeen.get(creature);
    if (seen !== undefined && tick <= seen + this.afterTicks) return true;
    for (const e of this.forecast)
      if (
        e.creature === creature &&
        tick >= e.tick - this.beforeTicks &&
        tick <= e.tick + this.afterTicks
      )
        return true;
    return false;
  }
}
