// Plain web / PWA build (VITE_PLATFORM=web, the default). No ads, no portal SDK. Analytics stay
// on the device (kept in memory for the debug overlay and e2e tests) until a privacy-reviewed
// endpoint exists (M9). Registers the service worker in production builds (offline play).
import type { DeviceInfo } from './capabilities';
import { canShowFullscreenButton, isIPhone } from './capabilities';
import type { PlatformAdapter, PlatformCapabilities } from './PlatformAdapter';
import { shareWith, type ShareOutcome, type SharePayload } from './share';

export interface AnalyticsRecord {
  readonly event: string;
  readonly data: Record<string, unknown>;
  /** ms since navigation start. */
  readonly at: number;
}

const MAX_RECORDS = 500;

export function deviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { standalone?: boolean };
  const mq = (q: string): boolean => window.matchMedia(q).matches;
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    fullscreenApi:
      document.fullscreenEnabled &&
      typeof document.documentElement.requestFullscreen === 'function',
    standalone:
      nav.standalone === true ||
      mq('(display-mode: standalone)') ||
      mq('(display-mode: fullscreen)'),
  };
}

/** Old-browser copy: select a hidden textarea and run the legacy copy command. */
function copyWithTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the fallback for browsers without the Clipboard API
    return document.execCommand('copy');
  } finally {
    ta.remove();
  }
}

export class WebPlatform implements PlatformAdapter {
  readonly id = 'web' as const;
  readonly canShowExternalLinks = true;
  /** Analytics this page (newest last, capped). */
  readonly records: AnalyticsRecord[] = [];
  private readonly adListeners = new Set<(playing: boolean) => void>();

  constructor(private readonly opts: { readonly serviceWorker: boolean; readonly log: boolean }) {}

  async init(): Promise<void> {
    if (!this.opts.serviceWorker || !('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      // Offline play is a bonus; the game runs without it (e.g. file://, blocked SW).
      console.warn('service worker not registered', e);
    }
  }

  gameplayStart(): void {}
  gameplayStop(): void {}
  loadingProgress(): void {}

  commercialBreak(): Promise<void> {
    return Promise.resolve();
  }

  rewardedBreak(): Promise<boolean> {
    return Promise.resolve(false);
  }

  isAdPlaying(): boolean {
    return false;
  }

  onAdChange(fn: (playing: boolean) => void): () => void {
    this.adListeners.add(fn);
    return () => this.adListeners.delete(fn);
  }

  shareUrl(base: string): string {
    return base;
  }

  share(payload: SharePayload): Promise<ShareOutcome> {
    // Not every browser has these (desktop Firefox/Linux Chrome lack share; old ones the
    // Clipboard API), whatever lib.dom says.
    const nav: {
      share?: (d: ShareData) => Promise<void>;
      canShare?: (d: ShareData) => boolean;
      clipboard?: { writeText?: (t: string) => Promise<void> };
    } = navigator;
    const { share, canShare, clipboard } = nav;
    const writeText = clipboard?.writeText;
    return shareWith(
      {
        ...(share === undefined ? {} : { share: (d: ShareData) => share.call(navigator, d) }),
        ...(canShare === undefined
          ? {}
          : { canShare: (d: ShareData) => canShare.call(navigator, d) }),
        ...(writeText === undefined || clipboard === undefined
          ? {}
          : { writeClipboard: (t: string) => writeText.call(clipboard, t) }),
        copyFallback: copyWithTextarea,
      },
      payload,
    );
  }

  analytics(event: string, data: Record<string, unknown> = {}): void {
    if (this.records.length >= MAX_RECORDS) this.records.shift();
    this.records.push({ event, data, at: performance.now() });
    if (this.opts.log) console.info('[analytics]', event, data);
  }

  capabilities(): PlatformCapabilities {
    const d = deviceInfo();
    return {
      fullscreen: canShowFullscreenButton(d),
      standalone: d.standalone,
      iphone: isIPhone(d),
    };
  }

  async requestFullscreen(): Promise<void> {
    if (!this.capabilities().fullscreen) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Denied (no user gesture, policy): stay windowed.
    }
  }
}
