// What one hunt contributed to meta progression, collected from the sim's event stream and its
// result (CLAUDE.md rule 4: meta subscribes to events, never reads sim internals). Pure.
import type { SimEvent } from '../sim/events';
import type { HuntResult } from '../sim/types';

export interface HuntLog {
  readonly mode: string;
  readonly biome: string;
  readonly score: number;
  readonly rank: string;
  readonly shots: number;
  readonly bagged: number;
  readonly baggedFar: number;
  readonly wingShots: number;
  readonly wholeFlocks: number;
  readonly secrets: number;
  readonly crates: number;
  /** Creature ids that appeared (Bird Book). */
  readonly creaturesSeen: readonly string[];
  /** Prop ids of secrets set off (Bird Book). */
  readonly secretsFound: readonly string[];
}

export interface HuntLogger {
  add(events: readonly SimEvent[]): void;
  /** Creatures seen so far this hunt (the ⛔ first-sighting call-out reads it too). */
  readonly creaturesSeen: ReadonlySet<string>;
  finish(result: HuntResult): HuntLog;
}

export function createHuntLogger(): HuntLogger {
  const creatures = new Set<string>();
  const secrets = new Set<string>();
  return {
    creaturesSeen: creatures,
    add(events) {
      for (const e of events) {
        if (e.type === 'birdSpawned') creatures.add(e.creature);
        else if (e.type === 'secretTriggered') secrets.add(e.propId);
      }
    },
    finish(r) {
      return {
        mode: r.mode,
        biome: r.biome,
        score: r.score,
        rank: r.rank,
        shots: r.shots,
        bagged: r.bagged,
        baggedFar: r.baggedByPlane.far,
        wingShots: r.wingShots,
        wholeFlocks: r.wholeFlocks,
        secrets: r.secrets,
        crates: r.crates,
        creaturesSeen: [...creatures].sort(),
        secretsFound: [...secrets].sort(),
      };
    },
  };
}
