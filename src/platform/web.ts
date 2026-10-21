// Plain web / PWA build (VITE_PLATFORM=web, the default). No ads, no portal SDK. Analytics and
// error reports stay on the device (LocalPlatform). Registers the service worker in production
// builds (offline play).
import { LocalPlatform, type PlatformOptions } from './local';

export type { AnalyticsRecord } from './local';

export class WebPlatform extends LocalPlatform {
  readonly id = 'web' as const;
  readonly canShowExternalLinks = true;
  readonly pwa = true;

  private readonly serviceWorker: boolean;

  constructor(opts: PlatformOptions & { readonly serviceWorker: boolean }) {
    super(opts);
    this.serviceWorker = opts.serviceWorker;
  }

  /** Doesn't wait for the worker: boot awaits init(), and offline play is a bonus. */
  init(): Promise<void> {
    if (this.serviceWorker && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e: unknown) => {
        // The game runs without it (e.g. file://, blocked SW).
        console.warn('service worker not registered', e);
      });
    }
    return Promise.resolve();
  }
}
