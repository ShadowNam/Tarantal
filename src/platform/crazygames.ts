// CrazyGames build (VITE_PLATFORM=crazygames, M9). Follows the CrazyGames HTML5 SDK v3 docs
// (docs.crazygames.com/sdk, checked 21 Oct 2026): the v3 script from their host, `await
// SDK.init()`; `environment` is 'local' on localhost (demo overlay instead of ads), 'crazygames'
// on their site and 'disabled' elsewhere (calls throw, so the game treats it as no SDK).
// loadingStart/Stop around loading, gameplayStart/Stop around play (pause included),
// requestAd('midgame') only between hunts, requestAd('rewarded') → adFinished = reward,
// settings.muteAudio silences the game and wins over the in-game volume, inviteLink /
// getInviteParam for challenge links. No service worker, PWA banner or fullscreen button.
import { LocalPlatform, type PlatformOptions } from './local';
import { loadScript, withTimeout } from './sdkLoader';

export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export interface CrazyAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

/** The part of window.CrazyGames.SDK the game uses. */
export interface CrazySdk {
  init(): Promise<unknown>;
  /** 'local' (localhost), 'crazygames' (their site) or 'disabled' (anywhere else). */
  readonly environment: string;
  readonly game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    inviteLink(params: Record<string, string>): string;
    getInviteParam(name: string): string | null;
    readonly settings?: { readonly muteAudio?: boolean };
    addSettingsChangeListener?(fn: (s: { muteAudio?: boolean }) => void): void;
  };
  readonly ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: CrazyAdCallbacks): void;
    hasAdblock?(): Promise<boolean>;
  };
}

export async function loadCrazySdk(timeoutMs: number): Promise<CrazySdk | null> {
  const ok = await loadScript(CRAZYGAMES_SDK_URL, timeoutMs);
  const sdk = ok
    ? (window as Window & { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK
    : undefined;
  return sdk ?? null;
}

export class CrazyGamesPlatform extends LocalPlatform {
  readonly id = 'crazygames' as const;
  readonly canShowExternalLinks = false;
  readonly pwa = false;
  protected override readonly shareSheet = false;
  private sdk: CrazySdk | null = null;
  private inGameplay = false;
  private loading = false;
  private adblock = false;
  private muted = false;
  private readonly muteListeners = new Set<(muted: boolean) => void>();

  constructor(
    opts: PlatformOptions,
    private readonly loadSdk: (timeoutMs: number) => Promise<CrazySdk | null> = loadCrazySdk,
  ) {
    super(opts);
  }

  async init(): Promise<void> {
    // One deadline for script + init (D-026): boot never waits longer than sdkTimeoutMs; an SDK
    // that turns up after it is not adopted.
    const ready = (async (): Promise<CrazySdk | null> => {
      const loaded = await this.loadSdk(this.opts.sdkTimeoutMs);
      if (loaded === null) return null;
      await loaded.init();
      return loaded;
    })();
    const sdk = await withTimeout(ready, this.opts.sdkTimeoutMs, null);
    // 'disabled' (not on CrazyGames or localhost): every call throws, so run without it.
    if (sdk === null || sdk.environment === 'disabled') return;
    this.sdk = sdk;
    this.call(() => {
      sdk.game.loadingStart();
    });
    this.loading = true;
    this.setMuted(sdk.game.settings?.muteAudio === true);
    sdk.game.addSettingsChangeListener?.((s) => {
      this.setMuted(s.muteAudio === true);
    });
    // Not awaited: boot goes on; until the answer, an ad request under an adblocker just errors
    // (adError → no ad, no reward).
    sdk.ad.hasAdblock?.().then(
      (blocked) => {
        this.adblock = blocked;
      },
      () => undefined,
    );
  }

  get sdkEnvironment(): string | null {
    return this.sdk?.environment ?? null;
  }

  override loadingProgress(p: number): void {
    const sdk = this.sdk;
    if (sdk === null) return;
    if (p < 1 && !this.loading) {
      this.loading = true;
      this.call(() => {
        sdk.game.loadingStart();
      });
    } else if (p >= 1 && this.loading) {
      this.loading = false;
      this.call(() => {
        sdk.game.loadingStop();
      });
    }
  }

  override gameplayStart(): void {
    if (this.inGameplay) return;
    this.inGameplay = true;
    const sdk = this.sdk;
    this.call(() => sdk?.game.gameplayStart());
  }

  override gameplayStop(): void {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    const sdk = this.sdk;
    this.call(() => sdk?.game.gameplayStop());
  }

  override commercialBreak(): Promise<void> {
    if (this.sdk === null || this.adblock) return Promise.resolve();
    this.gameplayStop();
    return this.ads.run(async (started) => {
      await this.requestAd('midgame', started);
    }, undefined);
  }

  override rewardedAvailable(): boolean {
    return this.sdk !== null && !this.adblock && !this.ads.isBusy;
  }

  override rewardedBreak(): Promise<boolean> {
    if (this.sdk === null || this.adblock) return Promise.resolve(false);
    this.gameplayStop();
    return this.ads.run((started) => this.requestAd('rewarded', started), false);
  }

  override shareUrl(base: string): string {
    const sdk = this.sdk;
    if (sdk === null) return base;
    try {
      const c = new URL(base).searchParams.get('c');
      return sdk.game.inviteLink(c === null ? {} : { c });
    } catch {
      return base;
    }
  }

  override launchParam(name: string): string | null {
    let v: string | null;
    try {
      v = this.sdk?.game.getInviteParam(name) ?? null;
    } catch {
      v = null;
    }
    return v !== null && v !== '' ? v : super.launchParam(name);
  }

  override onPortalMute(fn: (muted: boolean) => void): () => void {
    this.muteListeners.add(fn);
    fn(this.muted);
    return () => this.muteListeners.delete(fn);
  }

  protected override fullscreenAllowed(): boolean {
    return false;
  }

  /** true when adFinished fires; false on adError (no ad, adblock, capped). */
  private requestAd(type: 'midgame' | 'rewarded', started: () => void): Promise<boolean> {
    const sdk = this.sdk;
    if (sdk === null) return Promise.resolve(false);
    return new Promise((resolve) => {
      sdk.ad.requestAd(type, {
        adStarted: started,
        adFinished: () => {
          resolve(true);
        },
        adError: () => {
          resolve(false);
        },
      });
    });
  }

  private setMuted(on: boolean): void {
    if (this.muted === on) return;
    this.muted = on;
    for (const fn of this.muteListeners) fn(on);
  }

  /** SDK calls must never break the game. */
  private call(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (this.opts.log) console.warn('[crazygames]', e);
    }
  }
}
