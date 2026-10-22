// What every scene shares: validated content, feel tuning, the asset manifest, audio, the save
// (settings and progress), live prefs, the platform adapter, the safe area and the test hook.
// Built once in main.ts.
import type * as Phaser from 'phaser';
import type { Biome, ContentBundle, DailyMeta, Feel, Notaboek } from '../content/schemas';
import type { ChallengeDecode } from '../meta/challenge';
import type { LoadStatus, SaveStore } from '../meta/save';
import type { StorageStatus } from '../meta/storage';
import type { ErrorReport, PlatformAdapter } from '../platform/PlatformAdapter';
import type { AdBreaks, AdCounts } from './ads/AdBreaks';
import type { AnalyticsRecord } from '../platform/local';
import type { HuntResult, InputKind } from '../sim/types';
import type { LivePrefs } from './prefs';
import type { DomChrome } from './ui/DomChrome';
import type { AssetManifest, ManifestEntry } from './assets/AssetManifest';
import type { FlashLimiter } from './view/flashLimit';
import type { CaptureState } from './capture';
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
  /** M9: canvas px per design px (the quality tier's render scale). */
  renderScale: number;
  portrait: boolean;
  /** 'start' = the title (kept from M2: the title's START is the old start card).
   *  'challenge' = the "beat this" card of a challenge link (M7). */
  scene: 'start' | 'hunt' | 'tally' | 'run' | 'challenge';
  /** Menu overlay on top of the scene: shed, settings, pause (null = none). */
  menu: string | null;
  /** M10: the self-hosted fonts loaded before the game drew any text. */
  fontsReady: boolean;
  /** M10 capture mode: speed (0 = frozen) and auto-pan, or null outside it. */
  capture: {
    speed: number;
    frozen: boolean;
    panning: boolean;
    hud: boolean;
    /** v1.0.1: the key hint is on screen. */
    hint: boolean;
  } | null;
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
  /** v1.0.1 (D-028 §4): score pops shown this page, and pop objects made (pooled: stays small). */
  pops: { shown: number; created: number };
  result: HuntResult | null;
  /** performance.now() when the first shot of the page was fired (ms since navigation start). */
  firstShotAtMs: number | null;
  /** Real frame-to-frame time in ms while a hunt is running (perf smoke). */
  frameTimes: number[];
  /** CPU time per frame in ms (Phaser pre-step → post-render: sim, views, HUD, render
   *  submission; excludes GPU raster and idle) while a hunt is running. */
  cpuFrameMs: number[];
  /** M9: per hunt frame, the ms spent in sim ticks and how many ticks ran. */
  simFrameMs: number[];
  simFrameSteps: number[];
  /** Encoded InputLog of the last hunt (bug reports / replay checks). */
  replay: string | null;
  hunts: number;
  /** M10: the asset index (null problem = loaded) and each loaded biome's keys with status. */
  assets: {
    problem: string | null;
    byBiome: Record<string, ManifestEntry[]>;
    /** Sound keys playing from a recorded file (decoded), not the synth. */
    recorded: string[];
  };
  /** M10: what the music plays (biome, audible stem) and the master gain (0 while muted). */
  readonly music: { id: string; stem: string | null } | null;
  readonly masterGain: number | null;
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
    /** Padstal: the "why you can't buy" notes on the offer cards (D-026). */
    notes: string[];
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
  /** M9: the build's platform adapter id. */
  platform: string;
  /** M9: a commercial break is being asked for before the next hunt. */
  adPending: boolean;
  /** M9: hunts started after a break request (a double tap must count once). */
  huntRequests: number;
  /** M9: ads asked for this page (AdBreaks counts). */
  ads: AdCounts | null;
  /** M9: the quality tier in use and this page's benchmark (null until it ran). */
  quality: {
    tier: string;
    bench: { tier: string; avgMs: number } | null;
    benchRan: boolean;
    /** Parallax layers drawn (low tier merges one) and camera filters on. */
    layers: number;
    filters: string[];
  };
  /** M9: the Padstal help card's text bottom and OK button top (no overlap: textBottom < okTop). */
  helpCard?: { textBottom: number; okTop: number };
  /** M9: sound captions on screen (i18n keys, newest first). */
  captions: string[];
  /** M9: the AudioDirector is muted (ad, portal mute, pause, hidden tab). */
  audioMuted: boolean;
  /** M9: error reports this page (LocalPlatform.errors). */
  errors: readonly ErrorReport[];
}

/** e2e-only functions (window.__TM_TOOLS__): replay a log in this browser, the daily seed. */
export interface TestTools {
  readonly contentHash: string;
  dailySeed(key: string): number;
  replay(log: string): { eventHash: string; eventCount: number; score: number };
  /** v1.0.1 (D-028 §4): `n` world score pops now, pooled BitmapText or canvas Text; sync ms. */
  popBench(n: number, mode: 'bitmap' | 'text'): number | null;
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
  /** M9: the biome's art chunk is loaded (manifestFor may be called). */
  biomeReady(id: string): boolean;
  /** M9: loads a biome's art chunk (lazy biome bundles); false if it failed. */
  loadBiome(id: string): Promise<boolean>;
  /** M8: the biome of the hunt on screen (the home biome between hunts). */
  huntBiome: Biome;
  readonly audio: AudioDirector;
  /** M10: the shared budget of large-area flashes (≤ 3 a second, GDD §18.3). */
  readonly flashes: FlashLimiter;
  /** M10 marketing capture mode (?capture=1), or null. */
  readonly capture: CaptureState | null;
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
  /** M9: commercial breaks between hunts and the GDD's rewarded ads. */
  readonly ads: AdBreaks;
  /** M6: the Season Run (engine + save). */
  readonly run: RunFlow;
  /** Settings as the views use them (updated in place on change). */
  readonly prefs: LivePrefs;
  readonly chrome: DomChrome;
  /** M9: the title is on screen (runs the quality benchmark while it stays there). */
  titleShown(scene: Phaser.Scene): void;
  /** M9: called after live prefs changed (quality tier → filters). Returns an unsubscribe. */
  onPrefsChange(fn: () => void): () => void;
  /** M9: reloads the page (after the privacy screen's clear my data). */
  restartPage(): void;
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
  /** e2e/dev only (?holdAt=600): hunts stop at this sim tick (M10 visual baselines). */
  readonly holdAtTick: number | undefined;
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
