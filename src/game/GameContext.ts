// What every scene shares: validated content, feel tuning, the asset manifest, audio, the save
// (settings and progress), live prefs, the platform adapter, the safe area and the test hook.
// Built once in main.ts.
import type { Biome, ContentBundle, DailyMeta, Feel, Notaboek } from '../content/schemas';
import type { ChallengeDecode } from '../meta/challenge';
import type { LoadStatus, SaveStore } from '../meta/save';
import type { StorageStatus } from '../meta/storage';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import type { AnalyticsRecord } from '../platform/web';
import type { HuntResult, InputKind } from '../sim/types';
import type { LivePrefs } from './prefs';
import type { DomChrome } from './ui/DomChrome';
import type { AssetManifest } from './assets/AssetManifest';
import type { AudioDirector } from './audio/AudioDirector';
import type { RunFlow } from './run/RunFlow';
import type { DailyFlow } from './daily/DailyFlow';
import type { Insets } from './layout';
import type { Rect } from './ui/hudLayout';

/** Read by Playwright (dev/test builds and ?e2e=1 only). */
export interface TestHook {
  ready: boolean;
  designWidth: number;
  designHeight: number;
  portrait: boolean;
  /** 'start' = the title (kept from M2: the title's START is the old start card).
   *  'challenge' = the "beat this" card of a challenge link (M7). */
  scene: 'start' | 'hunt' | 'tally' | 'run' | 'challenge';
  /** Menu overlay on top of the scene: shed, settings, pause (null = none). */
  menu: string | null;
  /** Id of the keyboard-focused item of the active menu (null = none yet). */
  focus: string | null;
  /** Hunt paused (pause menu, hidden tab or portrait). */
  paused: boolean;
  /** Mode of the hunt that is running or just ended. */
  mode: string | null;
  /** FTUE prompts shown this page, with their rendered size (GDD §16 one-line proof). */
  ftue: {
    active: boolean;
    steps: string[];
    prompts: { key: string; text: string; lines: number; width: number; room: number }[];
  };
  /** Analytics recorded this page (web adapter, no network). */
  analytics: readonly AnalyticsRecord[];
  /** How the save loaded and where it lives. */
  save: { status: LoadStatus; storage: StorageStatus };
  /** WebGL context restores seen this page. */
  contextRestores: number;
  tick: number;
  ticksLeft: number;
  score: number;
  shells: number;
  /** M8: belt size (-1 = no belt, Kettie), reloading, and Kettie stones in the air. */
  magazine: number;
  reloading: boolean;
  stones: number;
  shots: number;
  over: boolean;
  inputKind: InputKind | null;
  cameraX: number;
  birds: number;
  /** Vuvuzela charges left, uses this page, and live flocks as "id:state". */
  gadgetCharges: number;
  gadgetUses: number;
  flocks: string[];
  /** Live flocks with their members' mean position in design px of the screen. */
  /** Flock transitions this hunt as "id:from>to:cause" (capped). */
  flockLog: string[];
  flockSpots: { id: number; state: string; alive: number; x: number; y: number }[];
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
  /** M4: shootable secret parts, crates and scripted birds in design px of the screen. */
  secretSpots: { propId: string; partId: string; x: number; y: number; ready: boolean }[];
  crateSpots: { id: number; x: number; y: number }[];
  specialBirds: { id: number; creature: string; phase: string; x: number; y: number }[];
  /** Active weapon id, power-up ids, wind (omen) and hunt length (bonus time grows it). */
  weapon: string;
  /** M8: biome of the hunt on screen, and the omen's glare side (Bushveld) or null. */
  biome: string;
  glare: number | null;
  /** M8: the omen (biome weather) is on in this hunt; rain is falling now. */
  omen: boolean;
  rain: boolean;
  /** M8: a lightning flash is lighting the scene. */
  lightning: boolean;
  powerups: string[];
  wind: { dir: number; strength: number } | null;
  durationTicks: number;
  /** M6: the Season Run on screen (Run scene view, run phase, hunt, doppies, charms, offers). */
  run: {
    view: string;
    phase: string;
    huntIndex: number;
    doppies: number;
    charms: string[];
    offers: string[];
    quota: number;
  } | null;
  /** M6: what the run HUD draws (quota shown, charm chips, item buttons). */
  seasonHud: { quota: number | null; chips: number; items: number } | null;
  /** M7: seed of the hunt that is running or just ended. */
  huntSeed: number | null;
  /** M7: the daily hunt running or just ended (null = not a daily). */
  daily: { key: string; number: number; seed: number; official: boolean } | null;
  /** M7: challenge of the hunt running or just ended, and the card / tally lines shown. */
  challenge: { seed: number; mode: string; score: number; contentChanged: boolean } | null;
  /** M7: one-line notice on the title (a bad challenge link), the HUD tag, tally lines. */
  notice: string | null;
  hudTag: string | null;
  tally: { tag: string | null; compare: string | null; news: string | null; share: boolean } | null;
  /** M7: the last [Share] (outcome and the message sent). */
  lastShare: { outcome: string; text: string; url: string } | null;
}

/** e2e-only functions (window.__TM_TOOLS__): replay a log in this browser, the daily seed. */
export interface TestTools {
  readonly contentHash: string;
  dailySeed(key: string): number;
  replay(log: string): { eventHash: string; eventCount: number; score: number };
}

export interface GameContext {
  readonly content: ContentBundle;
  readonly contentHash: string;
  readonly feel: Feel;
  /** The home biome (Classic's, the panorama behind the title) and its asset manifest. */
  readonly biome: Biome;
  readonly manifest: AssetManifest;
  /** M8: biomes this build can draw, in content order (Daily rotation, challenges, the run). */
  readonly playableBiomes: readonly string[];
  /** M8: a playable biome's manifest (built on first use, then cached). */
  manifestFor(biome: Biome): AssetManifest;
  /** M8: the biome of the hunt on screen (the home biome between hunts). */
  huntBiome: Biome;
  readonly audio: AudioDirector;
  /** Settings + progress (SaveData v1). */
  readonly save: SaveStore;
  readonly notaboek: Notaboek;
  /** M7: content/meta/daily.json. */
  readonly dailyMeta: DailyMeta;
  /** M7: Daily Hunt, challenge links and sharing. */
  readonly daily: DailyFlow;
  /** M7: a challenge link opened this page, until the card has been shown. */
  pendingChallenge: ChallengeDecode | null;
  readonly platform: PlatformAdapter;
  /** M6: the Season Run (engine + save). */
  readonly run: RunFlow;
  /** Settings as the views use them (updated in place on change). */
  readonly prefs: LivePrefs;
  readonly chrome: DomChrome;
  /** Re-applies the language setting to i18n and the DOM. */
  applyLanguage(): void;
  /** A menu (pause) holds the hunt. */
  menuPaused: boolean;
  /** Current safe-area insets in design px. */
  safeArea(): Insets;
  /** Seed for the next hunt (?seed= fixes it). */
  nextSeed(): number;
  /** e2e/dev only: shorter hunts. Undefined = the mode's length. */
  readonly huntSeconds: number | undefined;
  /** e2e/dev only: ?omen=1 / ?omen=0 overrides the mode's omen. */
  readonly omen: boolean | undefined;
  /** e2e/dev only: ?biome= plays Classic hunts in another playable biome (M8). */
  readonly classicBiome: string | undefined;
  /** Device hint before the first touch: coarse pointer → touch hints on the start card. */
  readonly coarsePointer: boolean;
  readonly reducedMotion: boolean;
  /** Portrait (rotate card shown), tab hidden or the pause menu: hunts pause. */
  paused(): boolean;
  debug: boolean;
  readonly hook: TestHook | null;
}
