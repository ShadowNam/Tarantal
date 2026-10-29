// v1.7d (D-059, GDD §11.3c) Namibië veld life, one lazy chunk loaded with a Namibië map: the
// ground cover (VeldView). View-only: it reads snapshots and events, never sim internals.
import type * as Phaser from 'phaser';
import type { Biome } from '../../../content/schemas';
import type { ParallaxView } from '../ParallaxView';
import { VeldView } from './VeldView';

/** e2e hook: the ground cover's sprites (placed, and drawn on the last frame). */
export interface NamibLifeHook {
  veld: number;
  veldShown: number;
}

/** True when a map shows the Namibië veld life. */
export function wantsNamibLife(biome: Pick<Biome, 'id'>): boolean {
  return biome.id === 'namibie';
}

export class NamibLifeView {
  readonly veld: VeldView;

  constructor(scene: Phaser.Scene, biome: Biome, parallax: ParallaxView) {
    this.veld = new VeldView(scene, parallax, biome.id);
  }

  /** After the parallax is placed for this frame. */
  update(width: number): void {
    this.veld.update(width);
  }

  /** e2e hook. */
  hook(): NamibLifeHook {
    return { veld: this.veld.count, veldShown: this.veld.shown };
  }

  destroy(): void {
    this.veld.destroy();
  }
}
