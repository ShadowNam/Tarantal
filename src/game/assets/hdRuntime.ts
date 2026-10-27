// D-053: the HD pack's runtime, in its own lazy chunk (the first download carries none of it):
// which HD files an area needs, loading them, swapping HD in or Standard back under each key,
// forgetting HD, and freeing swapped-out textures nothing draws. Imported by main.ts when the
// Graphics card shows or HD is chosen.
import type * as Phaser from 'phaser';
import type { PlaneId } from '../../sim/types';
import {
  backgroundGroup,
  birdKey,
  groupForBiome,
  gunKey,
  hdSources,
  hdUnderKey,
  retiredTextures,
  type AssetManifest,
  type HdFile,
  type HdFiles,
} from './AssetManifest';
import {
  HD_INDEX_PATH,
  type AssetIndex,
  type AtlasRef,
  type BirdPlaneEntry,
  type FileRef,
} from './assetIndex';
import { mergeHdIndex, parseHdIndex, type HdIndex } from './hdIndex';
import { texturesInUse } from './textureUse';
import { checkAtlas, checkBirdAtlas } from './atlasCheck';
import { forgetImage, loadImage, loadJson, withTimeout } from './finalLoader';
import { hdGroupOf } from './hdPack';

let retiredCount = 0;

/**
 * D-053: removes the retired textures (renamed Standard or HD images, HD tiles and atlases left
 * behind) that no object draws any more. `inUse` lists the texture keys drawn now (textureUse.ts).
 * Returns the removed keys.
 */
export function purgeRetired(
  textures: Phaser.Textures.TextureManager,
  inUse: ReadonlySet<string>,
  anims?: Phaser.Animations.AnimationManager,
): string[] {
  const out: string[] = [];
  for (const key of retiredTextures) {
    if (inUse.has(key)) continue;
    retiredTextures.delete(key);
    if (!textures.exists(key)) continue;
    // Animations made from a retired atlas go with it (BirdView and WeaponView remake them).
    if (anims !== undefined) for (const a of anims.getAnimsFromTexture(key)) anims.remove(a);
    textures.remove(key);
    out.push(key);
  }
  return out;
}

/**
 * The HD files this manifest's keys have in `index`, split into the ones a hunt waits for
 * (common, the biome, desert) and the background ones (late, Ver); files already loaded are
 * left out when `missingOnly`.
 */
export function hdFiles(
  m: AssetManifest,
  index: AssetIndex,
  biome: string | undefined,
  missingOnly = false,
): HdFiles {
  const now: HdFile[] = [];
  const background: HdFile[] = [];
  const seen = new Set<string>();
  const add = (group: string, f: FileRef, loaded: boolean): void => {
    if (!groupForBiome(group, biome) || seen.has(f.path) || (missingOnly && loaded)) return;
    seen.add(f.path);
    const file = { path: f.path, bytes: f.bytes, group: hdGroupOf(group) };
    (backgroundGroup(group) ? background : now).push(file);
  };
  const pages = (group: string, a: AtlasRef, loaded: boolean): void => {
    for (const pg of a.pages) {
      add(group, pg.image, loaded);
      add(group, pg.data, loaded);
    }
  };
  for (const [key, e] of Object.entries(index.images))
    if (e.hd !== undefined && m.specs.has(key) && !m.layerOfTile.has(key))
      add(e.group, e.hd.file, m.hdImages.has(key));
  for (const [id, e] of Object.entries(index.layers))
    if (e.hd !== undefined && m.layerArt.has(id))
      for (const t of e.hd.tiles) add(e.group, t, m.hdLayers.has(id));
  for (const [creature, planes] of Object.entries(index.birds))
    for (const [plane, e] of Object.entries(planes) as [PlaneId, BirdPlaneEntry][])
      if (e.hd !== undefined && m.specs.has(birdKey(creature, plane, 'stand')))
        pages(e.group, e.hd, m.hdBirds.has(`${creature}/${plane}`));
  for (const [id, e] of Object.entries(index.guns))
    if (e.hd !== undefined && m.specs.has(gunKey(id))) pages(e.group, e.hd, m.hdGuns.has(id));
  return { now, background };
}

/**
 * Loads this manifest's HD files (`now` first, then the background ones). Never rejects: a
 * file that fails leaves its key on the standard art (a later call tries it again). Repeated
 * calls share one load. Progress: hdProgress().
 */
export function loadHd(
  m: AssetManifest,
  index: AssetIndex,
  o: { readonly timeoutMs: number; readonly biome?: string },
): { readonly now: Promise<void>; readonly all: Promise<void> } {
  if (m.hdLoading !== null) return m.hdLoading;
  /**
   * This load, once made. A file that lands after dropHd() (Standard chosen meanwhile) is let go:
   * it must not put the HD pack back into the manifest.
   */
  let loading: { readonly now: Promise<void>; readonly all: Promise<void> } | null = null;
  const live = (): boolean => loading !== null && m.hdLoading === loading;
  const now: (() => Promise<void>)[] = [];
  const later: (() => Promise<void>)[] = [];
  const files = hdFiles(m, index, o.biome, true);
  const total = files.now.reduce((a, f) => a + f.bytes, 0);
  m.hdBytes = { done: 0, total, settled: false };
  const nowPaths = new Set(files.now.map((f) => f.path));
  const counted = (path: string, bytes: number): void => {
    if (nowPaths.delete(path)) m.hdBytes.done += bytes;
  };
  const image = (f: FileRef): Promise<HTMLImageElement | null> =>
    loadImage(f.path, o.timeoutMs).then((img) => {
      counted(f.path, f.bytes);
      if (img !== null) hdSources.add(img);
      return img;
    });
  const json = (f: FileRef): Promise<unknown> =>
    loadJson(f.path, o.timeoutMs).then((d) => {
      counted(f.path, f.bytes);
      return d;
    });
  const queue = (group: string, job: () => Promise<void>): void => {
    if (!groupForBiome(group, o.biome)) return;
    (backgroundGroup(group) ? later : now).push(job);
  };
  for (const [key, entry] of Object.entries(index.images)) {
    const hd = entry.hd;
    const std = m.finalImages.get(key);
    if (hd === undefined || m.hdImages.has(key) || !m.specs.has(key)) continue;
    if (m.layerOfTile.has(key)) continue;
    queue(entry.group, () =>
      image(hd.file).then((img) => {
        // HD only on top of a standard file that loaded (it is what Standard falls back to).
        if (!live() || img === null || (std ?? m.finalImages.get(key)) === undefined) return;
        m.hdImages.set(key, { img, entry: hd, std: entry.scale ?? 1, path: hd.file.path });
      }),
    );
  }
  for (const [id, entry] of Object.entries(index.layers)) {
    const hd = entry.hd;
    if (hd === undefined || m.hdLayers.has(id) || !m.layerArt.has(id)) continue;
    queue(entry.group, () =>
      Promise.all(hd.tiles.map((t) => image(t))).then((imgs) => {
        if (!live() || imgs.some((i) => i === null)) return;
        const tiles = imgs.map((img, i) => ({
          key: `final:layer/${id}/hd/${i}`,
          // Safe: the line above returned if any image is null.
          img: img as HTMLImageElement,
          path: hd.tiles[i]?.path ?? '',
        }));
        m.hdLayers.set(id, {
          tiles,
          art: {
            tiles: tiles.map((t) => t.key),
            tileWidth: hd.tileWidth,
            left: entry.left,
            top: entry.top,
            scale: hd.scale,
            // The standard profile: its rows and buckets are design px from the art's top.
            ...(entry.solid === undefined ? {} : { solid: entry.solid, solidDesignPx: true }),
          },
        });
      }),
    );
  }
  const atlas = (
    a: AtlasRef,
    check: (data: object[]) => boolean,
    done: (img: HTMLImageElement[], data: object[], paths: string[]) => void,
  ): Promise<void> =>
    Promise.all(a.pages.map((pg) => Promise.all([image(pg.image), json(pg.data)]))).then(
      (pages) => {
        const imgs: HTMLImageElement[] = [];
        const data: object[] = [];
        for (const [img, d] of pages) {
          if (img === null || typeof d !== 'object' || d === null) return;
          imgs.push(img);
          data.push(d);
        }
        if (check(data))
          done(
            imgs,
            data,
            a.pages.map((pg) => pg.image.path),
          );
      },
    );
  for (const [creature, planes] of Object.entries(index.birds))
    for (const [plane, entry] of Object.entries(planes) as [PlaneId, BirdPlaneEntry][]) {
      const hd = entry.hd;
      const id = `${creature}/${plane}`;
      if (hd === undefined || m.hdBirds.has(id)) continue;
      if (!m.specs.has(birdKey(creature, plane, 'stand'))) continue;
      queue(entry.group, () =>
        atlas(
          hd,
          // The same clips as the standard atlas, every frame present.
          (data) => checkBirdAtlas(entry.clips, data).dropped.length === 0,
          (img, data, paths) => {
            const std = m.finalBirds.get(id);
            if (!live() || std === undefined) return;
            m.hdBirds.set(id, {
              atlasKey: `final:bird/${id}@hd`,
              entry: std.entry,
              scale: entry.scale / 2,
              hd: true,
              img,
              data,
              paths,
            });
          },
        ),
      );
    }
  for (const [id, entry] of Object.entries(index.guns)) {
    const hd = entry.hd;
    if (hd === undefined || m.hdGuns.has(id) || !m.specs.has(gunKey(id))) continue;
    queue(entry.group, () =>
      atlas(
        hd,
        (data) => checkAtlas(entry.clips, data).dropped.length === 0,
        (img, data, paths) => {
          const std = m.finalGuns.get(id);
          if (!live() || std === undefined) return;
          m.hdGuns.set(id, {
            atlasKey: `final:gun/${id}@hd`,
            entry: std.entry,
            scale: 0.5,
            hd: true,
            img,
            data,
            paths,
          });
        },
      ),
    );
  }
  const first = Promise.all(now.map((job) => job())).then(() => {
    m.hdBytes.done = m.hdBytes.total;
    m.hdBytes.settled = true;
  });
  const all = first
    .then(() => Promise.all(later.map((job) => job())))
    .then(() => {
      // Something failed: the next call tries the missing files again.
      if (live() && hdFiles(m, index, o.biome, true).now.length > 0) m.hdLoading = null;
    });
  loading = { now: first, all };
  m.hdLoading = loading;
  return loading;
}

/**
 * Puts the chosen art under each key: HD textures in (the standard one renamed away, never
 * removed under an object that draws it: D-046), or, with Standard, the standard ones back.
 * Swapped-out textures are retired: purgeRetired() frees them once nothing draws them (at the
 * next scene change). Views pick the new art up when they next set the key, or at once when
 * they watch hdEpoch. Returns true when anything changed.
 */
export function applyHd(m: AssetManifest, textures: Phaser.Textures.TextureManager): boolean {
  let changed = false;
  for (const [key, hd] of m.hdImages) {
    if (!textures.exists(key)) continue;
    const src = textures.get(key).getSourceImage();
    const std = m.finalImages.get(key);
    if (m.hdWanted && src !== hd.img) {
      retire(textures, key);
      m.addHdImage(textures, key, hd);
      changed = true;
    } else if (!m.hdWanted && src === hd.img && std !== undefined) {
      retire(textures, key);
      textures.addImage(key, std.img);
      hdUnderKey.delete(key);
      changed = true;
    }
  }
  if (m.hdWanted) changed = m.installHdTiles(textures) || changed;
  else {
    for (const id of m.hdTilesIn) {
      for (const t of m.hdLayers.get(id)?.tiles ?? []) retiredTextures.add(t.key);
      changed = true;
    }
    m.hdTilesIn.clear();
    for (const b of [...m.hdBirds.values(), ...m.hdGuns.values()])
      if (textures.exists(b.atlasKey)) {
        retiredTextures.add(b.atlasKey);
        changed = true;
      }
  }
  if (changed) m.hdEpoch++;
  return changed;
}

/**
 * Back to Standard for good: forgets the decoded HD images (the textures go with applyHd and
 * purgeRetired), so nothing of the HD pack stays in memory. A later loadHd fetches them again.
 */
export function dropHd(m: AssetManifest): void {
  m.hdWanted = false;
  for (const h of m.hdImages.values()) forgetImage(h.path);
  for (const l of m.hdLayers.values()) for (const t of l.tiles) forgetImage(t.path);
  for (const b of [...m.hdBirds.values(), ...m.hdGuns.values()])
    for (const p of b.paths) forgetImage(p);
  m.hdImages.clear();
  m.hdLayers.clear();
  m.hdBirds.clear();
  m.hdGuns.clear();
  m.hdLoading = null;
  m.hdBytes = { done: 0, total: 0, settled: false };
}

/** True while swapped-out textures wait for purgeRetired(). */
export function retiredPending(): boolean {
  return retiredTextures.size > 0;
}

interface Pointed {
  readonly texture?: { readonly key: string };
  readonly frame?: { readonly name: string };
  readonly list?: readonly unknown[];
  setTexture?: (key: string, frame?: string) => unknown;
}

/**
 * Standard back while views live (Settings on the title; the hunt starts without rebuilding
 * them): every object still drawing a retired image moves to the image now under its key, same
 * frame. Its on-screen size doesn't change: an HD image's frames report the standard size
 * (hdTexture.ts). Props and far animals (`viewScaled`: their view sets the scale) are left to
 * ParallaxView.refreshHd(). Bird and gun atlases aren't renamed: their views switch by key.
 * Returns how many objects moved.
 */
export function repointRetired(
  scenes: readonly Phaser.Scene[],
  textures: Phaser.Textures.TextureManager,
  manifests: readonly AssetManifest[],
): number {
  let moved = 0;
  const visit = (o: unknown): void => {
    if (o === null || typeof o !== 'object') return;
    const d = o as Pointed;
    if (Array.isArray(d.list)) for (const c of d.list) visit(c);
    const key = d.texture?.key;
    const base = key === undefined ? null : /^(.*)#retired-\d+$/.exec(key)?.[1];
    if (base === undefined || base === null || d.setTexture === undefined) return;
    if (!textures.exists(base) || manifests.some((m) => m.specs.get(base)?.viewScaled === true))
      return;
    const frame = d.frame?.name;
    d.setTexture.call(
      o,
      base,
      frame !== undefined && textures.get(base).has(frame) ? frame : undefined,
    );
    moved++;
  };
  for (const scene of scenes) for (const o of scene.children.list) visit(o);
  return moved;
}

/** Renames the texture under `key` out of the way and marks it for purgeRetired(). */
function retire(textures: Phaser.Textures.TextureManager, key: string): void {
  const name = `${key}#retired-${++retiredCount}`;
  textures.renameTexture(key, name);
  retiredTextures.add(name);
}

/**
 * D-053: the HD half of the index (only fetched when the Graphics card shows or HD is chosen);
 * null when it is absent or unreadable (HD then has nothing to load).
 */
export async function fetchHdIndex(timeoutMs: number): Promise<HdIndex | null> {
  const get = async (): Promise<HdIndex | null> => {
    try {
      const res = await fetch(HD_INDEX_PATH, { cache: 'no-cache' });
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('html')) return null;
      return parseHdIndex(JSON.parse(await res.text()));
    } catch {
      return null;
    }
  };
  return withTimeout(get(), timeoutMs, null);
}

export { mergeHdIndex, texturesInUse, type HdIndex };
