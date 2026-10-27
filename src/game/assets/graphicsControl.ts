// D-053: the GraphicsControl scenes use (GameContext.graphics), made by main.ts. Apart from
// main.ts so its failure paths are unit-tested: an HD runtime or index that can't load (offline,
// 404, an old lazy chunk gone after a deploy) leaves the area on Standard instead of waiting
// for HD forever, and a file that fails is tried again at most once per scene change.
import type { Biome } from '../../content/schemas';
import type { AssetManifest } from './AssetManifest';
import type { AssetIndex } from './assetIndex';
import type { GraphicsControl, GraphicsMode, GraphicsSetting } from './graphicsChoice';
import type * as HdRuntime from './hdRuntime';

/** The part of the HD runtime chunk (hdRuntime.ts) the control calls. */
export type HdRuntimeApi = Pick<
  typeof HdRuntime,
  'hdFiles' | 'loadHd' | 'applyHd' | 'dropHd' | 'purgeRetired' | 'retiredPending' | 'repointRetired'
>;

export interface GraphicsDeps {
  /** The mode in effect (Standard or HD). */
  mode(): GraphicsMode;
  /** The saved setting. */
  setting(): GraphicsSetting;
  /** The asset index now (with its HD half once the runtime has loaded), or null. */
  index(): AssetIndex | null;
  biome(id: string): Biome | undefined;
  manifestFor(b: Biome): AssetManifest;
  manifests(): Iterable<AssetManifest>;
  /** The area's standard art is in (its manifest exists and loaded). */
  artReady(id: string): boolean;
  /** The area's delivered files have settled (preload only then). */
  finalDone(id: string): boolean;
  /** The HD runtime and the HD index, loaded once; null when either can't load. */
  ensureRuntime(): Promise<HdRuntimeApi | null>;
  /** The runtime if it has loaded, else null (no HD file was ever loaded then). */
  runtime(): HdRuntimeApi | null;
  /** Per-file timeout (feel.assets.fileTimeoutMs). */
  readonly fileTimeoutMs: number;
}

/** The control, plus `available()`: false once the HD runtime or index failed to load. */
export function createGraphicsControl(d: GraphicsDeps): GraphicsControl & { available(): boolean } {
  const skipped = new Set<string>();
  /** Areas whose HD load was started since the last scene change (one try each, item 4). */
  const tried = new Set<string>();
  let unavailable = false;
  const g: GraphicsControl & { available(): boolean } = {
    get hd() {
      return d.mode() === 'hd' && d.index() !== null;
    },
    get setting() {
      return d.setting();
    },
    available() {
      return !unavailable;
    },
    hdBytes(id) {
      const b = d.biome(id);
      const index = d.index();
      const rt = d.runtime();
      if (b === undefined || index === null || rt === null || !d.artReady(id)) return 0;
      // The files this choice downloads before the hunt (common-hd and the area's -hd): the
      // same total the HD loading screen counts. late-hd and ver-hd load later, during play.
      return rt.hdFiles(d.manifestFor(b), index, b.id, true).now.reduce((a, x) => a + x.bytes, 0);
    },
    async loadHd(id) {
      const b = d.biome(id);
      if (b === undefined || d.index() === null || !g.hd || !d.artReady(id)) return;
      tried.add(id);
      const rt = await d.ensureRuntime();
      // The index may have been fetched again meanwhile (ensureArt): read it now.
      const index = d.index();
      if (rt === null || index === null) {
        // No HD to load (offline, a 404, an old chunk gone): the area plays in Standard, its
        // hunts don't wait for HD.
        unavailable = true;
        skipped.add(id);
        return;
      }
      const m = d.manifestFor(b);
      m.setHd(true);
      await rt.loadHd(m, index, { timeoutMs: d.fileTimeoutMs, biome: b.id }).now;
    },
    progress(id) {
      const b = d.biome(id);
      return b === undefined || !d.artReady(id)
        ? { done: 0, total: 0 }
        : d.manifestFor(b).hdProgress();
    },
    ready(id) {
      const b = d.biome(id);
      if (!g.hd || b === undefined || skipped.has(id)) return true;
      return d.artReady(id) && d.manifestFor(b).hdReady;
    },
    skip(id) {
      skipped.add(id);
    },
    skipped(id) {
      return skipped.has(id);
    },
    preload(id) {
      // At most one try per scene change: a file that fails isn't fetched again every 30 frames.
      if (!g.hd || unavailable || tried.has(id) || !d.artReady(id) || !d.finalDone(id)) return;
      void g.loadHd(id);
    },
    apply(m, textures) {
      return d.runtime()?.applyHd(m, textures) ?? false;
    },
    settle(scenes, textures, inUse, anims) {
      const rt = d.runtime();
      if (rt === null || g.hd) return false;
      const all = [...d.manifests()];
      let changed = false;
      for (const m of all) changed = rt.applyHd(m, textures) || changed;
      rt.repointRetired(scenes, textures, all);
      for (const m of all) rt.dropHd(m);
      if (rt.retiredPending()) rt.purgeRetired(textures, inUse(), anims);
      return changed;
    },
    sync(textures, inUse, anims) {
      tried.clear();
      const hd = g.hd;
      for (const m of d.manifests()) m.setHd(hd);
      // Without the HD runtime no HD file was ever loaded: nothing to swap, retire or free.
      const rt = d.runtime();
      if (rt === null) return;
      for (const m of d.manifests()) {
        rt.applyHd(m, textures);
        if (!hd) rt.dropHd(m);
      }
      rt.purgeRetired(textures, inUse(), anims);
    },
  };
  return g;
}
