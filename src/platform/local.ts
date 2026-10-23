// What every adapter shares (M9): analytics and error reports kept on the device (in memory, for
// the debug overlay and e2e tests: nothing is sent anywhere until a privacy-reviewed endpoint
// exists), one-at-a-time ads through AdGate, sharing, device capabilities and fullscreen. The
// web build uses it as is; the portal adapters override the SDK parts.
import { AdGate } from './adGate';
import type { DeviceInfo } from './capabilities';
import { canShowFullscreenButton, isIPhone } from './capabilities';
import type {
  ErrorReport,
  PlatformAdapter,
  PlatformCapabilities,
  PlatformId,
} from './PlatformAdapter';
import { shareWith, type ShareDeps, type ShareOutcome, type SharePayload } from './share';

export interface AnalyticsRecord {
  readonly event: string;
  readonly data: Record<string, unknown>;
  /** ms since navigation start. */
  readonly at: number;
}

export interface PlatformOptions {
  /** Log analytics and errors to the console (?debug=1). */
  readonly log: boolean;
  /** AdGate safety timeout (feel.json platform.adTimeoutMs). */
  readonly adTimeoutMs: number;
  /** Portal SDK load + init timeout (feel.json platform.sdkTimeoutMs). */
  readonly sdkTimeoutMs: number;
}

const MAX_RECORDS = 500;
const MAX_ERRORS = 50;

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

/** The browser's share and clipboard functions (each may be missing, whatever lib.dom says). */
function browserShareDeps(shareSheet: boolean): ShareDeps {
  const nav: {
    share?: (d: ShareData) => Promise<void>;
    canShare?: (d: ShareData) => boolean;
    clipboard?: { writeText?: (t: string) => Promise<void> };
  } = navigator;
  const { share, canShare, clipboard } = nav;
  const writeText = clipboard?.writeText;
  return {
    ...(!shareSheet || share === undefined
      ? {}
      : { share: (d: ShareData) => share.call(navigator, d) }),
    ...(!shareSheet || canShare === undefined
      ? {}
      : { canShare: (d: ShareData) => canShare.call(navigator, d) }),
    ...(writeText === undefined || clipboard === undefined
      ? {}
      : { writeClipboard: (t: string) => writeText.call(clipboard, t) }),
    copyFallback: copyWithTextarea,
  };
}

export abstract class LocalPlatform implements PlatformAdapter {
  abstract readonly id: PlatformId;
  abstract readonly canShowExternalLinks: boolean;
  abstract readonly pwa: boolean;
  abstract readonly adminPage: boolean;
  /** Analytics this page (newest last, capped). */
  readonly records: AnalyticsRecord[] = [];
  /** Error reports this page (newest last, capped). */
  readonly errors: ErrorReport[] = [];
  protected readonly ads: AdGate;
  /** The native share sheet may be used (portals: clipboard only, D-026). */
  protected readonly shareSheet: boolean = true;

  constructor(protected readonly opts: PlatformOptions) {
    this.ads = new AdGate(opts.adTimeoutMs);
  }

  abstract init(): Promise<void>;

  gameplayStart(): void {}
  gameplayStop(): void {}
  /** Last loading progress reported (0..1), for the debug overlay. */
  loadProgress = 0;

  loadingProgress(p: number): void {
    this.loadProgress = p;
  }

  commercialBreak(): Promise<void> {
    return Promise.resolve();
  }

  rewardedBreak(): Promise<boolean> {
    return Promise.resolve(false);
  }

  rewardedAvailable(): boolean {
    return false;
  }

  isAdBusy(): boolean {
    return this.ads.isBusy;
  }

  isAdPlaying(): boolean {
    return this.ads.isPlaying;
  }

  onAdChange(fn: (playing: boolean) => void): () => void {
    return this.ads.onChange(fn);
  }

  /** No portal mute here: listeners hear "not muted" once (CrazyGames overrides it). */
  onPortalMute(fn: (muted: boolean) => void): () => void {
    fn(false);
    return () => undefined;
  }

  shareUrl(base: string): string {
    return base;
  }

  launchParam(name: string): string | null {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch {
      return null;
    }
  }

  share(payload: SharePayload): Promise<ShareOutcome> {
    return shareWith(browserShareDeps(this.shareSheet), payload);
  }

  analytics(event: string, data: Record<string, unknown> = {}): void {
    if (this.records.length >= MAX_RECORDS) this.records.shift();
    this.records.push({ event, data, at: performance.now() });
    if (this.opts.log) console.info('[analytics]', event, data);
  }

  reportError(report: ErrorReport): void {
    if (this.errors.length >= MAX_ERRORS) this.errors.shift();
    this.errors.push(report);
    this.analytics('error', { source: report.source, message: report.message });
  }

  /** Fullscreen button rules for this build (portals have their own fullscreen control). */
  protected fullscreenAllowed(d: DeviceInfo): boolean {
    return canShowFullscreenButton(d);
  }

  capabilities(): PlatformCapabilities {
    const d = deviceInfo();
    return {
      fullscreen: this.fullscreenAllowed(d),
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
