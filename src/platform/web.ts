// Plain web / PWA build (VITE_PLATFORM=web, the default). No ads, no portal SDK. Analytics and
// error reports stay on the device (LocalPlatform). Registers the service worker in production
// builds (offline play).
import { LocalPlatform, type PlatformOptions } from './local';

export type { AnalyticsRecord } from './local';

export class WebPlatform extends LocalPlatform {
  readonly id = 'web' as const;
  readonly canShowExternalLinks = true;
  readonly pwa = true;
  /** D-034: the playtest admin page is on the Pages and dev builds. */
  static readonly ADMIN_PAGE = true;
  readonly adminPage = WebPlatform.ADMIN_PAGE;

  private readonly serviceWorker: boolean;
  private updateReady: (() => void) | null = null;
  private updated = false;

  constructor(opts: PlatformOptions & { readonly serviceWorker: boolean }) {
    super(opts);
    this.serviceWorker = opts.serviceWorker;
  }

  /** Doesn't wait for the worker: boot awaits init(), and offline play is a bonus. */
  init(): Promise<void> {
    if (this.serviceWorker && 'serviceWorker' in navigator) {
      // v1.6 (D-042): a new worker (skipWaiting + clients.claim) taking over a page that already
      // had one means a deploy landed under it: offer a reload rather than mixing builds.
      const hadWorker = navigator.serviceWorker.controller !== null;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadWorker || this.updated) return;
        this.updated = true;
        this.updateReady?.();
      });
      navigator.serviceWorker.register('./sw.js').catch((e: unknown) => {
        // The game runs without it (e.g. file://, blocked SW).
        console.warn('service worker not registered', e);
      });
    }
    return Promise.resolve();
  }

  onUpdateReady(show: () => void): void {
    this.updateReady = show;
    if (this.updated) show();
  }
}
