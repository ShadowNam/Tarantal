// D-053: Standard or HD art. The player picks on a light loading screen the first time (and
// whenever no preset is saved: Settings → Graphics "Ask on start"), with a recommendation
// pre-selected, or in Settings → Graphics. Pure functions here; the card is ui/graphicsCard.ts,
// the loading lives in main.ts and AssetManifest (loadHd, applyHd).
import type { Feel } from '../../content/schemas';
import type { AssetManifest } from './AssetManifest';
import type * as Phaser from 'phaser';
import { designSizeFor } from '../layout';

export type GraphicsMode = 'standard' | 'hd';
/** The saved setting: a remembered preset, or ask on start. */
export type GraphicsSetting = GraphicsMode | 'ask';

/** What the browser tells us about the device and its connection (each part may be unknown). */
export interface GraphicsEnv {
  /** navigator.connection.effectiveType ('slow-2g' … '4g'). */
  readonly effectiveType?: string | undefined;
  /** navigator.connection.downlink, Mbit/s (Chrome reports at most 10). */
  readonly downlinkMbps?: number | undefined;
  /** navigator.connection.saveData. */
  readonly saveData?: boolean | undefined;
  /** navigator.deviceMemory, GB (Chrome rounds; absent on Safari and Firefox). */
  readonly deviceMemory?: number | undefined;
  readonly devicePixelRatio: number;
  /** The game canvas's size in CSS px (the window, as the canvas fills it). */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** The quality tier in effect (M9). */
  readonly tier: 'low' | 'medium' | 'high';
}

/** The card's thresholds (content/client/feel.json `graphics`, Tech §10 HD pack). */
export type HdRules = Feel['graphics'];

export interface GraphicsAdvice {
  /** The option pre-selected on the card. */
  readonly pick: GraphicsMode;
  /** The HD option says "may be slow on this device" (it stays selectable). */
  readonly weak: boolean;
  /** Device px per design px on this screen (the canvas fits the design height). */
  readonly devicePxPerDesignPx: number;
}

/** Device px per design px: the canvas fits 1080 design px tall (or the clamped width) on screen. */
export function devicePxPerDesignPx(
  env: Pick<GraphicsEnv, 'devicePixelRatio' | 'cssWidth' | 'cssHeight'>,
): number {
  const design = designSizeFor(env.cssWidth, env.cssHeight);
  const fit = Math.min(env.cssWidth / design.width, env.cssHeight / design.height);
  return fit * env.devicePixelRatio;
}

/**
 * The card's recommendation: HD when the connection and the device look capable (4g, at least
 * rules.minDownlinkMbps, no Save-Data, at least rules.minDeviceMemoryGb where known, not the low
 * tier) and the screen shows the difference (more than rules.minDevicePxPerDesignPx device px per
 * design px: large and high-density screens); otherwise Standard.
 */
export function recommendGraphics(env: GraphicsEnv, rules: HdRules): GraphicsAdvice {
  const ratio = devicePxPerDesignPx(env);
  const weak =
    env.tier === 'low' ||
    (env.deviceMemory !== undefined && env.deviceMemory <= rules.weakDeviceMemoryGb);
  const fastLink =
    env.saveData !== true &&
    (env.effectiveType === undefined || env.effectiveType === '4g') &&
    (env.downlinkMbps === undefined || env.downlinkMbps >= rules.minDownlinkMbps);
  const enoughMemory =
    env.deviceMemory === undefined || env.deviceMemory >= rules.minDeviceMemoryGb;
  const shows = ratio > rules.minDevicePxPerDesignPx;
  return {
    pick: fastLink && enoughMemory && !weak && shows ? 'hd' : 'standard',
    weak,
    devicePxPerDesignPx: ratio,
  };
}

/**
 * The mode this launch starts in, or null when the card must ask: a saved preset wins; "ask"
 * (or nothing saved) asks. `forced` is a test build's ?graphics=standard|hd.
 */
export function startMode(
  setting: GraphicsSetting,
  forced: GraphicsMode | null = null,
): GraphicsMode | null {
  if (forced !== null) return forced;
  return setting === 'ask' ? null : setting;
}

/**
 * Whether the loading screen may show the Graphics card: every real build (not capture mode);
 * a test build (?e2e=1, the hooks) only with ?graphics=card, so specs that don't ask boot
 * straight to the title in Standard, even with a fresh profile.
 */
export function cardAllowed(o: {
  readonly testHooks: boolean;
  readonly capture: boolean;
  /** A test build's ?graphics= value (null when absent). */
  readonly param: string | null;
}): boolean {
  return !o.capture && (!o.testHooks || o.param === 'card');
}

/** The setting saved after the card: the choice when "Remember my choice" is ticked, else ask. */
export function settingAfterCard(choice: GraphicsMode, remember: boolean): GraphicsSetting {
  return remember ? choice : 'ask';
}

/** "12.3 MB" style size for the card and the loading bar (1 decimal below 100 MB). */
export function megabytes(bytes: number): number {
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10;
}

/** The browser's hints, read defensively (every part is optional and may throw nowhere). */
export function readGraphicsEnv(tier: GraphicsEnv['tier']): GraphicsEnv {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
    deviceMemory?: number;
  };
  const c = nav.connection;
  return {
    effectiveType: c?.effectiveType,
    downlinkMbps: typeof c?.downlink === 'number' && c.downlink > 0 ? c.downlink : undefined,
    saveData: c?.saveData,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    devicePixelRatio: window.devicePixelRatio || 1,
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    tier,
  };
}

/** What scenes use (GameContext.graphics): the mode in effect and the HD pack per area. */
export interface GraphicsControl {
  /** True while HD art is chosen for this session. */
  readonly hd: boolean;
  /** The saved setting (Settings → Graphics). */
  readonly setting: GraphicsSetting;
  /**
   * Bytes of the area's HD files not yet loaded that its hunt waits for (common-hd and the
   * area's -hd): the card's MB and the HD loading screen's total.
   */
  hdBytes(biomeId: string): number;
  /** Starts (or joins) loading the area's HD pack; resolves when the files before its hunt settle. */
  loadHd(biomeId: string): Promise<void>;
  /** Loading progress of the area's HD files before its hunt. */
  progress(biomeId: string): { readonly done: number; readonly total: number };
  /** True when the area's HD files before its hunt are in (or HD is off). */
  ready(biomeId: string): boolean;
  /** "Play now in Standard" was pressed for the area: its hunts no longer wait for HD. */
  skip(biomeId: string): void;
  skipped(biomeId: string): boolean;
  /** Loads the area's HD pack in the background (title, tally) when HD is chosen. */
  preload(biomeId: string): void;
  /**
   * Puts the HD files that landed since under the manifest's keys (renamed, never removed:
   * D-046). Returns true when anything changed. A no-op until the HD runtime chunk has loaded.
   */
  apply(manifest: AssetManifest, textures: Phaser.Textures.TextureManager): boolean;
  /**
   * While views live and Standard is chosen (Settings on the title, then a hunt that keeps the
   * views): Standard art back under every key, objects off the swapped-out HD images, the HD pack
   * forgotten, and the swapped-out textures freed once nothing draws them. Run every few frames;
   * returns true when art changed (views watching hdEpoch refresh). No-op while HD is chosen.
   */
  settle(
    scenes: readonly Phaser.Scene[],
    textures: Phaser.Textures.TextureManager,
    inUse: () => ReadonlySet<string>,
    anims?: Phaser.Animations.AnimationManager,
  ): boolean;
  /**
   * At a scene change (nothing of the old views is drawn): every manifest takes the mode in
   * effect (HD in, or Standard back and the HD pack forgotten), and swapped-out textures nothing
   * draws are freed. `inUse` lists the texture keys still drawn (textureUse.ts).
   */
  sync(
    textures: Phaser.Textures.TextureManager,
    inUse: () => ReadonlySet<string>,
    anims?: Phaser.Animations.AnimationManager,
  ): void;
}
