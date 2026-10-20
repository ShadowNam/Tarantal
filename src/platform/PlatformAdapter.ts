// Everything portal- or wrapper-specific goes through this interface (Tech §8, CLAUDE.md rule 5).
// Selected at boot by the VITE_PLATFORM build flag (platform.ts), never by sniffing the portal.
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
  /** Called with true when an ad starts and false when it ends (AudioDirector mutes). */
  onAdChange(fn: (playing: boolean) => void): () => void;
  cloudSave?: { get(): Promise<string | null>; set(data: string): Promise<void> };
  user?(): Promise<{ id: string; name: string } | null>;
  /** Portal deep-link rules differ. */
  shareUrl(base: string): string;
  /** Analytics event (Tech §14). No personal data; may be a no-op on some portals. */
  analytics(event: string, data?: Record<string, unknown>): void;
  readonly canShowExternalLinks: boolean;
  capabilities(): PlatformCapabilities;
  /** Enters fullscreen where capabilities().fullscreen is true. */
  requestFullscreen(): Promise<void>;
}
