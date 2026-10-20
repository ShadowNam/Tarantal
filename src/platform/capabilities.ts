// Device feature rules for the fullscreen button and the iOS "Add to Home Screen" banner
// (Tech §9). Pure, so they are unit-tested without a browser.

export interface DeviceInfo {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  /** document.fullscreenEnabled and Element.requestFullscreen exist. */
  readonly fullscreenApi: boolean;
  /** display-mode standalone/fullscreen, or navigator.standalone (iOS home-screen app). */
  readonly standalone: boolean;
}

/** iPhone or iPod: Safari there has no element Fullscreen API. */
export function isIPhone(d: DeviceInfo): boolean {
  return /\b(iPhone|iPod)\b/.test(d.userAgent);
}

/** iPhone, iPod or iPad (iPadOS 13+ reports a Mac user agent with touch points). */
export function isIOS(d: DeviceInfo): boolean {
  return (
    isIPhone(d) ||
    /\biPad\b/.test(d.userAgent) ||
    (/Macintosh/.test(d.userAgent) && d.maxTouchPoints > 1)
  );
}

/** Never on iPhone (even if a browser shell reports the API), never when already installed. */
export function canShowFullscreenButton(d: DeviceInfo): boolean {
  return d.fullscreenApi && !isIPhone(d) && !d.standalone;
}

/** One-time banner on iPhone when the game is not already installed. */
export function shouldShowInstallBanner(d: DeviceInfo, dismissed: boolean): boolean {
  return isIPhone(d) && !d.standalone && !dismissed;
}
