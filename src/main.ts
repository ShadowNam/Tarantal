// Boot: i18n → content (validated) → placeholder assets → Phaser game with the flexible-width
// layout (Tech §5). Goes straight to the hunt's start card so the first shot is seconds away.
// Platform adapter joins here in M9.
import * as Phaser from 'phaser';
import { contentHash } from './content/hash';
import { loadGameContent } from './content/loadBrowser';
import { AudioDirector } from './game/audio/AudioDirector';
import type { GameContext, TestHook } from './game/GameContext';
import { designSizeFor, isPortrait, safeAreaInDesignPx, type Insets } from './game/layout';
import { createPlaceholderManifest } from './game/placeholder/ProceduralAssetFactory';
import { HudScene } from './game/scenes/HudScene';
import { HuntScene } from './game/scenes/HuntScene';
import { TallyScene } from './game/scenes/TallyScene';
import { isI18nKey, pickLanguage, setLanguage, t } from './i18n/i18n';

declare global {
  interface Window {
    /** Read by Playwright tests; dev/test builds and ?e2e=1 only. */
    __TM__?: TestHook;
  }
}

const params = new URLSearchParams(window.location.search);
const testHooks = import.meta.env.DEV || import.meta.env.MODE === 'test' || params.has('e2e');

setLanguage(pickLanguage(navigator.languages));
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  const key = el.dataset['i18n'];
  if (key !== undefined && isI18nKey(key)) el.textContent = t(key);
  else console.error(`Unknown i18n key in index.html: ${String(key)}`);
}

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
  shots: 0,
  over: false,
  inputKind: null,
  cameraX: 0,
  birds: 0,
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
};
if (testHooks) window.__TM__ = hook;

hook.boot['script'] = performance.now();
const { bundle, feel } = loadGameContent();
hook.boot['content'] = performance.now();
const biomeId = bundle.modes.modes.classic.biome;
const biome = bundle.biomes.find((b) => b.id === biomeId);
if (biome === undefined) throw new Error(`classic biome ${biomeId} missing`);

const initial = designSizeFor(viewport().width, viewport().height);
let portrait = isPortrait(viewport().width, viewport().height);

const ctx: GameContext = {
  content: bundle,
  contentHash: contentHash(bundle),
  feel,
  biome,
  manifest: createPlaceholderManifest(bundle, biome),
  audio: new AudioDirector(),
  safeArea: (): Insets => safeAreaInDesignPx(cssSafeArea(), viewport(), game.scale.gameSize),
  nextSeed: seedSource(),
  huntSeconds: huntSecondsParam(),
  coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  paused: () => portrait || document.visibilityState === 'hidden',
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
  scene: [new HuntScene(ctx), new HudScene(ctx), new TallyScene(ctx)],
});

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
