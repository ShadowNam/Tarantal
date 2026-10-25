// Plain web / PWA build (VITE_PLATFORM=web, the default). No ads, no portal SDK. Analytics and
// error reports stay on the device (LocalPlatform). Registers the service worker in production
// builds (offline play).
import { LocalPlatform, type PlatformOptions } from './local';
import { BUILD_MESSAGE, shouldOfferUpdate } from './swUpdate';

/** How long the page waits for the new worker to name its build (no answer: no update bar). */
const BUILD_ASK_MS = 3000;

/** v1.6 (D-042): asks the worker in charge which build it serves (null: no answer). */
function workerBuild(worker: ServiceWorker | null): Promise<string | null> {
  if (worker === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      resolve(null);
    }, BUILD_ASK_MS);
    channel.port1.onmessage = (e: MessageEvent<unknown>) => {
      window.clearTimeout(timer);
      resolve(typeof e.data === 'string' ? e.data : null);
    };
    worker.postMessage(BUILD_MESSAGE, [channel.port2]);
  });
}

export type { AnalyticsRecord } from './local';

export class WebPlatform extends LocalPlatform {
  readonly id = 'web' as const;
  readonly canShowExternalLinks = true;
  readonly pwa = true;
  /** D-034: the playtest admin page is on the Pages and dev builds. */
  static readonly ADMIN_PAGE = true;
  readonly adminPage = WebPlatform.ADMIN_PAGE;

  private readonly serviceWorker: boolean;
  /** This page's build (swUpdate.buildIdOf), compared with the worker's. */
  private readonly buildId: string;
  private updateReady: (() => void) | null = null;
  private updated = false;

  constructor(
    opts: PlatformOptions & { readonly serviceWorker: boolean; readonly buildId?: string },
  ) {
    super(opts);
    this.serviceWorker = opts.serviceWorker;
    this.buildId = opts.buildId ?? '';
  }

  /** Doesn't wait for the worker: boot awaits init(), and offline play is a bonus. */
  init(): Promise<void> {
    if (this.serviceWorker && 'serviceWorker' in navigator) {
      // v1.6 (D-042): a new worker (skipWaiting + clients.claim) taking over a page that already
      // had one means a deploy landed under it: offer a reload rather than mixing builds — but
      // only when that worker serves another build than this page runs (navigations are network
      // first, so the page usually loaded the new build already).
      const hadWorker = navigator.serviceWorker.controller !== null;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadWorker || this.updated) return;
        void workerBuild(navigator.serviceWorker.controller).then((build) => {
          if (this.updated || !shouldOfferUpdate(hadWorker, this.buildId, build)) return;
          this.updated = true;
          this.updateReady?.();
        });
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
