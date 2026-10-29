// The Android test app (VITE_PLATFORM=capacitor, D-058): the web build inside a Capacitor shell.
// No ads, no service worker and no PWA banner (every file is inside the APK). The native parts
// (back button, app going to the background, keep-awake, the share sheet) come through
// `NativeApp`, loaded in init() from capacitorNative.ts so no other build carries Capacitor code.
// Storage stays src/meta/storage.ts: the WebView's localStorage persists with the app's data.
import { LocalPlatform, type PlatformOptions } from './local';
import type { PlatformCapabilities } from './PlatformAdapter';
import { shareWith, type ShareOutcome, type SharePayload } from './share';

/** Challenge and share links point at the public web test build: friends open them in a browser. */
export const PUBLIC_GAME_URL = 'https://shadownam.github.io/Tarantal/';

/** What the shell gives the game (capacitorNative.ts; fakes in the unit tests). */
export interface NativeApp {
  /** The Android back button (registering a listener stops the default "close the app"). */
  onBackButton(fn: () => void): void;
  /** The app comes to the front (true) or goes to the background (false). */
  onAppActive(fn: (active: boolean) => void): void;
  /** Sends the app to the background (Android's own back-at-the-root behaviour). */
  minimize(): void;
  /** Keeps the screen on (true) or lets it sleep again (false). */
  keepAwake(on: boolean): void;
  /** The native share sheet; rejects when it is cancelled or missing. */
  share?: (data: { text: string; url?: string }) => Promise<void>;
  /** Opens a link in the system browser, never inside the game's WebView. */
  openUrl(url: string): void;
}

/** The parts of `document` the background shim needs (a fake in the unit tests). */
export interface VisibilityDoc {
  readonly visibilityState: DocumentVisibilityState;
  dispatchEvent(e: Event): boolean;
}

/**
 * When the app goes to the background and the WebView still reports `visible`, reports `hidden`
 * and fires `visibilitychange`, so the existing paths (audio mute, the hunt's pause menu, the save
 * flush) run exactly as in a browser tab; coming back undoes it. Returns true when it changed
 * anything (false: the WebView already reported the change itself).
 */
export function shimVisibility(doc: VisibilityDoc, active: boolean): boolean {
  const own = Object.prototype.hasOwnProperty.call(doc, 'visibilityState');
  if (!active) {
    if (doc.visibilityState === 'hidden') return false;
    Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(doc, 'hidden', { configurable: true, get: () => true });
  } else {
    if (!own) return false;
    // Deleting the own properties shows the real getters again.
    Reflect.deleteProperty(doc, 'visibilityState');
    Reflect.deleteProperty(doc, 'hidden');
  }
  doc.dispatchEvent(new Event('visibilitychange'));
  return true;
}

/** The Share plugin rejects a closed sheet with "Share canceled": treat it as an AbortError. */
export function isShareCancel(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /cancel/i.test(msg);
}

/** A link made on the device (https://localhost/…?c=…) rewritten onto the public build. */
export function publicShareUrl(base: string): string {
  try {
    const u = new URL(base);
    return `${PUBLIC_GAME_URL}${u.search}`;
  } catch {
    return PUBLIC_GAME_URL;
  }
}

export class CapacitorPlatform extends LocalPlatform {
  readonly id = 'capacitor' as const;
  readonly canShowExternalLinks = true;
  /** The app's files are local: no service worker, no "Add to Home Screen" banner. */
  readonly pwa = false;
  /** Like the portals, the app ignores `?admin=1` (D-034). */
  static readonly ADMIN_PAGE = false;
  readonly adminPage = CapacitorPlatform.ADMIN_PAGE;

  private native: NativeApp | null = null;
  private back: (() => boolean) | null = null;
  private awake = false;

  constructor(
    opts: PlatformOptions,
    private readonly loadNative: () => Promise<NativeApp>,
    private readonly doc: VisibilityDoc,
  ) {
    super(opts);
  }

  async init(): Promise<void> {
    try {
      this.native = await this.loadNative();
    } catch (e) {
      // A desktop browser opening dist-android/ (e2e, debugging): the web paths still work.
      console.warn('capacitor shell not available', e);
      return;
    }
    this.native.onBackButton(() => {
      this.pressBack();
    });
    this.native.onAppActive((active) => {
      shimVisibility(this.doc, active);
      // Coming back to a paused hunt: the screen may sleep until play resumes.
      if (!active) this.setAwake(false);
    });
  }

  /** What the back button does (main.ts: backButton.ts). Unset or false: to the background. */
  onBackButton(fn: () => boolean): void {
    this.back = fn;
  }

  /** The back button was pressed (the native listener; e2e dispatches the plugin's event). */
  pressBack(): void {
    const handled = this.back?.() ?? false;
    if (!handled) this.native?.minimize();
  }

  /** The screen stays on while a hunt is played (not paused, not in menus). */
  override gameplayStart(): void {
    this.setAwake(true);
  }

  override gameplayStop(): void {
    this.setAwake(false);
  }

  /** For tests and the debug overlay. */
  get keepingAwake(): boolean {
    return this.awake;
  }

  private setAwake(on: boolean): void {
    if (this.awake === on) return;
    this.awake = on;
    this.native?.keepAwake(on);
  }

  override shareUrl(base: string): string {
    return publicShareUrl(base);
  }

  /** The native share sheet, else the clipboard (Android's WebView has no Web Share API). */
  override share(payload: SharePayload): Promise<ShareOutcome> {
    const nativeShare = this.native?.share;
    if (nativeShare === undefined) return super.share(payload);
    return shareWith(
      {
        share: async (d) => {
          try {
            await nativeShare(d);
          } catch (e) {
            if (isShareCancel(e)) throw new DOMException('cancelled', 'AbortError');
            throw e;
          }
        },
        writeClipboard: (t) => navigator.clipboard.writeText(t),
      },
      payload,
    ).then((outcome) => (outcome === 'failed' ? super.share(payload) : outcome));
  }

  override openExternal(url: string): void {
    if (this.native !== null) this.native.openUrl(url);
    else super.openExternal(url);
  }

  /** The app is the whole screen already: no fullscreen button, standalone, never an iPhone. */
  override capabilities(): PlatformCapabilities {
    return { fullscreen: false, standalone: true, iphone: false };
  }

  override requestFullscreen(): Promise<void> {
    return Promise.resolve();
  }
}
