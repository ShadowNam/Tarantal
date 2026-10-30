// v1.7e (D-061, Tech §3.12c) The secrets' tell animals as a sim system the hunt plugs in (v1.8b,
// D-062: moved out of Sim.ts into the lazy sim-systems chunk with the baboons, so the first
// download doesn't carry them; the same code, the same events in the same order).
import type { Biome, ContentBundle } from '../../content/schemas';
import type { SimEvent } from '../events';
import type { RandomStream } from '../rng';
import type { TellView } from '../types';
import type { HitExtra } from '../weapons/hitTest';
import {
  createTells,
  spookTell,
  stepTell,
  tellHitCentre,
  tellPlacements,
  tellPresent,
  tellView,
} from './tells';

/** What the hunt gives the tell animals. */
export interface TellHost {
  readonly tick: () => number;
  emit(e: SimEvent): void;
  /** A secret's state: spent for the hunt (done), or ready to go off now (null: no such secret). */
  secret(propId: string): { readonly done: boolean; readonly ready: boolean } | null;
}

export interface TellSystem {
  /** The tells that are there (after the secret parts: never over one). */
  extras(add: (layerId: string, e: HitExtra) => void): void;
  /** A shot's tell hits: each flees (no points, no Frenzy change) and comes back later. */
  shot(shotId: number, hits: readonly number[]): void;
  step(): void;
  view(): TellView[];
}

export type TellSystemFactory = (
  biome: Biome,
  content: ContentBundle,
  rng: RandomStream,
  host: TellHost,
) => TellSystem;

export const createTellSystem: TellSystemFactory = (biome, content, rng, host) => {
  const T = content.birds.tells;
  let nextId = 1;
  const tells = createTells(tellPlacements(biome), T, rng, () => nextId++);
  return {
    extras(add) {
      for (const t of tells)
        if (tellPresent(t))
          add(t.layerId, {
            kind: 'tell',
            tellId: t.id,
            ...tellHitCentre(t),
            shape: { type: 'ellipse', rx: t.hit.rx, ry: t.hit.ry },
          });
    },
    shot(shotId, hits) {
      for (const id of hits) {
        const t = tells.find((x) => x.id === id);
        if (t === undefined || !tellPresent(t)) continue;
        spookTell(t, T, rng);
        host.emit({
          type: 'tellSpooked',
          tick: host.tick(),
          shotId,
          tellId: t.id,
          propId: t.propId,
        });
      }
    },
    step() {
      for (const t of tells) {
        const s = host.secret(t.propId);
        stepTell(t, T, rng, s?.done ?? true, s?.ready ?? false);
      }
    },
    view: () => tells.map(tellView),
  };
};
