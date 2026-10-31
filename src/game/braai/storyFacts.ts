// v1.11 (D-068): what Oupa's braai story needs that the hunt's result doesn't carry — counted in
// the game layer from the sim's event stream (read only: the sim is unchanged). Same events ⇒ same
// facts, so the same hunt always tells the same story. In the first download (HuntScene feeds it);
// the story itself (story.ts) is in the braai's lazy chunk.
import type { SimEvent } from '../../sim/events';
import type { PlaneId } from '../../sim/types';

export interface StoryFacts {
  /** Birds bagged on the Ver plane (the horizon strip of the bonus maps). */
  readonly verBagged: number;
  /** Birds bagged on the far plane. */
  readonly farBagged: number;
  /** The farthest plane a bird was bagged on (null: none bagged). */
  readonly farthest: PlaneId | null;
  /** Meerkat scolds (a meerkat hit). */
  readonly meerkatScolds: number;
  /** Penalties from a "don't!" secret (the weavers' family nest). */
  readonly nestScolds: number;
  /** Birds bagged while the Reënbui's flying ants were out (the event's own count). */
  readonly swarmBagged: number;
}

export const NO_FACTS: StoryFacts = {
  verBagged: 0,
  farBagged: 0,
  farthest: null,
  meerkatScolds: 0,
  nestScolds: 0,
  swarmBagged: 0,
};

const DEPTH: Readonly<Record<PlaneId, number>> = { near: 0, mid: 1, far: 2, ver: 3 };

/** Counts the story's facts over a hunt's events (one per hunt; `add` every frame's batch). */
export class StoryFactsLog {
  private ver = 0;
  private far = 0;
  private farthest: PlaneId | null = null;
  private meerkat = 0;
  private nest = 0;
  private swarm = 0;

  add(events: readonly SimEvent[]): void {
    for (const e of events)
      switch (e.type) {
        case 'targetBagged':
          if (e.plane === 'ver') this.ver++;
          else if (e.plane === 'far') this.far++;
          if (this.farthest === null || DEPTH[e.plane] > DEPTH[this.farthest])
            this.farthest = e.plane;
          break;
        case 'meerkatScold':
          this.meerkat++;
          break;
        case 'secretPenalty':
          this.nest++;
          break;
        case 'rainEased':
          this.swarm += e.bagged;
          break;
        default:
          break;
      }
  }

  facts(): StoryFacts {
    return {
      verBagged: this.ver,
      farBagged: this.far,
      farthest: this.farthest,
      meerkatScolds: this.meerkat,
      nestScolds: this.nest,
      swarmBagged: this.swarm,
    };
  }
}
