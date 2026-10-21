// Boot: save (settings + progress) → i18n → content (validated) → platform adapter →
// placeholder assets → Phaser game with the flexible-width layout (Tech §5). Opens on the title
// over the live panorama: one giant START HUNT, so the first shot is seconds away (GDD §16).
import * as Phaser from 'phaser';
import { contentHash } from './content/hash';
import { DailyFlow } from './game/daily/DailyFlow';
import { loadGameContent } from './content/loadBrowser';
import { AudioDirector } from './game/audio/AudioDirector';
import { withQuotaMul, withTestCrate } from './game/devContent';
import type { GameContext, TestHook, TestTools } from './game/GameContext';
import { designSizeFor, isPortrait, safeAreaInDesignPx, type Insets } from './game/layout';
import { createPlaceholderManifest } from './game/placeholder/ProceduralAssetFactory';
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
import { storageStatus } from './meta/storage';
import { createPlatform } from './platform/platform';
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
const testHooks = import.meta.env.DEV || import.meta.env.MODE === 'test' || params.has('e2e');

const save = new SaveStore();
// e2e/dev only: ?ftue=0 starts as a returning player (older specs test Classic hunts).
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
  return () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
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

/** e2e/dev only: ?today=2026-10-21 fixes the UTC day of the Daily Hunt. */
function todaySource(): () => number {
  const fixed = testHooks ? parseDayKey(params.get('today') ?? '') : null;
  return fixed === null ? () => dayNumber(Date.now()) : () => fixed;
}

const hook: TestHook = {
  ready: false,
  designWidth: 0,
  designHeight: 0,
  portrait: false,
  scene: 'start',
  tick: 0,
  ticksLeft: 0,
  score: 0,
  shells: 0,
  magazine: 0,
  reloading: false,
  stones: 0,
  shots: 0,
  over: false,
  inputKind: null,
  menu: null,
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
  flockLog: [],
  result: null,
  firstShotAtMs: null,
  frameTimes: [],
  cpuFrameMs: [],
  replay: null,
  hunts: 0,
  missingTextures: [],
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
};
if (testHooks) window.__TM__ = hook;

hook.boot['script'] = performance.now();
const loaded = loadGameContent();
const { feel } = loaded;
const crateParam = testHooks ? params.get('crate') : null;
const withCrate = crateParam === null ? loaded.bundle : withTestCrate(loaded.bundle, crateParam);
// e2e/dev only: ?quotaMul=0 makes every Season Run quota reachable (short e2e runs).
const quotaMul = testHooks && params.has('quotaMul') ? Number(params.get('quotaMul')) : NaN;
const bundle =
  Number.isFinite(quotaMul) && quotaMul >= 0 ? withQuotaMul(withCrate, quotaMul) : withCrate;
hook.boot['content'] = performance.now();
const biomeId = bundle.modes.modes.classic.biome;
const biome = bundle.biomes.find((b) => b.id === biomeId);
if (biome === undefined) throw new Error(`classic biome ${biomeId} missing`);

const initial = designSizeFor(viewport().width, viewport().height);
let portrait = isPortrait(viewport().width, viewport().height);
let contextLost = false;

const platform = createPlatform({
  serviceWorker: import.meta.env.PROD,
  log: params.get('debug') === '1',
});
void platform.init();
if (testHooks && 'records' in platform) hook.analytics = (platform as { records: [] }).records;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const prefInputs: PrefInputs = {
  feel,
  device: { coarsePointer, cores: navigator.hardwareConcurrency || 0 },
  reducedMotion,
};
const prefs = computePrefs(save.data.settings, prefInputs);
const audio = new AudioDirector();
const applyAudio = (s: Settings): void => {
  audio.setVolumes({ master: s.masterVolume, sfx: s.sfxVolume, music: s.musicVolume });
};
applyAudio(save.data.settings);
platform.onAdChange((playing) => {
  audio.setMuted('ad', playing);
});
let lastSettings = save.data.settings;
save.onChange((d) => {
  if (d.settings === lastSettings) return;
  const changed = (Object.keys(d.settings) as (keyof Settings)[]).filter(
    (k) => d.settings[k] !== lastSettings[k],
  );
  lastSettings = d.settings;
  applyPrefs(prefs, d.settings, prefInputs);
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

const hash = contentHash(bundle);
// Biomes this build draws: the main biome's art only until M8 (the rotation skips the rest).
const playableBiomes = [biome.id];
// A challenge link (Tech §12): decoded once, then removed from the address bar so a reload or a
// bookmark doesn't show the card again.
let pendingChallenge: ChallengeDecode | null = null;
const challengeParam = params.get('c');
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
  manifest: createPlaceholderManifest(bundle, biome),
  audio,
  save,
  notaboek: loaded.notaboek,
  dailyMeta: loaded.daily,
  daily: new DailyFlow({
    content: bundle,
    contentHash: hash,
    meta: loaded.daily,
    save,
    platform,
    today,
    playableBiomes,
    shareBase,
  }),
  pendingChallenge,
  platform,
  run: new RunFlow(bundle, loaded.notaboek, save, platform),
  prefs,
  chrome,
  applyLanguage: () => {
    applyLanguage();
    chrome.relabel();
  },
  menuPaused: false,
  safeArea: (): Insets => safeAreaInDesignPx(cssSafeArea(), viewport(), game.scale.gameSize),
  nextSeed: seedSource(),
  huntSeconds: huntSecondsParam(),
  omen: omenParam(),
  coarsePointer,
  reducedMotion,
  paused: () => portrait || document.visibilityState === 'hidden' || ctx.menuPaused || contextLost,
  debug: params.get('debug') === '1',
  hook: testHooks ? hook : null,
};

const game: Phaser.Game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#1b1410',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initial.width,
    height: initial.height,
  },
  // All input is Pointer Events + keys in InputMapper (Tech §6); all audio is AudioDirector.
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  disableContextMenu: true,
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
  if (size.width !== game.scale.gameSize.width || size.height !== game.scale.gameSize.height) {
    game.scale.setGameSize(size.width, size.height);
  }
  document.getElementById('rotate-card')?.classList.toggle('visible', portrait);
  // Report what Phaser actually uses, so tests catch a setGameSize that didn't take effect.
  hook.designWidth = game.scale.gameSize.width;
  hook.designHeight = game.scale.gameSize.height;
  hook.portrait = portrait;
}

applyLayout();
window.addEventListener('resize', applyLayout);
window.visualViewport?.addEventListener('resize', applyLayout);
