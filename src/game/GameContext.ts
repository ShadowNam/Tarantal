// What every scene shares: validated content, feel tuning, the asset manifest, audio, settings,
// the safe area and the test hook. Built once in main.ts.
import type { Biome, ContentBundle, Feel } from '../content/schemas';
import type { HuntResult, InputKind } from '../sim/types';
import type { AssetManifest } from './assets/AssetManifest';
import type { AudioDirector } from './audio/AudioDirector';
import type { Insets } from './layout';
import type { Rect } from './ui/hudLayout';

/** Read by Playwright (dev/test builds and ?e2e=1 only). */
export interface TestHook {
  ready: boolean;
  designWidth: number;
  designHeight: number;
  portrait: boolean;
  scene: 'start' | 'hunt' | 'tally';
  tick: number;
  ticksLeft: number;
  score: number;
  shells: number;
  shots: number;
  over: boolean;
  inputKind: InputKind | null;
  cameraX: number;
  birds: number;
  result: HuntResult | null;
  /** performance.now() when the first shot of the page was fired (ms since navigation start). */
  firstShotAtMs: number | null;
  /** Real frame-to-frame time in ms while a hunt is running (perf smoke). */
  frameTimes: number[];
  /** CPU time per frame in ms (Phaser pre-step → post-render: sim, views, HUD, render
   *  submission; excludes GPU raster and idle) while a hunt is running. */
  cpuFrameMs: number[];
  /** Encoded InputLog of the last hunt (bug reports / replay checks). */
  replay: string | null;
  hunts: number;
  /** Manifest textures missing when the last hunt started (must be 0). */
  missingTextures: string[];
  /** Boot milestones in ms since navigation start (content parsed, textures built, ready). */
  boot: Record<string, number>;
  /** On-screen rects in design px: HUD parts during a hunt, buttons on the tally. */
  rects: Record<string, Rect>;
  /** Safe area in design px when the HUD was laid out. */
  safe: Rect | null;
}

export interface GameContext {
  readonly content: ContentBundle;
  readonly contentHash: string;
  readonly feel: Feel;
  readonly biome: Biome;
  readonly manifest: AssetManifest;
  readonly audio: AudioDirector;
  /** Current safe-area insets in design px. */
  safeArea(): Insets;
  /** Seed for the next hunt (?seed= fixes it). */
  nextSeed(): number;
  /** e2e/dev only: shorter hunts. Undefined = the mode's length. */
  readonly huntSeconds: number | undefined;
  /** Device hint before the first touch: coarse pointer → touch hints on the start card. */
  readonly coarsePointer: boolean;
  readonly reducedMotion: boolean;
  /** Portrait (rotate card shown) or tab hidden: hunts pause. */
  paused(): boolean;
  debug: boolean;
  readonly hook: TestHook | null;
}
