// Boot: i18n → Phaser game with the flexible-width layout (Tech §5). Platform adapter and
// content loading join here in later milestones (M2, M9).
import * as Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { designSizeFor, isPortrait, safeAreaInDesignPx, type Insets } from './game/layout';
import { pickLanguage, setLanguage, t, type I18nKey } from './i18n/i18n';

interface TestHook {
  ready: boolean;
  designWidth: number;
  designHeight: number;
  portrait: boolean;
}

declare global {
  interface Window {
    /** Read by Playwright smoke tests; dev/test builds only. */
    __TM__?: TestHook;
  }
}

const params = new URLSearchParams(window.location.search);
const debug = params.get('debug') === '1';

setLanguage(pickLanguage(navigator.languages));
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  const key = el.dataset['i18n'];
  if (key !== undefined) el.textContent = t(key as I18nKey);
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

const hook: TestHook = { ready: false, designWidth: 0, designHeight: 0, portrait: false };
if (import.meta.env.DEV || import.meta.env.MODE === 'test' || params.has('e2e')) {
  window.__TM__ = hook;
}

const initial = designSizeFor(viewport().width, viewport().height);

const scene: BootScene = new BootScene({
  debug,
  safeArea: (): Insets => safeAreaInDesignPx(cssSafeArea(), viewport(), game.scale.gameSize),
  onReady: () => {
    hook.ready = true;
  },
});

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
  input: { mouse: { preventDefaultWheel: true } },
  disableContextMenu: true,
  banner: false,
  scene: [scene],
});

function applyLayout(): void {
  const view = viewport();
  const size = designSizeFor(view.width, view.height);
  const portrait = isPortrait(view.width, view.height);
  if (size.width !== game.scale.gameSize.width || size.height !== game.scale.gameSize.height) {
    game.scale.setGameSize(size.width, size.height);
  }
  document.getElementById('rotate-card')?.classList.toggle('visible', portrait);
  hook.designWidth = size.width;
  hook.designHeight = size.height;
  hook.portrait = portrait;
}

applyLayout();
window.addEventListener('resize', applyLayout);
window.visualViewport?.addEventListener('resize', applyLayout);
