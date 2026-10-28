// 1.9.4 (D-057): the trees' life, in one lazy chunk (loaded once a map with the baobab is
// running): the baobab's residents (BaobabLifeView). View only, on sim time; nothing here is in
// the first download.
import type * as Phaser from 'phaser';
import type { Biome, Feel } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import type { ParallaxView } from '../ParallaxView';
import type { PelletStop } from '../fruit/fruitHits';
import { BaobabLifeView, type ResidentHook } from './BaobabLifeView';
import { RESIDENT_IDS } from './baobabResidents';

export interface TreeLifeArgs {
  /** The hunt's seed (set when the hunt starts). */
  readonly seed: () => number;
  readonly lightIds: readonly string[];
  readonly reducedMotion: boolean;
  /** Test build only: ?treeLife=<resident id>. */
  readonly preview: string | null;
  readonly farFactor: number;
  readonly cameraAt: (tick: number) => number | null;
}

/** e2e hook: the residents on screen and the near shots that startled them. */
export interface TreeLifeHook {
  residents: ResidentHook[];
  ducks: number;
}

/** Light presets under which the bushbaby is out more (dawn, dusk, the golden hour). */
const DUSK_LIGHTS: ReadonlySet<string> = new Set(['dawn_mist', 'dusk', 'golden']);

/** True when this map has something for the tree-life view to draw. */
export function wantsTreeLife(biome: Biome): boolean {
  return BaobabLifeView.wants(biome);
}

export class TreeLifeView {
  private readonly baobab: BaobabLifeView | null;

  constructor(
    scene: Phaser.Scene,
    feel: Feel,
    biome: Biome,
    parallax: ParallaxView,
    a: TreeLifeArgs,
  ) {
    const preview = RESIDENT_IDS.find((id) => id === a.preview) ?? null;
    this.baobab = BaobabLifeView.wants(biome)
      ? new BaobabLifeView(scene, feel.treeLife, biome, parallax, {
          seed: a.seed,
          dusk: a.lightIds.some((id) => DUSK_LIGHTS.has(id)),
          reducedMotion: a.reducedMotion,
          preview: preview,
          farFactor: a.farFactor,
          cameraAt: a.cameraAt,
        })
      : null;
  }

  handle(
    events: readonly SimEvent[],
    state: SimState,
    stopOf: (e: Extract<SimEvent, { type: 'pelletImpact' }>) => PelletStop | null,
  ): void {
    this.baobab?.handle(events, state, stopOf);
  }

  update(state: SimState, alpha: number): void {
    this.baobab?.update(state, alpha);
  }

  hook(): TreeLifeHook {
    return { residents: [...(this.baobab?.residents ?? [])], ducks: this.baobab?.duckCount ?? 0 };
  }

  destroy(): void {
    this.baobab?.destroy();
  }
}
