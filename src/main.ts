import type { Biome } from './content/schemas';
// Boot: save (settings + progress) → i18n → content (validated) → platform adapter →
// placeholder assets → Phaser game with the flexible-width layout (Tech §5). Opens on the title
// over the live panorama: one giant START HUNT, so the first shot is seconds away (GDD §16).
import * as Phaser from 'phaser';
import { contentHash } from './content/hash';
import { DailyFlow } from './game/daily/DailyFlow';
import { loadGameContent } from './content/loadBrowser';
import { AudioDirector, browserAudioEnv } from './game/audio/AudioDirector';
import { BarkDirector, allBarkLines } from './game/audio/barks';
import { withDoppies, withQuotaMul, withTestCrate } from './game/devContent';
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
import type { AssetManifest } from './game/assets/AssetManifest';
import { ABSENT, fetchAssetIndex } from './game/assets/finalLoader';
import {
  biomeArtReady,
  createPlaceholderManifest,
  loadBiomeArt,
  placeholderBiomes,
} from './game/placeholder/ProceduralAssetFactory';
import { applyPrefs, computePrefs, type PrefInputs } from './game/prefs';
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
import { isI18nKey, pickLanguage, setLanguage, t } from './i18n/i18n';
import { decodeChallenge, type ChallengeDecode } from './meta/challenge';
import { dailySeed } from './meta/daily';
import { dayNumber, parseDayKey } from './meta/dailyCalendar';
import { SaveStore } from './meta/save';
import type { Settings } from './meta/saveSchema';
import { setStorageNamespace, storageStatus } from './meta/storage';
import { installErrorHook } from './platform/errors';
import { LocalPlatform } from './platform/local';
import { createPlatform, currentPlatformId } from './platform/platform';
import { AdBreaks } from './game/ads/AdBreaks';
import { PrivacyScene } from './game/scenes/PrivacyScene';
import { officialResultsAllowed, testHookPolicy } from './game/testHooks';
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
if (hookPolicy.namespace !== null) setStorageNamespace(hookPolicy.namespace);
else if (capture) setStorageNamespace(CAPTURE_NAMESPACE);

const save = new SaveStore();
// e2e/dev only: ?ftue=0 starts as a returning player (older specs test Classic hunts).
// M10 capture mode: no tutorial on the capture save (its prompts would be hidden).
if (capture && !save.data.ftue.done) save.update((d) => captureSave(d));
if (testHooks && params.get('ftue') === '0' && !save.data.ftue.done) {
  save.update((d) => ({ ...d, ftue: { done: true, skipped: true, step: 'param' } }));
}

function applyLanguage(): void {
  const lang = save.data.settings.language;
  setLanguage(lang === 'auto' ? pickLanguage(navigator.languages) : lang);
  document.documentElement.lang = lang === 'auto' ? pickLanguage(navigator.languages) : lang;
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

/** e2e/dev only: ?today=YYYY-MM-DD fixes the UTC day of the Daily Hunt. */
function todaySource(): () => number {
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
  glare: null,
  omen: false,
  rain: false,
  lightning: false,
  magazine: 0,
  reloading: false,
  stones: 0,
  shots: 0,
  over: false,
  inputKind: null,
  menu: null,
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
  simFrameMs: [],
  simFrameSteps: [],
  replay: null,
  hunts: 0,
  assets: { problem: null, byBiome: {}, recorded: [] },
  music: null,
  masterGain: null,
  missingTextures: [],
  textureBytes: 0,
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
  run: null,
  seasonHud: null,
  huntSeed: null,
  daily: null,
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
  captions: [],
  quality: { tier: '', bench: null, benchRan: false, layers: 0, filters: [] },
  errors: [],
};
if (testHooks) window.__TM__ = hook;

hook.boot['script'] = performance.now();
const loaded = loadGameContent();
const { feel } = loaded;
// M10: the final-asset index, fetched while the platform SDK starts (absent = all placeholders).
const indexLoad = fetchAssetIndex(feel.assets.indexTimeoutMs);
const crateParam = testHooks ? params.get('crate') : null;
const withCrate = crateParam === null ? loaded.bundle : withTestCrate(loaded.bundle, crateParam);
// e2e/dev only: ?quotaMul=0 makes every Season Run quota reachable (short e2e runs).
const quotaMul = testHooks && params.has('quotaMul') ? Number(params.get('quotaMul')) : NaN;
const withQuota =
  Number.isFinite(quotaMul) && quotaMul >= 0 ? withQuotaMul(withCrate, quotaMul) : withCrate;
// e2e/dev only: ?doppies=1 — a run with (almost) no Doppies, to show Padstal offers it can't buy.
const doppiesParam = testHooks && params.has('doppies') ? Number(params.get('doppies')) : NaN;
const bundle =
  Number.isInteger(doppiesParam) && doppiesParam >= 0
    ? withDoppies(withQuota, doppiesParam)
    : withQuota;
hook.boot['content'] = performance.now();
const biomeId = bundle.modes.modes.classic.biome;
const biome = bundle.biomes.find((b) => b.id === biomeId);
if (biome === undefined) throw new Error(`classic biome ${biomeId} missing`);

const initialDesign = designSizeFor(viewport().width, viewport().height);
let portrait = isPortrait(viewport().width, viewport().height);
let contextLost = false;

const platform = createPlatform({
  serviceWorker: import.meta.env.PROD,
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
const audio = new AudioDirector(feel.audio, browserAudioEnv(feel.assets.fileTimeoutMs));
hook.assets.recorded = audio.recorded;
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
};
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
    m = createPlaceholderManifest(bundle, b, allBarkLines(feel.barks));
    manifests.set(b.id, m);
  }
  return m;
};
// M10: final files for a biome's manifest, loaded once (each failure keeps that placeholder).
const { index: assetIndex, problem: indexProblem } = await indexLoad;
hook.assets.problem = indexProblem;
if (indexProblem !== null && !indexProblem.startsWith(ABSENT))
  console.warn(`[assets] ${indexProblem}: using placeholders`);
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
await loadFinalFor(biome);
// A challenge link (Tech §12): decoded once, then removed from the address bar so a reload or a
// bookmark doesn't show the card again.
let pendingChallenge: ChallengeDecode | null = null;
// Capture mode and `?e2e` on a public build (unranked) open no challenge links.
const unranked = capture || !officialResults;
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

const ctx: GameContext = {
  content: bundle,
  contentHash: hash,
  feel,
  biome,
  manifest: manifestFor(biome),
  playableBiomes,
  manifestFor,
  biomeReady: (id) => biomeArtReady(id) && finalDone.has(id),
  // The biome's placeholder art chunk, then its final files (if any were delivered).
  loadBiome: async (id) => {
    if (!(await loadBiomeArt(id))) return false;
    const b = bundle.biomes.find((x) => x.id === id);
    if (b !== undefined) await loadFinalFor(b);
    return true;
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
  barks: new BarkDirector(feel.barks, feel.audio.barkGapMs),
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
  huntSeconds: huntSecondsParam(),
  holdAtTick: holdAtParam(),
  omen: omenParam(),
  classicBiome: biomeParam(),
  coarsePointer,
  reducedMotion,
  paused: () => portrait || document.visibilityState === 'hidden' || ctx.menuPaused || contextLost,
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
