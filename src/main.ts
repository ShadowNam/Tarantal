import { BONUS_MAP_IDS, WEEKDAY_IDS, type Biome } from './content/schemas';
// Boot: save (settings + progress) → i18n → content (validated) → platform adapter →
// placeholder assets → Phaser game with the flexible-width layout (Tech §5). Opens on the title
// over the live panorama: one giant START HUNT, so the first shot is seconds away (GDD §16).
import { AreaScene } from './game/scenes/AreaScene';
import { classicAreaId, newlyUnlockedAreas } from './meta/areas';
import * as Phaser from 'phaser';
import { contentHash } from './content/hash';
import { DailyFlow } from './game/daily/DailyFlow';
import { loadGameContent } from './content/loadBrowser';
import { AudioDirector, browserAudioEnv } from './game/audio/AudioDirector';
import { BarkDirector } from './game/audio/barks';
import {
  faunaAsDrawn,
  isPlaneScalePreset,
  withDoppies,
  withEarlySpook,
  withNoBirds,
  withPlaneScales,
  withQuotaMul,
  withTestCrate,
} from './game/devContent';
import type { GameContext, TestHook, TestTools } from './game/GameContext';
import {
  designSize,
  designSizeFor,
  isPortrait,
  renderSizeFor,
  safeAreaInDesignPx,
  setView,
  type Insets,
} from './game/layout';
import { fitCamera } from './game/view/fitCamera';
import { loadFonts } from './game/ui/fonts';
import { FlashLimiter } from './game/view/flashLimit';
import { setTextLook } from './game/ui/textLook';
import { neededLateMissing, type AssetManifest, type LateNeed } from './game/assets/AssetManifest';
import {
  ABSENT,
  absentIndexAccepted,
  failedAssetFiles,
  fetchAssetIndex,
  fetchBytesUncached,
} from './game/assets/finalLoader';
import { showArtError, showUpdateBar } from './game/assets/artGate';
import { buildInfo, buildLine } from './game/ui/buildStamp';
import { buildIdOf } from './platform/swUpdate';
import { VoicePacks } from './game/audio/voicePack';
import {
  biomeArtReady,
  createPlaceholderManifest,
  loadBiomeArt,
  placeholderBiomes,
} from './game/placeholder/ProceduralAssetFactory';
import { applyPrefs, computePrefs, type PrefInputs } from './game/prefs';
import { oupaSpeaks } from './game/audio/oupaMode';
import { ChallengeScene } from './game/scenes/ChallengeScene';
import { HudScene } from './game/scenes/HudScene';
import { HuntScene } from './game/scenes/HuntScene';
import { PauseScene } from './game/scenes/PauseScene';
import { RunScene } from './game/scenes/RunScene';
import { RunFlow } from './game/run/RunFlow';
import { SettingsScene } from './game/scenes/SettingsScene';
import { ShedScene } from './game/scenes/ShedScene';
import { TallyScene } from './game/scenes/TallyScene';
import { TitleScene } from './game/scenes/TitleScene';
import { DomChrome } from './game/ui/DomChrome';
import {
  fill,
  isI18nKey,
  pickLanguage,
  setAfrikaansNames,
  setLanguage,
  t,
  tOr,
  voiceLanguageFor,
  type Language,
} from './i18n/i18n';
import { decodeChallenge, type ChallengeDecode } from './meta/challenge';
import { dailySeed } from './meta/daily';
import { dayNumber, parseDayKey } from './meta/dailyCalendar';
import { SaveStore } from './meta/save';
import type { Settings } from './meta/saveSchema';
import { setStorageNamespace, storageStatus } from './meta/storage';
import { installErrorHook } from './platform/errors';
import { LocalPlatform } from './platform/local';
import { adminPageInBuild, createPlatform, currentPlatformId } from './platform/platform';
import {
  ADMIN_NAMESPACE,
  adminEntries,
  loadAdminSave,
  storeAdminSave,
  type AdminSave,
} from './meta/admin';
import type { AdminContext } from './game/admin/AdminContext';
import { adminHuntSetup, type AdminHuntSetup } from './game/admin/adminPlay';
import { AdminScene } from './game/scenes/AdminScene';
import { AdBreaks } from './game/ads/AdBreaks';
import { PrivacyScene } from './game/scenes/PrivacyScene';
import {
  feesdagOverride as feesdagOverrideFor,
  officialResultsAllowed,
  testHookPolicy,
} from './game/testHooks';
import { CAPTURE_NAMESPACE, CaptureState, captureAllowed, captureSave } from './game/capture';
import { FrameBenchmark } from './game/quality/FrameBenchmark';
import { benchmarkTier, type DeviceHints } from './game/quality/QualityManager';
import { setMenuInputGate } from './game/ui/menu';
import { decodeInputLogText } from './sim/replay/inputLog';
import { runReplay } from './sim/replay/verify';

declare global {
  interface Window {
    /** Read by Playwright tests; dev/test builds and ?e2e=1 only. */
    __TM__?: TestHook;
    __TM_TOOLS__?: TestTools;
  }
}

const params = new URLSearchParams(window.location.search);
// M9 (D-024 known limit): portal builds carry no test hooks (unless built with VITE_TEST_HOOKS=1
// for their e2e runs), and ?e2e runs keep their own save (tm.e2e.*).
const hookPolicy = testHookPolicy({
  dev: import.meta.env.DEV,
  mode: import.meta.env.MODE,
  platform: currentPlatformId(),
  testHooksFlag: import.meta.env.VITE_TEST_HOOKS === '1',
  e2eParam: params.has('e2e'),
});
// A literal after Vite's replacement: in a portal build without VITE_TEST_HOOKS it is `false`,
// so the minifier drops the hook code paths altogether.
const hooksInBuild =
  import.meta.env.VITE_PLATFORM === undefined ||
  import.meta.env.VITE_PLATFORM === 'web' ||
  import.meta.env.VITE_TEST_HOOKS === '1';
const testHooks = hooksInBuild && hookPolicy.enabled;
// v1.0.1 (D-028): `?e2e` on a public build (no VITE_TEST_HOOKS) is unranked, like capture mode.
const officialResults = officialResultsAllowed({
  dev: import.meta.env.DEV,
  mode: import.meta.env.MODE,
  platform: currentPlatformId(),
  testHooksFlag: import.meta.env.VITE_TEST_HOOKS === '1',
  e2eParam: params.has('e2e'),
});
// M10 marketing capture mode (?capture=1): where the hooks may be, on its own save (D-027).
const capture =
  hooksInBuild &&
  captureAllowed({
    platform: currentPlatformId(),
    testHooksFlag: import.meta.env.VITE_TEST_HOOKS === '1',
    captureParam: params.get('capture') === '1',
  });
// v1.2x (D-034): the playtest admin page (`?admin=1`), where the PlatformAdapter allows it (web
// builds). It plays on its own save (`tm.admin.*`, or `tm.e2e.admin.*`), so admin hunts never
// touch the player's bests, unlocks or progress.
const adminOn = params.get('admin') === '1' && adminPageInBuild();
if (adminOn) setStorageNamespace((hookPolicy.namespace ?? '') + ADMIN_NAMESPACE);
else if (hookPolicy.namespace !== null) setStorageNamespace(hookPolicy.namespace);
else if (capture) setStorageNamespace(CAPTURE_NAMESPACE);

const save = new SaveStore();
// e2e/dev only: ?ftue=0 starts as a returning player (older specs test Classic hunts).
// M10 capture mode: no tutorial on the capture save (its prompts would be hidden).
if (capture && !save.data.ftue.done) save.update((d) => captureSave(d));
if (adminOn && !save.data.ftue.done)
  save.update((d) => ({ ...d, ftue: { done: true, skipped: true, step: 'admin' } }));
if (testHooks && params.get('ftue') === '0' && !save.data.ftue.done) {
  save.update((d) => ({ ...d, ftue: { done: true, skipped: true, step: 'param' } }));
}

/** User-activation events that may start Web Audio (v1.5: the first one unlocks it). */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/** The text language a settings object picks (Auto follows the browser). */
function textLanguageOf(s: Settings): Language {
  return s.language === 'auto' ? pickLanguage(navigator.languages) : s.language;
}

function applyLanguage(): void {
  const lang = textLanguageOf(save.data.settings);
  setLanguage(lang);
  setAfrikaansNames(save.data.settings.afrikaansNames);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset['i18n'];
    if (key !== undefined && isI18nKey(key)) el.textContent = t(key);
    else console.error(`Unknown i18n key in index.html: ${String(key)}`);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const key = el.dataset['i18nLabel'];
    if (key !== undefined && isI18nKey(key)) el.setAttribute('aria-label', t(key));
  }
}
applyLanguage();

function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function cssSafeArea(): Insets {
  const probe = document.getElementById('safe-area-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const s = getComputedStyle(probe);
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}

/** ?seed=42 fixes every hunt's seed (debugging); otherwise a fresh u32 per hunt. */
function seedSource(): () => number {
  const adminSeed = adminSetup?.seed;
  if (adminSeed !== undefined) return () => adminSeed;
  const fixed = Number(params.get('seed'));
  if (params.has('seed') && Number.isInteger(fixed) && fixed >= 0) return () => fixed >>> 0;
  // Capture mode replays the same hunt every time (trailers, store shots).
  if (capture) return () => feel.capture.seed;
  return () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** e2e/dev only: ?holdAt=300 stops every hunt's sim at that tick (M10 visual baselines). */
function holdAtParam(): number | undefined {
  if (!testHooks || !params.has('holdAt')) return undefined;
  const v = Number(params.get('holdAt'));
  return Number.isInteger(v) && v > 0 ? v : undefined;
}

/** e2e/dev only: ?huntSeconds=15 shortens hunts (must be a positive multiple of 0.5). */
function huntSecondsParam(): number | undefined {
  if (!testHooks || !params.has('huntSeconds')) return undefined;
  const v = Number(params.get('huntSeconds'));
  return v > 0 && Number.isInteger(v * 2) ? v : undefined;
}

/** e2e/dev only: ?omen=1 turns the biome weather on (or ?omen=0 off) for Classic hunts. */
function omenParam(): boolean | undefined {
  if (!testHooks || !params.has('omen')) return undefined;
  return params.get('omen') === '1';
}

/** e2e/dev only: ?biome=bushveld-winter plays Classic hunts in that biome (M8). */
function biomeParam(): string | undefined {
  if (!testHooks) return undefined;
  return params.get('biome') ?? undefined;
}

/** e2e/dev only (v1.2): ?layout=thu / ?bonus=verder play Classic hunts on that map. */
function layoutParam(): string | undefined {
  const v = testHooks ? params.get('layout') : null;
  // 'none' plays the plain biome (the "before" of the v1.2 previews).
  return v !== null && (v === 'none' || (WEEKDAY_IDS as readonly string[]).includes(v))
    ? v
    : undefined;
}
function bonusParam(): string | undefined {
  const v = testHooks ? params.get('bonus') : null;
  return v !== null && (BONUS_MAP_IDS as readonly string[]).includes(v) ? v : undefined;
}

/**
 * D-048: `?feesdag=halloween` (or `none`) makes today's Daily that special day — dev and e2e
 * builds and the web admin page only, never a portal build. The real date logic is untouched.
 */
function feesdagOverride(): string | null {
  return feesdagOverrideFor({
    buildPlatform: import.meta.env.VITE_PLATFORM,
    testHooks,
    admin: adminSetup,
    param: params.get('feesdag'),
  });
}

/** e2e/dev only: ?today=YYYY-MM-DD fixes the UTC day of the Daily Hunt. */
function todaySource(): () => number {
  const adminDay = adminSetup?.today;
  if (adminDay !== undefined) return () => adminDay;
  const fixed = testHooks ? parseDayKey(params.get('today') ?? '') : null;
  return fixed === null ? () => dayNumber(Date.now()) : () => fixed;
}

const hook: TestHook = {
  ready: false,
  designWidth: 0,
  designHeight: 0,
  renderScale: 1,
  portrait: false,
  scene: 'start',
  tick: 0,
  ticksLeft: 0,
  score: 0,
  shells: 0,
  biome: '',
  map: null,
  verder: false,
  bonusOpen: [],
  bonusNeedsScope: [],
  verBirds: [],
  farBirds: [],
  verderUnlocked: null,
  glare: null,
  omen: false,
  rain: false,
  lightning: false,
  magazine: 0,
  reloading: false,
  stones: 0,
  ammo: [],
  crosshair: { weapon: '', extent: 0, visible: false, x: 0, y: 0 },
  zoom: { z: 1, raise: 0, reticleX: 0, reticleY: 0, sight: null, fill: 0 },
  shots: 0,
  over: false,
  inputKind: null,
  menu: null,
  admin: null,
  range: null,
  capture: null,
  fontsReady: false,
  focus: null,
  paused: false,
  mode: null,
  ftue: { active: false, steps: [], prompts: [] },
  analytics: [],
  save: { status: save.status, storage: storageStatus() },
  contextRestores: 0,
  cameraX: 0,
  birds: 0,
  gadgetCharges: 0,
  gadgetUses: 0,
  flocks: [],
  flockSpots: [],
  pops: { shown: 0, created: 0 },
  bark: null,
  barks: [],
  flockLog: [],
  result: null,
  firstShotAtMs: null,
  frameTimes: [],
  cpuFrameMs: [],
  cpuFrameScoped: [],
  cpuFrameOpen: [],
  frameScoped: [],
  frameOpen: [],
  simFrameMs: [],
  simFrameSteps: [],
  replay: null,
  hunts: 0,
  assets: { problem: null, byBiome: {}, recorded: [], failed: [] },
  music: null,
  masterGain: null,
  missingTextures: [],
  textureBytes: 0,
  gunAtlases: [],
  boot: {},
  rects: {},
  safe: null,
  secretSpots: [],
  crateSpots: [],
  specialBirds: [],
  weapon: '',
  powerups: [],
  wind: null,
  durationTicks: 0,
  areas: [],
  classicArea: '',
  weavers: 0,
  weaverBursts: 0,
  meerkats: [],
  meerkatLog: [],
  cans: null,
  canLog: [],
  canMs: 0,
  potjie: null,
  fruit: null,
  meerkatMs: 0,
  reloadFx: { chipIcons: [], bolts: 0, oupaHand: false, autoReloads: 0 },
  mirage: false,
  sceneryMs: 0,
  sceneryFrames: 0,
  run: null,
  seasonHud: null,
  huntSeed: null,
  daily: null,
  feesdag: null,
  spook: null,
  feesdaeArt: null,
  challenge: null,
  notice: null,
  hudTag: null,
  tally: null,
  lastShare: null,
  platform: currentPlatformId(),
  adPending: false,
  huntRequests: 0,
  ads: null,
  audioMuted: false,
  voice: { language: '', pack: 'none', played: [], oupa: true },
  captions: [],
  quality: { tier: '', bench: null, benchRan: false, layers: 0, filters: [] },
  errors: [],
};
if (testHooks) window.__TM__ = hook;

hook.boot['script'] = performance.now();
// v1.6 (D-042): which build this is, first thing in the console.
console.info(`[build] ${buildLine(buildInfo())}`);
const loaded = loadGameContent();
// e2e/dev only (D-049 "before" screenshots): ?planeScale=v17 — the old plane scales and far animals.
const planeScaleParam = testHooks ? params.get('planeScale') : null;
const planePreset = isPlaneScalePreset(planeScaleParam) ? planeScaleParam : null;
const feel =
  planePreset === null
    ? loaded.feel
    : {
        ...loaded.feel,
        perspective: { faunaScale: faunaAsDrawn(loaded.feel.perspective.faunaScale) },
      };
// M10: the final-asset index, fetched while the platform SDK starts (absent = all placeholders).
const indexLoad = fetchAssetIndex(feel.assets.indexTimeoutMs);
const crateParam = testHooks ? params.get('crate') : null;
const shipped = planePreset === null ? loaded.bundle : withPlaneScales(loaded.bundle, planePreset);
const withCrate = crateParam === null ? shipped : withTestCrate(shipped, crateParam);
// e2e/dev only: ?quotaMul=0 makes every Season Run quota reachable (short e2e runs).
const quotaMul = testHooks && params.has('quotaMul') ? Number(params.get('quotaMul')) : NaN;
const withQuota =
  Number.isFinite(quotaMul) && quotaMul >= 0 ? withQuotaMul(withCrate, quotaMul) : withCrate;
// e2e/dev only: ?doppies=1 — a run with (almost) no Doppies, to show Padstal offers it can't buy.
const doppiesParam = testHooks && params.has('doppies') ? Number(params.get('doppies')) : NaN;
const withDop =
  Number.isInteger(doppiesParam) && doppiesParam >= 0
    ? withDoppies(withQuota, doppiesParam)
    : withQuota;
// e2e/dev only (v1.7 meerkat previews): ?birds=0 — no birds or world events, colonies only.
const noBirds = testHooks && params.get('birds') === '0' ? withNoBirds(withDop) : withDop;
// e2e/dev only (D-048): ?spook=early brings the special day's owls and bats in early.
const devBundle = testHooks && params.get('spook') === 'early' ? withEarlySpook(noBirds) : noBirds;
// D-034: `?admin=1&play=1` plays the hunt the admin page stored (its content changes too).
let adminSave: AdminSave | null = adminOn ? loadAdminSave() : null;
const adminList = adminOn ? adminEntries(devBundle, placeholderBiomes()) : [];
const adminPlay = adminSave?.play ?? null;
const adminEntry =
  params.get('play') === '1' && adminPlay !== null
    ? adminList.find((e) => e.id === adminPlay.entry)
    : undefined;
const adminSetup: AdminHuntSetup | null =
  adminEntry === undefined || adminPlay === null
    ? null
    : adminHuntSetup(adminEntry, adminPlay.options, devBundle);
const bundle = adminSetup?.content ?? devBundle;
hook.boot['content'] = performance.now();
const biomeId = bundle.modes.modes.classic.biome;
const foundBiome = bundle.biomes.find((b) => b.id === biomeId);
if (foundBiome === undefined) throw new Error(`classic biome ${biomeId} missing`);
const biome: Biome = foundBiome;

const initialDesign = designSizeFor(viewport().width, viewport().height);
let portrait = isPortrait(viewport().width, viewport().height);
let contextLost = false;

const platform = createPlatform({
  serviceWorker: import.meta.env.PROD,
  // v1.6 (D-042): the worker names its build; the update bar shows only when it differs.
  buildId: buildIdOf(buildInfo().sha, buildInfo().time),
  log: params.get('debug') === '1',
  adTimeoutMs: feel.platform.adTimeoutMs,
  sdkTimeoutMs: feel.platform.sdkTimeoutMs,
});
// Crash/error hook (M9): reports carry no personal data (errors.ts) and go through the adapter.
installErrorHook(
  window,
  {
    maxReports: feel.platform.maxErrorReports,
    stackFrames: feel.platform.errorStackFrames,
    messageChars: feel.platform.errorMessageChars,
  },
  (r) => {
    platform.reportError(r);
  },
);
if (testHooks && platform instanceof LocalPlatform) {
  hook.analytics = platform.records;
  hook.errors = platform.errors;
}
platform.loadingProgress(0);
// Portals want their SDK ready before the game starts; it is bounded by sdkTimeoutMs, and a
// blocked SDK only means no ads (the adapters never reject).
// The rest of boot waits on the platform SDK, the asset index and the fonts. It runs in an async
// function rather than with top-level await: Rolldown merges chunks a lazy import shares with the
// entry back into it only when no module uses top-level await (v1.3x, D-037: the Skietbaan's lazy
// chunk would otherwise split the first download in two).
async function boot(): Promise<void> {
  hook.boot['platformStart'] = performance.now();
  await platform.init();
  hook.boot['platform'] = performance.now();
  const ads = new AdBreaks(platform);
  hook.ads = ads.counts;
  // Poki: no input reaches the game while an ad covers it (the hunt never runs during one).
  // From the request on, not only once the ad shows (a tap during the request must not start a
  // hunt under it, D-026).
  setMenuInputGate(() => platform.isAdBusy() || ads.busy);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const device: DeviceHints = {
    coarsePointer,
    cores: navigator.hardwareConcurrency || 0,
    // Chrome only; Safari and Firefox leave it out (0 = unknown).
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
  };
  const prefInputs = (): PrefInputs => ({
    feel,
    device,
    reducedMotion,
    bench: save.data.device.benchTier,
  });
  const prefs = computePrefs(save.data.settings, prefInputs());
  const prefListeners = new Set<() => void>();
  let relayout: (() => void) | null = null;
  /** Safe-area insets in design px; cleared by applyLayout (resize, rotation, tier change). */
  let safeCache: Insets | null = null;
  const applyTextLook = (): void => {
    setTextLook(prefs.textScale, prefs.highContrast, feel.accessibility.contrastStroke);
  };
  applyTextLook();
  const prefsChanged = (): void => {
    hook.quality.tier = prefs.tier;
    applyTextLook();
    // The render scale may have changed with the tier (applyLayout exists once the game does).
    relayout?.();
    for (const fn of prefListeners) fn();
  };
  hook.quality.tier = prefs.tier;
  // M9 title benchmark (Tech §5): 90 frames on the title once per page; "auto" follows the result
  // (saved per device, so the next visit starts on it). e2e runs skip it unless ?bench=1, so the
  // specs keep a fixed tier.
  const benchCfg = feel.quality.benchmark;
  const benchmark =
    !testHooks || params.get('bench') === '1'
      ? new FrameBenchmark(benchCfg.warmupFrames + benchCfg.frames, (frames) => {
          const r = benchmarkTier(frames, feel, device);
          hook.quality.benchRan = true;
          if (r === null) return;
          hook.quality.bench = r;
          platform.analytics('perf_sample', { kind: 'benchmark', tier: r.tier, avgMs: r.avgMs });
          save.update((d) => ({ ...d, device: { benchTier: r.tier, benchAvgMs: r.avgMs } }));
        })
      : null;
  let titleUp = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') benchmark?.pause();
    else if (titleUp) benchmark?.resume();
  });
  const audio = new AudioDirector(
    feel.audio,
    browserAudioEnv(feel.assets.fileTimeoutMs),
    Object.fromEntries(Object.entries(feel.guns.weapons).map(([id, w]) => [id, w.sfx])),
  );
  hook.assets.recorded = audio.recorded;
  // v1.5 (D-041): the first gesture anywhere (title, menus, Settings, the Skiet-Skuur) unlocks
  // audio, so Oupa's voice pack starts loading then and is usually in before the first hunt's
  // greeting. Scenes still unlock on their own taps too; unlock() is idempotent. These are the
  // events browsers accept as a user activation for audio (iOS: touchend and click).
  const firstGesture = (): void => {
    audio.unlock();
    if (!audio.running) return;
    for (const type of GESTURES) document.removeEventListener(type, firstGesture, true);
  };
  for (const type of GESTURES) document.addEventListener(type, firstGesture, true);
  // Live values (read through the hook in page.evaluate).
  Object.defineProperties(hook, {
    music: { enumerable: true, get: () => audio.music },
    masterGain: { enumerable: true, get: () => audio.masterGain },
  });
  const applyAudio = (s: Settings): void => {
    audio.setVolumes({
      master: s.masterVolume,
      sfx: s.sfxVolume,
      music: s.musicVolume,
      voice: s.voiceVolume,
    });
    audio.setOupaVoice(oupaSpeaks(s.oupa));
    hook.voice.oupa = audio.oupaVoiceOn;
    applyVoice?.(s);
  };
  /** v1.5 (D-041): Oupa's voice pack (set once the asset index is known, below). */
  let applyVoice: ((s: Settings) => void) | null = null;
  applyAudio(save.data.settings);
  platform.onAdChange((playing) => {
    audio.setMuted('ad', playing);
    hook.audioMuted = audio.muted;
  });
  // CrazyGames settings.muteAudio wins over the in-game volume.
  platform.onPortalMute((muted) => {
    audio.setMuted('portal', muted);
    hook.audioMuted = audio.muted;
  });
  let lastSettings = save.data.settings;
  let lastDevice = save.data.device;
  save.onChange((d) => {
    if (d.device !== lastDevice) {
      lastDevice = d.device;
      applyPrefs(prefs, d.settings, prefInputs());
      prefsChanged();
    }
    if (d.settings === lastSettings) return;
    const changed = (Object.keys(d.settings) as (keyof Settings)[]).filter(
      (k) => d.settings[k] !== lastSettings[k],
    );
    lastSettings = d.settings;
    applyPrefs(prefs, d.settings, prefInputs());
    prefsChanged();
    applyAudio(d.settings);
    for (const k of changed)
      platform.analytics('settings_change', { setting: k, value: d.settings[k] });
  });
  // Tech §9: save when the tab is hidden or closed (the store also writes on every change).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save.flush();
  });
  window.addEventListener('pagehide', () => {
    save.flush();
  });
  const chrome = new DomChrome(platform, save);
  if (capture) chrome.hideInstallBanner();

  const hash = contentHash(bundle);
  // Biomes this build draws (M8: every biome with placeholder art). Their manifests are built on
  // first use; only the home biome's is made at boot.
  const drawable = new Set(placeholderBiomes());
  const playableBiomes = bundle.biomes.filter((b) => drawable.has(b.id)).map((b) => b.id);
  const manifests = new Map<string, AssetManifest>();
  const manifestFor = (b: Biome): AssetManifest => {
    let m = manifests.get(b.id);
    if (m === undefined) {
      m = createPlaceholderManifest(bundle, b, feel.guns.ammo);
      manifests.set(b.id, m);
    }
    return m;
  };
  // M10: final files for a biome's manifest, loaded once (each failure keeps that placeholder).
  // v1.6 (D-042): placeholders only on purpose (dev and test builds, ?art=placeholder); otherwise a
  // hunt or the Skietbaan starts only when its delivered art is in (ensureArt below).
  const placeholderArt = (testHooks || import.meta.env.DEV) && params.get('art') === 'placeholder';
  const firstIndex = await indexLoad;
  let assetIndex = placeholderArt ? null : firstIndex.index;
  let indexProblem = placeholderArt ? `${ABSENT} (?art=placeholder)` : firstIndex.problem;
  hook.assets.problem = indexProblem;
  // v1.5 (D-041): the voice language (its own setting; "same" follows the text, Dutch → af). Its
  // pack loads lazily after the first gesture, never with the voice volume at 0.
  const voicePacks = new VoicePacks(audio, assetIndex, {
    // Uncached: a voice language left behind keeps no bytes (finalLoader's loadBytes caches).
    loadBytes: (path) => fetchBytesUncached(path, feel.assets.fileTimeoutMs),
    onState: (lang, state) => {
      if (hook.voice.language === lang) hook.voice.pack = state;
    },
  });
  audio.onMissingLine(() => {
    voicePacks.retry();
  });
  hook.voice.played = audio.voicePlayed;
  applyVoice = (s: Settings): void => {
    const lang = voiceLanguageFor(s.voiceLanguage, textLanguageOf(s));
    if (hook.voice.language !== lang) hook.voice.pack = 'none';
    hook.voice.language = lang;
    // v1.7b (D-046): Oupa's comments "Text only"/"Off" don't stop the pack: the weavers, the frog
    // and the meerkats speak from it too (oupaMode.isOupaLine).
    voicePacks.use(lang, s.voiceVolume > 0 && s.masterVolume > 0);
  };
  applyVoice(save.data.settings);
  // v1.6 (D-042 review): an absent index is fine only on purpose or in a test build (dev, Vitest,
  // VITE_TEST_HOOKS=1 e2e builds); a production build ships one, so there it is retried below.
  const testBuild =
    import.meta.env.DEV ||
    import.meta.env.MODE === 'test' ||
    import.meta.env.VITE_TEST_HOOKS === '1';
  const absentOk = (): boolean => absentIndexAccepted(indexProblem, { placeholderArt, testBuild });
  if (indexProblem !== null && !absentOk())
    console.warn(`[assets] ${indexProblem}: retrying the asset index`);
  const finalLoads = new Map<string, Promise<void>>();
  const finalDone = new Set<string>();
  const loadFinalFor = (b: Biome): Promise<void> => {
    let p = finalLoads.get(b.id);
    if (p === undefined) {
      const m = manifestFor(b);
      p = (
        assetIndex === null
          ? Promise.resolve()
          : m.loadFinal(assetIndex, {
              atlasScale: prefs.tier === 'high' ? 2 : 1,
              timeoutMs: feel.assets.fileTimeoutMs,
              audioFormat: audio.fileFormat(),
              biome: b.id,
            })
      ).then(() => {
        finalDone.add(b.id);
        hook.assets.byBiome[b.id] = m.entries();
        // D-029: the late group arrives after boot; refresh the statuses when it has.
        void m.lateLoaded.then(() => {
          hook.assets.byBiome[b.id] = m.entries();
        });
        // Recordings arrive on their own (boot doesn't wait for them).
        void m.takeSounds().then((files) => {
          audio.addRecorded(files);
          hook.assets.byBiome[b.id] = m.entries();
        });
      });
      finalLoads.set(b.id, p);
    }
    return p;
  };
  /**
   * True when nothing delivered for `b` is missing (or no index, where that is accepted). With
   * `late`, also none of the Ver-group files that hunt needs (once the late groups settled).
   */
  const artOk = (b: Biome, late?: LateNeed): boolean =>
    assetIndex === null
      ? absentOk()
      : manifestFor(b).missingFinal.length === 0 &&
        (late === undefined || neededLateMissing(manifestFor(b).missingLate, late).length === 0);
  /**
   * v1.6 (D-042): loads a biome's delivered art, retrying (bounded) what failed. Each retry
   * fetches the index again first: after a deploy the old index names files the host no longer
   * has, and the new index names the new ones. With `late` (a scoped hunt, the Skietbaan), it
   * also waits for the late groups and retries the Ver-group files that hunt needs.
   */
  const ensureArt = async (b: Biome, late?: LateNeed): Promise<boolean> => {
    const tries = feel.assets.artRetries;
    for (let k = 0; k <= tries; k++) {
      if (k > 0) {
        finalLoads.delete(b.id);
        finalDone.delete(b.id);
        await new Promise((r) => window.setTimeout(r, 500 * k));
        const again = await fetchAssetIndex(feel.assets.indexTimeoutMs, 1);
        if (again.index !== null) {
          assetIndex = again.index;
          indexProblem = again.problem;
          hook.assets.problem = indexProblem;
        }
      }
      await loadFinalFor(b);
      if (late !== undefined) await manifestFor(b).lateLoaded;
      hook.assets.failed = failedAssetFiles();
      if (artOk(b, late)) return true;
    }
    const m = manifestFor(b);
    const missing = [
      ...m.missingFinal,
      ...(late === undefined ? [] : neededLateMissing(m.missingLate, late)),
    ];
    console.warn(
      `[assets] ${b.id}: art still missing after ${tries} retries: ${
        assetIndex === null ? (indexProblem ?? 'no index') : missing.map((x) => x.path).join(', ')
      }`,
    );
    return false;
  };
  // Never in capture mode (?capture=1): marketing shots show the game only.
  if (!capture)
    platform.onUpdateReady?.(() => {
      showUpdateBar(t('ui.update_ready'), t('ui.update_reload'), t('ui.update_dismiss'));
    });
  // The home biome's art before the title: a friendly message with Retry when it can't come.
  while (!(await ensureArt(biome))) {
    const area = tOr(biome.nameKey, biome.id);
    await showArtError(fill(t('ui.art_failed'), { area }), t('ui.retry'));
  }
  // A challenge link (Tech §12): decoded once, then removed from the address bar so a reload or a
  // bookmark doesn't show the card again.
  let pendingChallenge: ChallengeDecode | null = null;
  // Capture mode and `?e2e` on a public build (unranked) open no challenge links.
  const unranked = capture || !officialResults || adminOn;
  const challengeParam = unranked ? null : platform.launchParam('c');
  if (challengeParam !== null) {
    pendingChallenge = decodeChallenge(challengeParam, {
      content: bundle,
      playableBiomes,
      contentHash: hash,
      limits: loaded.daily.challenge,
    });
    platform.analytics('challenge_open', {
      ok: pendingChallenge.ok,
      ...(pendingChallenge.ok
        ? { mode: pendingChallenge.challenge.mode, contentChanged: pendingChallenge.contentChanged }
        : { reason: pendingChallenge.reason }),
    });
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('c');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // Some embeds forbid history changes; the card then shows again on reload, which is harmless.
    }
  }
  const shareBase = (): string => `${window.location.origin}${window.location.pathname}`;
  const today = todaySource();

  /** Reloads this page with `admin=1` (and `play=1` for a stored play), keeping other params. */
  const adminNavigate = (play: boolean): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('admin', '1');
    if (play) url.searchParams.set('play', '1');
    else url.searchParams.delete('play');
    window.location.assign(url.toString());
  };
  const admin: AdminContext | null = adminOn
    ? {
        entries: adminList,
        setup: adminSetup,
        // v1.6 (D-042): the build stamp (version · commit · build time) in the page and reports.
        build: buildLine(buildInfo()),
        load: () => (adminSave ??= loadAdminSave()),
        store: (s) => {
          adminSave = s;
          storeAdminSave(s);
        },
        back: () => {
          adminNavigate(false);
        },
        playStored: () => {
          adminNavigate(true);
        },
        played: (seed, gun) => {
          const id = adminSetup?.entry.id;
          if (id === undefined) return;
          const s = loadAdminSave();
          adminSave = { ...s, played: { ...s.played, [id]: { seed, gun } } };
          storeAdminSave(adminSave);
        },
      }
    : null;

  const ctx: GameContext = {
    content: bundle,
    contentHash: hash,
    feel,
    biome,
    manifest: manifestFor(biome),
    playableBiomes,
    manifestFor,
    installedManifest: null,
    biomeReady: (id) => {
      const b = bundle.biomes.find((x) => x.id === id);
      return biomeArtReady(id) && finalDone.has(id) && (b === undefined || artOk(b));
    },
    // The biome's placeholder art chunk, then its final files (if any were delivered).
    loadBiome: async (id) => {
      if (!(await loadBiomeArt(id))) return false;
      const b = bundle.biomes.find((x) => x.id === id);
      return b === undefined ? true : ensureArt(b);
    },
    loadLateArt: async (id, need) => {
      const b = bundle.biomes.find((x) => x.id === id);
      return b === undefined ? true : ensureArt(b, need);
    },
    huntBiome: biome,
    audio,
    flashes: new FlashLimiter(
      feel.accessibility.maxLargeFlashesPerSec,
      feel.accessibility.flashMergeMs,
    ),
    capture: capture ? new CaptureState(feel.capture, params.get('gun') !== '0') : null,
    save,
    notaboek: loaded.notaboek,
    dailyMeta: loaded.daily,
    barks: new BarkDirector(
      feel.barks,
      feel.audio.barkGapMs,
      new Set(
        bundle.powerups.powerups.filter((p) => p.effect.autoReload === true).map((p) => p.id),
      ),
    ),
    today,
    daily: new DailyFlow({
      content: bundle,
      contentHash: hash,
      meta: loaded.daily,
      save,
      platform,
      today,
      playableBiomes,
      shareBase,
      unranked,
      feesdagOverride: feesdagOverride(),
    }),
    pendingChallenge,
    platform,
    ads,
    run: new RunFlow(bundle, loaded.notaboek, save, platform),
    prefs,
    chrome,
    titleShown: (scene) => {
      if (benchmark === null || benchmark.done) return;
      titleUp = true;
      if (document.visibilityState === 'visible') benchmark.resume();
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        titleUp = false;
        benchmark.pause();
      });
    },
    onPrefsChange: (fn) => {
      prefListeners.add(fn);
      return () => prefListeners.delete(fn);
    },
    restartPage: () => {
      window.location.reload();
    },
    applyLanguage: () => {
      applyLanguage();
      chrome.relabel();
    },
    menuPaused: false,
    // getComputedStyle forces a style pass: computed once per layout, not every frame (M9 perf).
    safeArea: (): Insets =>
      (safeCache ??= safeAreaInDesignPx(cssSafeArea(), viewport(), designSize())),
    nextSeed: seedSource(),
    huntSeconds: adminSetup === null ? huntSecondsParam() : adminSetup.huntSeconds,
    holdAtTick: holdAtParam(),
    omen: adminSetup === null ? omenParam() : adminSetup.omen,
    classicBiome: adminSetup === null ? biomeParam() : adminSetup.classicBiome,
    classicArea: () => classicAreaId(bundle, save.data, playableBiomes, loaded.notaboek),
    setClassicArea: (id) => {
      save.update((d) => ({ ...d, areas: { ...d.areas, classic: id } }));
    },
    grantAreas: () => {
      const fresh = newlyUnlockedAreas(bundle, save.data, loaded.notaboek);
      if (fresh.length > 0)
        save.update((d) => ({
          ...d,
          areas: { ...d.areas, unlocked: [...d.areas.unlocked, ...fresh].sort() },
        }));
      return fresh;
    },
    classicLayout: adminSetup === null ? layoutParam() : adminSetup.classicLayout,
    classicBonus: adminSetup === null ? bonusParam() : adminSetup.classicBonus,
    weaponOverride: adminSetup?.weapon,
    sightOverride: adminSetup?.sight,
    admin,
    coarsePointer,
    reducedMotion,
    paused: () =>
      portrait || document.visibilityState === 'hidden' || ctx.menuPaused || contextLost,
    debug: params.get('debug') === '1',
    hook: testHooks ? hook : null,
  };

  // M10: Phaser draws text onto canvases once, so the self-hosted fonts must be ready first
  // (bounded by fontTimeoutMs; a slow or blocked font leaves the system font, as before).
  hook.fontsReady = await loadFonts(feel.assets.fontTimeoutMs);
  hook.boot['fonts'] = performance.now();
  setView(initialDesign, prefs.renderScale);
  const game: Phaser.Game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    backgroundColor: '#1b1410',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: renderSizeFor(initialDesign, prefs.renderScale).width,
      height: renderSizeFor(initialDesign, prefs.renderScale).height,
    },
    // All input is Pointer Events + keys in InputMapper (Tech §6); all audio is AudioDirector.
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    disableContextMenu: true,
    // M9: low tier renders without antialiasing (fixed at boot: the tier of the last benchmark).
    antialias: feel.quality.tiers[prefs.tier].antialias,
    banner: false,
    scene: [
      new HuntScene(ctx),
      new HudScene(ctx),
      new TitleScene(ctx),
      new ShedScene(ctx),
      new SettingsScene(ctx),
      new PauseScene(ctx),
      new TallyScene(ctx),
      new RunScene(ctx),
      new ChallengeScene(ctx),
      new PrivacyScene(ctx),
      new AreaScene(ctx),
      new AdminScene(ctx),
    ],
  });

  // WebGL context loss (backgrounding, memory pressure; Tech §9): Phaser 4 restores the context
  // and re-uploads textures; the hunt holds still meanwhile so the run is never lost.
  game.events.once(Phaser.Core.Events.READY, () => {
    const renderer = game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, () => {
      contextLost = true;
    });
    renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
      contextLost = false;
      hook.contextRestores++;
    });
  });

  if (testHooks) {
    window.__TM_TOOLS__ = {
      contentHash: hash,
      dailySeed: (key) => dailySeed(key, hash),
      replay: (text) => {
        const o = runReplay(decodeInputLogText(text), bundle);
        return { eventHash: o.eventHash, eventCount: o.eventCount, score: o.result.score };
      },
      scopeCull: (on) => {
        HuntScene.cullZoomed = on;
      },
      popBench: (n, mode) => {
        const hunt = game.scene.getScene('Hunt');
        return hunt instanceof HuntScene && hunt.sys.isActive() ? hunt.benchPops(n, mode) : null;
      },
    };
  }

  if (testHooks) {
    // CPU cost of each frame for the perf smoke (the part our code controls; GPU raster excluded).
    let stepStart = 0;
    game.events.on(Phaser.Core.Events.PRE_STEP, () => {
      stepStart = performance.now();
    });
    game.events.on(Phaser.Core.Events.POST_RENDER, () => {
      if (hook.scene === 'hunt' && !hook.over && hook.cpuFrameMs.length < 20_000) {
        hook.cpuFrameMs.push(performance.now() - stepStart);
        hook.cpuFrameScoped.push(hook.zoom.raise >= 1);
        hook.cpuFrameOpen.push(hook.zoom.z === 1);
      }
    });
  }

  // Phaser's disableContextMenu only works through its own input managers, which are off; block
  // the menu here so a right-click (reload, or on the start card) never opens it.
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  function applyLayout(): void {
    const view = viewport();
    const size = designSizeFor(view.width, view.height);
    portrait = isPortrait(view.width, view.height);
    // M9: the canvas is the design size × the tier's render scale; cameras zoom to match.
    setView(size, prefs.renderScale);
    safeCache = null;
    const canvas = renderSizeFor(size, prefs.renderScale);
    const changed =
      canvas.width !== game.scale.gameSize.width || canvas.height !== game.scale.gameSize.height;
    if (changed) {
      game.scale.setGameSize(canvas.width, canvas.height);
      for (const scene of game.scene.getScenes(true)) fitCamera(scene.cameras.main);
    }
    document.getElementById('rotate-card')?.classList.toggle('visible', portrait);
    // Report what Phaser actually uses, so tests catch a setGameSize that didn't take effect.
    // Design px are what the scenes and taps use; the canvas size is checked against it × scale.
    hook.designWidth = designSize().width;
    hook.designHeight = designSize().height;
    hook.renderScale = prefs.renderScale;
    hook.portrait = portrait;
  }

  applyLayout();
  relayout = applyLayout;
  window.addEventListener('resize', applyLayout);
  window.visualViewport?.addEventListener('resize', applyLayout);
}

void boot();
