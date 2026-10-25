// Everything portal- or wrapper-specific goes through this interface (Tech §8, CLAUDE.md rule 5).
// Selected at boot by the VITE_PLATFORM build flag (platform.ts), never by sniffing the portal.
import type { ShareOutcome, SharePayload } from './share';
export type PlatformId = 'web' | 'poki' | 'crazygames' | 'capacitor' | 'desktop';

/** What the page can do on this device (feature detection, not portal selection). */
export interface PlatformCapabilities {
  /** The element Fullscreen API works here (never on iPhone Safari, Tech §9). */
  readonly fullscreen: boolean;
  /** Running as an installed PWA (standalone/fullscreen display mode). */
  readonly standalone: boolean;
  /** iPhone/iPod: no Fullscreen API, so offer "Add to Home Screen" instead. */
  readonly iphone: boolean;
}

/** An uncaught error or rejection, already stripped of URLs and query strings (errors.ts). */
export interface ErrorReport {
  readonly source: 'error' | 'rejection';
  readonly message: string;
  /** Top stack frames as `file:line:col` (no origin, path or query). */
  readonly frames: readonly string[];
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  init(): Promise<void>;
  /** Portals need these signals around each hunt. */
  gameplayStart(): void;
  gameplayStop(): void;
  loadingProgress(p: number): void;
  /** Between hunts only; resolves when the break is over. Audio is muted meanwhile. */
  commercialBreak(): Promise<void>;
  /** True = reward granted. */
  rewardedBreak(): Promise<boolean>;
  isAdPlaying(): boolean;
  /** An ad is requested or playing (from the request on: menus ignore input, D-026). */
  isAdBusy(): boolean;
  /** A rewarded ad can be offered now (false on web, without an SDK, or when it failed to load). */
  rewardedAvailable(): boolean;
  /** Called with true when an ad starts and false when it ends (AudioDirector mutes). */
  onAdChange(fn: (playing: boolean) => void): () => void;
  cloudSave?: { get(): Promise<string | null>; set(data: string): Promise<void> };
  user?(): Promise<{ id: string; name: string } | null>;
  /** Portal deep-link rules differ: rewrites a `…?c=<challenge>` link for the portal. */
  shareUrl(base: string): string;
  /** A launch parameter (the challenge link's `c`): the portal's invite parameter, else the URL's. */
  launchParam(name: string): string | null;
  /** The portal asks the game to be silent (CrazyGames settings.muteAudio), or lets it play again. */
  onPortalMute(fn: (muted: boolean) => void): () => void;
  /** Crash/error hook (M9): no personal data; kept on the device unless a portal takes reports. */
  reportError(report: ErrorReport): void;
  /** Share sheet → clipboard → textarea copy (M7). Call from inside a user gesture. */
  share(payload: SharePayload): Promise<ShareOutcome>;
  /** Analytics event (Tech §14). No personal data; may be a no-op on some portals. */
  analytics(event: string, data?: Record<string, unknown>): void;
  readonly canShowExternalLinks: boolean;
  /** PWA extras (service worker, "Add to Home Screen" banner) belong to this build: web only. */
  readonly pwa: boolean;
  /**
   * v1.6 (D-042): calls `show` when a new deploy's service worker has taken over this page (the
   * page should offer a reload). Builds without a worker never call it.
   */
  onUpdateReady?(show: () => void): void;
  /** v1.2x (D-034): `?admin=1` opens the playtest admin page. Web builds only (Pages, dev);
   *  portal builds ignore the parameter and show the normal title. */
  readonly adminPage: boolean;
  capabilities(): PlatformCapabilities;
  /** Enters fullscreen where capabilities().fullscreen is true. */
  requestFullscreen(): Promise<void>;
}
