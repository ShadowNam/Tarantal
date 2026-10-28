// What every scene shares: validated content, feel tuning, the asset manifest, audio, the save
// (settings and progress), live prefs, the platform adapter, the safe area and the test hook.
// Built once in main.ts.
import type { GraphicsControl } from './assets/graphicsChoice';
import type * as Phaser from 'phaser';
import type { Biome, ContentBundle, DailyMeta, Feel, Notaboek } from '../content/schemas';
import type { ChallengeDecode } from '../meta/challenge';
import type { FruitHookSpot } from './view/fruit/FruitView';
import type { LoadStatus, SaveStore } from '../meta/save';
import type { StorageStatus } from '../meta/storage';
import type { ErrorReport, PlatformAdapter } from '../platform/PlatformAdapter';
import type { AdBreaks, AdCounts } from './ads/AdBreaks';
import type { AnalyticsRecord } from '../platform/local';
import type { HuntResult, InputKind } from '../sim/types';
import type { LivePrefs } from './prefs';
import type { DomChrome } from './ui/DomChrome';
import type { AssetManifest, LateNeed, ManifestEntry } from './assets/AssetManifest';
import type { FlashLimiter } from './view/flashLimit';
import type { CaptureState } from './capture';
import type { BarkDirector } from './audio/barks';
import type { AudioDirector } from './audio/AudioDirector';
import type { RunFlow } from './run/RunFlow';
import type { DailyFlow } from './daily/DailyFlow';
import type { Insets } from './layout';
import type { Rect } from './ui/hudLayout';
import type { AdminContext } from './admin/AdminContext';

/** v1.3x (D-037) Skietbaan state for Playwright (filled by the lazy range chunk). */
export interface RangeHookState {
  readonly view: 'setup' | 'range';
  /** The setup chosen (the range's, or the one the setup page shows). */
  readonly gun: string;
  readonly biome: string;
  readonly plane: string;
  readonly target: string;
  /** The current cell's stats (null before its first shot). */
  readonly stats: {
    readonly shots: number;
    readonly hits: number;
    readonly misses: number;
    /** Misses that fell short of Ver (24 Oct update). */
    readonly short: number;
    readonly pelletsOn: number;
    readonly impacts: number;
    /** v1.8 (D-050): Blikkies knock-offs, air shots and hits, the longest chain. */
    readonly cans: { knocks: number; airShots: number; airHits: number; bestChain: number };
    /** The cell's report lines as the setup page shows them. */
    readonly lines: readonly string[];
  } | null;
  /** Every cell of this gun in the session (24 Oct: the mixed course fills several). */
  readonly cells: readonly {
    readonly plane: string;
    readonly target: string;
    readonly shots: number;
    readonly hits: number;
    readonly short: number;
  }[];
  /** Holes drawn on the paper targets now (D-040: every hole of the visit, not only 20). */
  readonly drawnImpacts: number;
  /**
   * D-040 review: the mark bakes' cost since this course started (MarkSurface bakeStats): render
   * passes, marks drawn, the slowest and the last bake's ms, and the bake textures alive now
   * (a switch must not leave the old ones behind).
   */
  readonly bake?: {
    readonly renders: number;
    readonly marks: number;
    readonly maxBakeMs: number;
    readonly lastBakeMs: number;
    readonly liveTextures: number;
  };
  /** D-040: each paper or plate on the range, its marks for the visit (key: area|course|distance|kind|
   *  index) and how many are baked on it now. */
  readonly marks: readonly {
    readonly key: string;
    readonly kind: string;
    readonly count: number;
    readonly drawn: number;
    /** A plate's swing angle now (radians; 0 for paper or a still plate). */
    readonly swing: number;
    /** The newest mark is highlighted now. */
    readonly lit: boolean;
    /** The sim tick the newest mark landed (null: none). */
    readonly lastTick: number | null;
  }[];
  /** Paper targets on screen (design px, unzoomed) and their radius. */
  readonly papers: readonly {
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly plane: string;
    /** 'paper' or 'plate' (24 Oct update). */
    readonly kind: string;
  }[];
  /** Range birds on screen (design px, unzoomed body centre) and their plane. */
  readonly birds: readonly { readonly x: number; readonly y: number; readonly plane: string }[];
  /** The session's seed (the mixed course's Shuffle draws a new one). */
  readonly seed?: number;
  /** 24 Oct update: hit feedback so far — markers by kind, the last hit marker's distance,
   *  paper blinks, plate swings, the bar's hit pulses. */
  readonly feedback?: {
    readonly hit: number;
    readonly miss: number;
    readonly short: number;
    readonly lastHit: string | null;
    readonly blinks: number;
    readonly swings: number;
    readonly pulses: number;
  };
}

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
  scene: 'start' | 'hunt' | 'tally' | 'run' | 'challenge' | 'admin' | 'skietbaan' | 'range';
  /** v1.2x (D-034): the admin page on screen (list or play card), or null. */
  admin: { view: 'list' | 'play'; selected: string | null; entries: number } | null;
  /** v1.3x (D-037): the Skietbaan (setup page or the range), or null. */
  range: RangeHookState | null;
  /** 24 Oct update, e2e only: true holds the Skietbaan's markers and plate swings still (a
   *  screenshot under software GL is slower than a 0.6 s marker). */
  rangeHold?: boolean;
  /** v1.6 (D-042): the build stamp on screen (text, whether it shows, its size and box). */
  stamp?: {
    text: string;
    visible: boolean;
    px: number;
    rect: { x: number; y: number; w: number; h: number };
  };
  /** v1.6 (D-042): the scope picture's texture at hunt start: delivered art or a drawn placeholder. */
  sightArt?: 'final' | 'placeholder' | null;
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
  /** 1.9.2 (D-055): ticks until the gun may fire again (0 = ready). */
  cooldownTicks: number;
  /** 1.9.2 (D-055): the Langloop's zoom panel (−/+ and "3×") is on screen. */
  zoomPanel: boolean;
  /** 1.9.2 (D-055): how far above a finger it aims (Settings → offset crosshair; 0 = none). */
  aimOffsetPx: number;
  /** M8: belt size (-1 = no belt, Kettie), reloading, and Kettie stones in the air. */
  magazine: number;
  reloading: boolean;
  stones: number;
  /** v1.1 (D-032): the HUD's ammo textures in belt order, and the crosshair on screen: the gun
   *  it belongs to, its reach (px from the aim point) and whether it shows. */
  ammo: string[];
  crosshair: { weapon: string; extent: number; visible: boolean; x: number; y: number };
  /** v1.3: the rifle zoom view: zoom, raise 0..1, the reticle on screen (design px), the sight. */
  zoom: {
    z: number;
    raise: number;
    reticleX: number;
    reticleY: number;
    sight: string | null;
    /** 1.9.2 (D-055): the sight picture on screen this frame ('red_dot' under the Rooikol),
     *  null while the sight is down. */
    picture: string | null;
    /** v1.4 (#56): screens' worth of world-layer pixels drawn in the last frame. */
    fill: number;
  };
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
  flockSpots: {
    id: number;
    state: string;
    alive: number;
    x: number;
    y: number;
    /** v1.3: the flock's plane (Ver flocks for the long-range checks). */
    plane: string;
  }[];
  /** v1.0.1 (D-028 §4): score pops shown this page, and pop objects made (pooled: stays small). */
  pops: { shown: number; created: number };
  /** v1.0.1 (D-028 §3): Oupa's bubble on screen (line key, text, design-px rect) and every line
   *  he has said on this page, oldest first (capped). */
  bark: { line: string; text: string; x: number; y: number; w: number; h: number } | null;
  barks: string[];
  result: HuntResult | null;
  /** performance.now() when the first shot of the page was fired (ms since navigation start). */
  firstShotAtMs: number | null;
  /** Real frame-to-frame time in ms while a hunt is running (perf smoke). */
  frameTimes: number[];
  /** v1.3: per frameTimes sample, whether a sight was fully up. */
  frameScoped: boolean[];
  /** v1.4 (#56): per frameTimes sample, whether the view was fully open (zoom 1, no sight). */
  frameOpen: boolean[];
  /** CPU time per frame in ms (Phaser pre-step → post-render: sim, views, HUD, render
   *  submission; excludes GPU raster and idle) while a hunt is running. */
  cpuFrameMs: number[];
  /** v1.3: per cpuFrameMs sample, whether a sight was fully up (perf's scoped phase). */
  cpuFrameScoped: boolean[];
  /** v1.4 (#56): per cpuFrameMs sample, whether the view was fully open (zoom 1). */
  cpuFrameOpen: boolean[];
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
    /** D-054: biomes whose manifest's late group has settled (loaded or failed). */
    lateDone: Record<string, boolean>;
    /** Sound keys playing from a recorded file (decoded), not the synth. */
    recorded: string[];
    /** v1.6 (D-042): delivered files that failed to load this page, with why. */
    failed: readonly { path: string; why: string }[];
  };
  /**
   * v1.5 (D-041): Oupa's voice — the voice language in use, its pack's state (each language's
   * pack loads only when chosen) and the voice keys played from a recording (voice/<lang>/<line>).
   */
  voice: {
    language: string;
    pack: 'none' | 'loading' | 'ready' | 'partial' | 'missing';
    played: string[];
    /** v1.7b (D-046): Oupa's voice is allowed (Settings → Oupa's comments "On"). */
    oupa: boolean;
  };
  /** M10: what the music plays (biome, audible stem) and the master gain (0 while muted). */
  readonly music: { id: string; stem: string | null } | null;
  readonly masterGain: number | null;
  /** Manifest textures missing when the last hunt started (must be 0). */
  missingTextures: string[];
  /** D-029: RGBA bytes of all textures (GPU memory estimate) during a hunt, and when the
   *  Skiet-Skuur opens (D-035 review); 0 before. */
  textureBytes: number;
  /** D-053: the largest textures (key, MB), sampled with textureBytes. */
  textureTop: { key: string; mb: number }[];
  /** v1.3: delivered gun atlases in the texture manager (sampled with textureBytes). */
  gunAtlases: string[];
  /** Boot milestones in ms since navigation start (content parsed, textures built, ready). */
  boot: Record<string, number>;
  /** On-screen rects in design px: HUD parts during a hunt, buttons on the tally. */
  rects: Record<string, Rect>;
  /** Safe area in design px when the HUD was laid out. */
  safe: Rect | null;
  /** M4: shootable secret parts, crates and scripted birds in design px of the screen. */
  secretSpots: { propId: string; partId: string; x: number; y: number; ready: boolean }[];
  /** v1.3: hittable Ver birds' body centres on the UNZOOMED screen (design px), for aiming. */
  verBirds: { id: number; x: number; y: number }[];
  /** D-049: hittable far-plane targets' body centres on the screen (design px), for aiming. */
  farBirds: { id: number; x: number; y: number }[];
  /** v1.7b: each crate's item and the icon drawn on it (null = none). */
  crateSpots: {
    id: number;
    x: number;
    y: number;
    item: string | null;
    icon: string | null;
    /** 1.9.2 (D-055): on screen (world transforms, zoom included): where the icon belongs (the
     *  canopy or box front through the crate image), where its tag is drawn, and how many icon
     *  tags the crate shows (1). */
    drawn: {
      spot: { x: number; y: number };
      tag: { x: number; y: number } | null;
      tags: number;
    } | null;
  }[];
  specialBirds: { id: number; creature: string; phase: string; x: number; y: number }[];
  /** Active weapon id, power-up ids, wind (omen) and hunt length (bonus time grows it). */
  weapon: string;
  /** M8: biome of the hunt on screen, and the omen's glare side (Bushveld) or null. */
  biome: string;
  /** v1.2: the title offers Verder (today's map quota beaten), and the last hunt's unlock. */
  verder: boolean;
  /** v1.3: the bonus maps the title offers today (verder, nogVerder, dieVerste). */
  bonusOpen: string[];
  /** v1.3: unlocked bonus maps the title shows locked because the gun has no scope fitted. */
  bonusNeedsScope: string[];
  /** v1.3: the Skiet-Skuur's sight row (the last rifle drawn) and its fitted sight. */
  shedSights?: { weapon: string; fitted: string | null };
  verderUnlocked: string | null;
  /** v1.2: the map on screen (layout, bonus map, light presets drawn, prop u positions). */
  map: {
    layout: string | null;
    bonus: string | null;
    lights: string[];
    props: Record<string, number>;
  } | null;
  glare: number | null;
  /** M8: the omen (biome weather) is on in this hunt; rain is falling now. */
  omen: boolean;
  rain: boolean;
  /** M8: a lightning flash is lighting the scene. */
  lightning: boolean;
  powerups: string[];
  wind: { dir: number; strength: number } | null;
  durationTicks: number;
  /** v1.4 B (D-039): the area picker's cards, and the Classic area now. */
  areas: { id: string; unlocked: boolean; chosen: boolean }[];
  classicArea: string;
  /** v1.4 B (D-039): angry weavers on screen now, and bursts started this hunt. */
  weavers: number;
  weaverBursts: number;
  /** v1.7 (D-044): the meerkats now (screen feet, body centre to aim at, pose), and the hunt's
   *  meerkat events in order ("hit:-10", "scold:-10", "dived:shot", "alarm:sproeier",
   *  "familiefoto"), at most 200. */
  meerkats: {
    id: number;
    colony: string;
    pose: string;
    pup: boolean;
    x: number;
    y: number;
    aimX: number;
    aimY: number;
    hittable: boolean;
  }[];
  meerkatLog: string[];
  /** v1.8 (D-050): the day's tin cans (null: no fence) — the fence's plane, each can on screen
   *  (design px; r = hit radius), the hunt's can events in order ("knock:1", "juggle:2",
   *  "landed", "weg:39"), at most 200, and ms spent drawing them (summed, with the frames). */
  cans: {
    plane: string;
    spots: {
      id: number;
      x: number;
      y: number;
      r: number;
      state: string;
      chain: number;
      marks: number;
    }[];
    bestChain: number;
  } | null;
  canLog: string[];
  canMs: number;
  /** D-051: the potjie (null: no potjie on this map): HD art showing, lid off, rattles and clangs
   *  so far, wisps drawn now, and the loose lid's pose (prop px; null before the HD art). */
  potjie: {
    hd: boolean;
    lidOff: boolean;
    /** The lid's flight and bounce are over: it lies still beside the pot. */
    lidSettled: boolean;
    rattles: number;
    clangs: number;
    wisps: number;
    lid: { x: number; y: number; rot: number } | null;
  } | null;
  /** D-051: props with an HD texture: their origin on screen (design px), HD showing yet. */
  hdProps: { id: string; hd: boolean; x: number; y: number }[];
  /** D-054: every far-animal part drawn: its herd, animal index, part, on-screen box (design px),
   *  its frame's cut (texture px) and pivot, and its texture's source size. */
  fauna: FaunaProbe[];
  /**
   * D-053: Standard or HD. `card`: the loading screen asked this launch (`pick`: its
   * recommendation); `loading`: the area's HD pack behind the loading screen; `bounds`: on-screen
   * boxes of sampled scenery and HUD images (design px, rounded), the same with Standard and HD;
   * `hdTextures`: HD textures in the texture manager; `epoch`: the hunt manifest's hdEpoch.
   */
  graphics: {
    mode: 'standard' | 'hd';
    setting: 'ask' | 'standard' | 'hd';
    card: boolean;
    pick: 'standard' | 'hd' | null;
    weak: boolean;
    cardMb: number;
    loading: 'none' | 'loading' | 'done' | 'skipped';
    bounds: { key: string; x: number; y: number; w: number; h: number; hd: boolean }[];
    hdTextures: number;
    epoch: number;
  };
  /** D-051: the bark keys secret banners showed this page, in order. */
  secretBarks: string[];
  /** v1.7c (D-047): the fruit view (null until its chunk is in, or a map without fruit): fruit
   *  placed, pellet hits and drops this hunt, fruit swinging now, and the fruit on screen. */
  fruit: {
    count: number;
    hits: number;
    drops: number;
    swinging: number;
    spots: FruitHookSpot[];
  } | null;
  /** v1.7 (perf): ms spent drawing the meerkat colonies, summed with the frames counted. */
  meerkatMs: number;
  /** v1.6b (D-043): reload power-ups on the HUD — the chips' icon textures (null = none), the
   *  lightning glints on the belt now, Oupa's hand on the belt, and auto reloads this page. */
  reloadFx: { chipIcons: (string | null)[]; bolts: number; oupaHand: boolean; autoReloads: number };
  /** v1.4 B: the Namibië mirage is on in this hunt. */
  mirage: boolean;
  /** v1.4 B (perf): total ms spent drawing the weavers and the mirage, and the frames counted. */
  sceneryMs: number;
  sceneryFrames: number;
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
  /** D-048: the title's special-day badge (null on an ordinary day). */
  feesdag: { id: string; badge: string } | null;
  /** D-048: the Spookjag's things on screen (design px) during a special day's hunt. */
  spook: {
    id: string;
    lanternsLit: number;
    lanternsTotal: number;
    things: { id: number; kind: string; x: number; y: number; dark: boolean }[];
    final: boolean;
    /** Witch hats drawn now (screen design px). */
    hats: { x: number; y: number }[];
  } | null;
  /** D-048: the feesdae group's sheet: delivered ('final') or the code-drawn stand-in. */
  feesdaeArt: 'final' | 'standin' | null;
  /** M7: challenge of the hunt running or just ended, and the card / tally lines shown. */
  challenge: { seed: number; mode: string; score: number; contentChanged: boolean } | null;
  /** M7: one-line notice on the title (a bad challenge link), the HUD tag, tally lines. */
  notice: string | null;
  hudTag: string | null;
  tally: {
    tag: string | null;
    compare: string | null;
    news: string | null;
    share: boolean;
    /** D-048: the special day's frame on the slate (null on an ordinary tally). */
    frame?: string | null;
    title?: string;
  } | null;
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
  /** D-035 review: weapon ids whose picture the Skiet-Skuur's Guns tab shows. */
  shedIcons?: string[];
  /** v1.5 (D-041): the gun names on the Guns tab's cards, as drawn (text language, toggle). */
  shedNames?: string[];
  /** v1.7b (D-046): the pickup card on screen (null = none): what it says and where. */
  pickupCard?: {
    id: string;
    first: boolean;
    name: string;
    line: string;
    rect: { x: number; y: number; w: number; h: number };
    /** Where the card's text ends (design px): never below the card. */
    textBottom: number;
    lineScale: number;
    /** Faded to 0.3 while the crosshair is over it (or near). */
    alpha: number;
  } | null;
  /** v1.7b: the HUD chips as drawn: name, countdown ("8 s" / "×6"), ending (blinking), icon. */
  chips?: { id: string; label: string; time: string; ending: boolean; icon: string | null }[];
  /** v1.7b: power-up looks on now (Boeretroos edges and sound rate, Chilli's ∞ on the belt,
   *  Bush Buckshot's ring, Chilli's sparks made so far). */
  powerupLooks?: {
    slowTint: boolean;
    soundRate: number;
    infinity: boolean;
    spreadRing?: boolean;
    sparks?: number;
  };
  /** v1.7b: the tally's "Power-ups used" row (ids, in order of first use). */
  tallyPowerups?: string[];
  /** v1.7b (D-046): the Gun Shed's Power-ups tab: each card as drawn, and the list's scroll. */
  shedPowerups?: {
    cards: { id: string; name: string; effect: string; found: boolean; icon: boolean }[];
    scroll: number;
    maxScroll: number;
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
  /** v1.4 (#56): turn the zoomed view's culling on or off (pictures must match either way). */
  scopeCull(on: boolean): void;
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
  /**
   * D-031: the manifest whose textures are on the GPU now (null before the first install). A
   * hunt in another biome releases its scenery first (AssetManifest.release), so the low tier
   * holds one biome's layers and props at a time.
   */
  installedManifest: AssetManifest | null;
  /** M9: the biome's art chunk is loaded (manifestFor may be called). */
  biomeReady(id: string): boolean;
  /** M9: loads a biome's art chunk (lazy biome bundles); false if it failed. */
  loadBiome(id: string): Promise<boolean>;
  /**
   * v1.6 (D-042): waits for a loaded biome's late groups and retries (bounded) the Ver-group
   * files a scoped hunt or the Skietbaan needs (`need`); false if they still failed.
   */
  loadLateArt(id: string, need: LateNeed): Promise<boolean>;
  /** D-053: Standard or HD art, and each area's HD pack. */
  readonly graphics: GraphicsControl;
  /** M8: the biome of the hunt on screen (the home biome between hunts). */
  huntBiome: Biome;
  readonly audio: AudioDirector;
  /** v1.0.1 (D-028 §3): Oupa's barks (one per page: the gap spans hunts and the tally). */
  readonly barks: BarkDirector;
  /** UTC day number now (the Daily's clock; e2e ?today= fixes it). */
  readonly today: () => number;
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
  /** e2e/dev only (?fauna=before, D-054 screenshots): the v1.9.0 far animals, one image a herd. */
  readonly faunaBefore: boolean;
  /** e2e/dev only (?faunaDebug=1): every far-animal part's frame outlined (assembly checks). */
  readonly faunaDebug: boolean;
  /** e2e/dev only: ?omen=1 / ?omen=0 overrides the mode's omen. */
  readonly omen: boolean | undefined;
  /** e2e/dev only: ?biome= plays Classic hunts in another playable biome (M8). */
  readonly classicBiome: string | undefined;
  /** v1.4 B (D-039): the area Classic plays now (the title's area picker; home by default). */
  classicArea(): string;
  /** Picks the Classic area (saved; ignored if it is locked or not playable here). */
  setClassicArea(id: string): void;
  /** Stores area packs the save has earned (Die Verste reached); returns the new ones. */
  grantAreas(): string[];
  /** e2e/dev only (v1.2): ?layout=thu and ?bonus=verder play Classic hunts on that map. */
  readonly classicLayout: string | undefined;
  readonly classicBonus: string | undefined;
  /** v1.2x admin page (D-034): Classic and Daily hunts play this gun (undefined = the loadout). */
  readonly weaponOverride: string | undefined;
  /** v1.3: the admin page's sight for a rifle (undefined = the Skiet-Skuur's). */
  readonly sightOverride: string | undefined;
  /** v1.2x (D-034): the playtest admin page (`?admin=1`, web builds), or null. */
  readonly admin: AdminContext | null;
  /** Device hint before the first touch: coarse pointer → touch hints on the start card. */
  readonly coarsePointer: boolean;
  readonly reducedMotion: boolean;
  /** Portrait (rotate card shown), tab hidden or the pause menu: hunts pause. */
  paused(): boolean;
  debug: boolean;
  readonly hook: TestHook | null;
}

/** D-054 (test hook): one far-animal part as drawn. */
export interface FaunaProbe {
  readonly herd: string;
  readonly animal: number;
  readonly part: string;
  readonly frame: string;
  readonly box: { x: number; y: number; w: number; h: number };
  readonly cut: { x: number; y: number; w: number; h: number };
  readonly origin: { x: number; y: number };
  readonly scale: { x: number; y: number };
  readonly angle: number;
  readonly source: { w: number; h: number };
}
