// v1.7d (D-059, GDD §11.3c) Namibië veld life, one lazy chunk loaded with a Namibië map: the
// ground cover (VeldView). View-only: it reads snapshots and events, never sim internals.
import type * as Phaser from 'phaser';
import type { Biome } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import type { AudioDirector } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import { OstrichView } from './OstrichView';
import { VeldView } from './VeldView';

/** e2e hook: the ground cover's sprites (placed, and drawn on the last frame). */
export interface NamibLifeHook {
  veld: number;
  veldShown: number;
  /** The ostriches drawn this frame (screen design px: foot x, y; drawn height). */
  ostriches: ReturnType<OstrichView['spots']>;
}

/** True when a map shows the Namibië veld life. */
export function wantsNamibLife(biome: Pick<Biome, 'id'>): boolean {
  return biome.id === 'namibie';
}

export class NamibLifeView {
  readonly veld: VeldView;
  readonly ostriches: OstrichView;

  constructor(
    scene: Phaser.Scene,
    biome: Biome,
    parallax: ParallaxView,
    opts: { readonly reducedMotion: boolean },
  ) {
    this.veld = new VeldView(scene, parallax, biome.id);
    this.ostriches = new OstrichView(scene, parallax, opts.reducedMotion);
  }

  /** After the parallax is placed for this frame. */
  update(s: SimState, prev: SimState | null, alpha: number, width: number): void {
    this.veld.update(width);
    this.ostriches.update(s, prev, alpha);
  }

  /** This frame's events (puffs and sounds). */
  handle(events: readonly SimEvent[], s: SimState, audio: AudioDirector, width: number): void {
    this.ostriches.handle(events, s, audio, width);
  }

  /** e2e hook. */
  hook(): NamibLifeHook {
    return { veld: this.veld.count, veldShown: this.veld.shown, ostriches: this.ostriches.spots() };
  }

  destroy(): void {
    this.veld.destroy();
    this.ostriches.destroy();
  }
}
