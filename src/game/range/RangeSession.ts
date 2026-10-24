// v1.3x (D-037) Skietbaan: what HuntScene and the lazy range chunk say to each other. Types
// only (nothing here reaches the first download); the range's code loads with
// `import('./Skietbaan')` from the admin page.
import type * as Phaser from 'phaser';
import type { ContentBundle } from '../../content/schemas';
import type { AudioDirector } from '../audio/AudioDirector';
import type { SimEvent } from '../../sim/events';
import type { RangeProgramFactory } from '../../sim/range/types';
import type { InputKind, ModeConfig, PlaneId, SimState } from '../../sim/types';
import type { TestHook } from '../GameContext';

/** What HuntScene lends a running range. */
export interface RangeHost {
  readonly scene: Phaser.Scene;
  /** Sounds go through the game's AudioDirector (24 Oct: the range's hit sounds). */
  readonly audio: AudioDirector;
  /** The "reduce flashes" setting now. */
  reduceFlashes(): boolean;
  /** The container above a plane's birds, in that plane's coordinates (null: no such layer). */
  overlay(plane: PlaneId): Phaser.GameObjects.Container | null;
  /** Back to the setup page (the bar's Setup button; the pause menu's Quit does the same). */
  exit(): void;
  /** Runs another session in place of this one (the mixed course's Shuffle: a new seed). */
  replay(session: RangeSession): void;
}

/** One range session: the sim setup HuntScene starts, and the overlay that rides on it. */
export interface RangeSession {
  readonly mode: ModeConfig;
  readonly rangeProgram: RangeProgramFactory;
  readonly inputKind: InputKind;
  readonly seed: number;
  /** HuntScene built the views and the sim. */
  attach(host: RangeHost): void;
  /** Each frame after the sim advanced: its events and the newest snapshot. */
  frame(events: readonly SimEvent[], state: SimState): void;
  /** The scene shut down (setup, quit, page change). */
  detach(): void;
}

/** What HuntScene offers the Skietbaan's setup page. */
export interface RangeMenuHost {
  readonly content: ContentBundle;
  /** Biomes this build draws (the setup page offers these). */
  /** Every playable biome: the Skietbaan is an admin-page tool on its own save (D-039). If it
   *  ever becomes player-facing, pass unlockedBiomes() (src/meta/areas.ts) instead. */
  readonly playableBiomes: readonly string[];
  readonly hook: TestHook | null;
  /** UTC day (the range plays today's weekday light). */
  today(): number;
  nextSeed(): number;
  /** Starts the range (the scene restarts into it). */
  play(session: RangeSession): void;
  /** Back to the admin list. */
  back(): void;
}
