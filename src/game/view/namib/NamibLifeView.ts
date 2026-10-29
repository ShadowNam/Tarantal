// v1.7d (D-059, GDD §11.3c) Namibië veld life, one lazy chunk loaded with a Namibië map: the
// ground cover (VeldView), the ostriches (OstrichView), oryx in the mirage (OryxView) and the
// hot-air balloons (BalloonView). View-only: it reads snapshots and events, never sim internals.
import type * as Phaser from 'phaser';
import type { Biome } from '../../../content/schemas';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import type { AudioDirector } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import type { AssetManifest } from '../../assets/AssetManifest';
import type { FaunaOptions } from '../FaunaView';
import { heatOf } from './oryxRoam';
import { OryxView } from './OryxView';
import { OstrichView } from './OstrichView';
import { BalloonView } from './BalloonView';
import { VeldView } from './VeldView';

/** e2e hook: the ground cover (tufts placed; baked strips, those drawn on the last frame, and
 *  the tufts stamped into them). */
export interface NamibLifeHook {
  veld: number;
  veldStrips: number;
  veldShown: number;
  veldBaked: number;
  /** The ostriches drawn this frame (screen design px: foot x, y; drawn height). */
  ostriches: ReturnType<OstrichView['spots']>;
  /** The roaming oryx herds (layer x, facing, the reflection's alpha, screen x) and the heat. */
  oryx: OryxView['spots'];
  heat: number;
  /** The balloons drawn now (screen design px), their burner and fist. */
  balloons: BalloonView['spots'];
  /** Balloons alive in the sim now (drawn or not), and whether their sheet is in. */
  balloonsLive: number;
  balloonSheet: boolean;
}

/** True when a map shows the Namibië veld life. */
export function wantsNamibLife(biome: Pick<Biome, 'id'>): boolean {
  return biome.id === 'namibie';
}

export class NamibLifeView {
  readonly veld: VeldView;
  readonly ostriches: OstrichView;
  readonly oryx: OryxView;
  readonly balloons: BalloonView;
  private heat = 0;
  private mirage: boolean | null = null;

  constructor(
    scene: Phaser.Scene,
    biome: Biome,
    parallax: ParallaxView,
    private readonly opts: {
      readonly reducedMotion: boolean;
      readonly reduceFlashes: () => boolean;
      readonly manifest: AssetManifest;
      readonly fauna: FaunaOptions;
      readonly lightIds: () => readonly string[];
      readonly audio: AudioDirector;
      readonly planeScales: Readonly<Record<'near' | 'mid' | 'far' | 'ver', number>>;
    },
  ) {
    this.veld = new VeldView(scene, parallax, biome.id);
    this.ostriches = new OstrichView(scene, parallax, opts.reducedMotion);
    this.oryx = new OryxView(
      scene,
      opts.manifest,
      parallax,
      biome.id,
      opts.fauna,
      opts.reducedMotion,
    );
    this.balloons = new BalloonView(scene, parallax, opts.reduceFlashes, opts.planeScales);
  }

  /** After the parallax is placed for this frame. */
  update(s: SimState, prev: SimState | null, alpha: number, width: number): void {
    this.veld.update(width);
    this.ostriches.update(s, prev, alpha);
    // The heat follows the mirage flag and the hunt's lights: worked out only when it changes.
    if (s.mirage !== this.mirage) {
      this.mirage = s.mirage;
      this.heat = heatOf(s.mirage, this.opts.lightIds());
    }
    // Reduce flashes or motion: the shimmer holds still (the reflection stays).
    this.oryx.update(
      s.tick,
      this.opts.reducedMotion || this.opts.reduceFlashes(),
      width,
      this.heat,
    );
    // The balloons: BirdView leaves drifters out, so this is the only place they are drawn.
    this.balloons.update(s, prev, alpha, this.opts.audio, width);
  }

  /** This frame's events (puffs and sounds). */
  handle(events: readonly SimEvent[], s: SimState, audio: AudioDirector, width: number): void {
    this.ostriches.handle(events, s, audio, width);
    this.balloons.handle(events);
  }

  /** e2e hook. */
  hook(): NamibLifeHook {
    return {
      veld: this.veld.count,
      veldStrips: this.veld.strips,
      veldShown: this.veld.shown,
      veldBaked: this.veld.baked,
      ostriches: this.ostriches.spots(),
      oryx: this.oryx.spots,
      heat: this.heat,
      balloons: this.balloons.spots,
      balloonsLive: this.balloons.live,
      balloonSheet: this.balloons.sheetReady,
    };
  }

  destroy(): void {
    this.veld.destroy();
    this.ostriches.destroy();
    this.oryx.destroy();
    this.balloons.destroy();
  }
}
