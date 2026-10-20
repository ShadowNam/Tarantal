// Plain web / PWA build (VITE_PLATFORM=web, the default). No ads, no portal SDK. Analytics stay
// on the device (kept in memory for the debug overlay and e2e tests) until a privacy-reviewed
// endpoint exists (M9). Registers the service worker in production builds (offline play).
import type { DeviceInfo } from './capabilities';
import { canShowFullscreenButton, isIPhone } from './capabilities';
import type { PlatformAdapter, PlatformCapabilities } from './PlatformAdapter';

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
