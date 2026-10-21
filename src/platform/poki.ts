// Poki build (VITE_PLATFORM=poki, M9). Follows the Poki HTML5 SDK guide (developers.poki.com/
// guide/sdk-html5, checked 21 Oct 2026): the SDK script from Poki's CDN, init() before the game
// starts (the game also starts when it fails: adblock), gameLoadingFinished() once the title is
// up, gameplayStart/Stop around play (pause included), commercialBreak() only between hunts,
// rewardedBreak() → true = reward, audio muted and input locked while an ad covers the game,
// shareableURL/getURLParam for challenge links. No service worker, no PWA banner, no
// fullscreen button (Poki's page has its own). Analytics stay on the device: Poki measures play
// itself, and the game sends nothing else.
import { LocalPlatform, type PlatformOptions } from './local';
import { loadScript, withTimeout } from './sdkLoader';

export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/** The part of window.PokiSDK the game uses. */
export interface PokiSdk {
  init(): Promise<unknown>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<unknown>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
  shareableURL(params: Record<string, string>): Promise<string>;
  getURLParam(name: string): string | null | undefined;
}

/** Keys and wheel that would scroll Poki's page around the game frame (Poki guide). */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', ' ', 'Space']);

export async function loadPokiSdk(timeoutMs: number): Promise<PokiSdk | null> {
  const ok = await loadScript(POKI_SDK_URL, timeoutMs);
  const sdk = ok ? (window as Window & { PokiSDK?: PokiSdk }).PokiSDK : undefined;
  return sdk ?? null;
}

export class PokiPlatform extends LocalPlatform {
  readonly id = 'poki' as const;
  readonly canShowExternalLinks = false;
  readonly pwa = false;
  protected override readonly shareSheet = false;
  private sdk: PokiSdk | null = null;
  private inGameplay = false;
  private loadingDone = false;
  /** Poki's shareable game page (from shareableURL at init), or null. */
  private shareBase: string | null = null;

  constructor(
    opts: PlatformOptions,
    private readonly loadSdk: (timeoutMs: number) => Promise<PokiSdk | null> = loadPokiSdk,
    private readonly blockScroll = true,
  ) {
    super(opts);
  }

  async init(): Promise<void> {
    if (this.blockScroll) {
      window.addEventListener('keydown', (e) => {
        if (SCROLL_KEYS.has(e.key) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      });
      window.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
        },
        { passive: false },
      );
    }
    // One deadline for script + init (D-026): boot never waits longer than sdkTimeoutMs. Poki:
    // start the game whether init resolves or rejects; only a working SDK is used, and an SDK
    // that turns up after the deadline is not adopted.
    const ready = (async (): Promise<PokiSdk | null> => {
      const loaded = await this.loadSdk(this.opts.sdkTimeoutMs);
      if (loaded === null) return null;
      await loaded.init();
      return loaded;
    })();
    const sdk = await withTimeout(ready, this.opts.sdkTimeoutMs, null);
    if (sdk === null) return;
    this.sdk = sdk;
    if (this.loadingDone) sdk.gameLoadingFinished();
    // The share link base fills in later; until then challenge links keep the page URL.
    sdk.shareableURL({}).then(
      (url) => {
        this.shareBase = url;
      },
      () => undefined,
    );
  }

  get sdkReady(): boolean {
    return this.sdk !== null;
  }

  override loadingProgress(p: number): void {
    if (p < 1 || this.loadingDone) return;
    this.loadingDone = true;
    this.sdk?.gameLoadingFinished();
  }

  override gameplayStart(): void {
    if (this.inGameplay) return;
    this.inGameplay = true;
    this.sdk?.gameplayStart();
  }

  override gameplayStop(): void {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    this.sdk?.gameplayStop();
  }

  override commercialBreak(): Promise<void> {
    const sdk = this.sdk;
    if (sdk === null) return Promise.resolve();
    this.gameplayStop();
    return this.ads.run(async (started) => {
      await sdk.commercialBreak(started);
    }, undefined);
  }

  override rewardedAvailable(): boolean {
    return this.sdk !== null && !this.ads.isBusy;
  }

  override rewardedBreak(): Promise<boolean> {
    const sdk = this.sdk;
    if (sdk === null) return Promise.resolve(false);
    this.gameplayStop();
    return this.ads.run((started) => sdk.rewardedBreak(started).then((v) => v), false);
  }

  /** `…?c=<challenge>` → Poki's game page with `gdc=<challenge>` (read back by getURLParam). */
  override shareUrl(base: string): string {
    if (this.shareBase === null) return base;
    let c: string | null;
    try {
      c = new URL(base).searchParams.get('c');
    } catch {
      return base;
    }
    if (c === null) return this.shareBase;
    const sep = this.shareBase.includes('?') ? '&' : '?';
    return `${this.shareBase}${sep}gdc=${encodeURIComponent(c)}`;
  }

  override launchParam(name: string): string | null {
    const v = this.sdk?.getURLParam(name);
    return typeof v === 'string' && v !== '' ? v : super.launchParam(name);
  }

  protected override fullscreenAllowed(): boolean {
    return false;
  }
}
