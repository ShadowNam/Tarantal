// The two menu controls that live in the DOM, shown on the title only (Tech §9):
// - a fullscreen toggle, created only where the Fullscreen API works and never on iPhone;
// - the one-time iPhone "Add to Home Screen" banner (dismissal saved in SaveData.notices).
import { t } from '../../i18n/i18n';
import type { SaveStore } from '../../meta/save';
import type { PlatformAdapter } from '../../platform/PlatformAdapter';

const INSTALL_NOTICE = 'install_banner';

export class DomChrome {
  private fullscreen: HTMLButtonElement | null = null;
  private readonly banner: HTMLElement | null;
  private onTitle = false;
  /** M10 capture mode: no install banner in trailer footage. */
  private noBanner = false;

  constructor(
    private readonly platform: PlatformAdapter,
    private readonly save: SaveStore,
  ) {
    this.banner = document.getElementById('install-banner');
    this.banner?.querySelector('[data-action="dismiss-install"]')?.addEventListener('click', () => {
      this.save.update((d) => ({ ...d, notices: [...new Set([...d.notices, INSTALL_NOTICE])] }));
      this.sync();
    });
    if (platform.capabilities().fullscreen) {
      const b = document.createElement('button');
      b.id = 'fullscreen-btn';
      b.type = 'button';
      b.className = 'tm-chrome';
      b.dataset['action'] = 'fullscreen';
      // Four corner brackets (an icon font glyph is not on every device).
      b.innerHTML =
        '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" ' +
        'stroke="currentColor" stroke-width="2.6" stroke-linecap="round">' +
        '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
      b.hidden = true;
      b.addEventListener('click', () => {
        void platform.requestFullscreen();
      });
      document.body.appendChild(b);
      this.fullscreen = b;
    }
    this.relabel();
  }

  /** Title visible: show the controls; anywhere else (hunt, menus, tally) hide them. */
  setOnTitle(on: boolean): void {
    this.onTitle = on;
    this.sync();
  }

  /** M10 capture mode: keep the "Add to Home Screen" banner out of the shot. */
  hideInstallBanner(): void {
    this.noBanner = true;
    this.sync();
  }

  relabel(): void {
    this.fullscreen?.setAttribute('aria-label', t('ui.fullscreen'));
    this.fullscreen?.setAttribute('title', t('ui.fullscreen'));
  }

  private sync(): void {
    const caps = this.platform.capabilities();
    if (this.fullscreen) this.fullscreen.hidden = !this.onTitle || !caps.fullscreen;
    if (this.banner) {
      const dismissed = this.save.data.notices.includes(INSTALL_NOTICE);
      // Portal builds (M9) are no PWA: no "Add to Home Screen" banner there.
      this.banner.hidden = !(
        !this.noBanner &&
        this.platform.pwa &&
        this.onTitle &&
        caps.iphone &&
        !caps.standalone &&
        !dismissed
      );
    }
  }
}
