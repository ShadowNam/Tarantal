// Which built files the first playable hunt needs (M9 size budget, Tech §8/§15). From Vite's
// build manifest: the entry chunk and everything it imports statically (plus its CSS and
// assets), index.html, and every non-chunk file (icons, manifest, service worker) are
// "initial"; chunks reached only through dynamic import() (lazy biome bundles) are "lazy".
// M10: final art and audio in the asset index load with their group, so files of groups outside
// the index's `initialGroups` (the non-home biomes) are lazy too.

import { HD_INDEX_PATH, indexFiles, type AssetIndex } from '../src/game/assets/assetIndex';

/** The part of Vite's .vite/manifest.json this needs. */
export interface ViteManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly css?: readonly string[];
  readonly assets?: readonly string[];
}
export type ViteManifest = Readonly<Record<string, ViteManifestEntry>>;

export interface SizeSplit {
  readonly initial: readonly string[];
  readonly lazy: readonly string[];
  /** Delivered twins not counted (the other audio format, the other atlas set). */
  readonly alternate: readonly string[];
}

/** Files are dist-relative posix paths; build metadata under `.vite/` is ignored. */
export function splitInitialLazy(
  manifest: ViteManifest,
  files: readonly string[],
  /** Asset-index files that load with a non-initial group (lazyAssetFiles). */
  lazyAssets: ReadonlySet<string> = new Set(),
  /** Twins a browser never downloads (alternateAssetFiles): reported apart, not counted. */
  alternates: ReadonlySet<string> = new Set(),
): SizeSplit {
  const initial = new Set<string>();
  const visit = (key: string): void => {
    const e = manifest[key];
    if (e === undefined || initial.has(e.file)) return;
    initial.add(e.file);
    for (const f of [...(e.css ?? []), ...(e.assets ?? [])]) initial.add(f);
    for (const k of e.imports ?? []) visit(k);
  };
  for (const [key, e] of Object.entries(manifest)) if (e.isEntry === true) visit(key);
  const chunkFiles = new Set(Object.values(manifest).map((e) => e.file));
  const keep = files.filter((f) => !f.startsWith('.vite/'));
  const isLazy = (f: string): boolean =>
    lazyAssets.has(f) || (chunkFiles.has(f) && !initial.has(f));
  const counted = keep.filter((f) => !alternates.has(f));
  return {
    initial: counted.filter((f) => !isLazy(f)),
    lazy: counted.filter(isLazy),
    alternate: keep.filter((f) => alternates.has(f)),
  };
}

/** Files of an asset index whose group is not in its initialGroups (dist-relative paths). */
export function lazyAssetFiles(index: AssetIndex): Set<string> {
  const initial = new Set(index.initialGroups);
  return new Set([
    ...indexFiles(index)
      .filter((f) => !initial.has(f.group))
      .map((f) => f.path),
    // D-053: the HD half of the index is fetched only when the card shows or HD is chosen (never
    // precached: a Standard player doesn't download it).
    HD_INDEX_PATH,
  ]);
}

/**
 * Files a browser never downloads alongside their twin (dist-relative): the smaller of each
 * Ogg/MP3 pair (a browser plays one) and the @1x bird and gun pages where @2x exists (a tier loads one
 * set). The budget counts the larger twin, the worst case one player downloads.
 */
export function alternateAssetFiles(index: AssetIndex): Set<string> {
  const alt = new Set<string>();
  for (const e of Object.values(index.audio))
    alt.add(e.ogg.bytes >= e.mp3.bytes ? e.mp3.path : e.ogg.path);
  const rigs = [
    ...Object.values(index.birds).flatMap((planes) => Object.values(planes)),
    ...Object.values(index.guns),
  ];
  for (const e of rigs) {
    if (e.x2 === undefined) continue;
    for (const p of e.x1.pages) {
      alt.add(p.image.path);
      alt.add(p.data.path);
    }
  }
  return alt;
}

/** Audio files of an index (the service worker caches them on first play, not up front). */
export function audioFiles(index: AssetIndex): Set<string> {
  return new Set(Object.values(index.audio).flatMap((e) => [e.ogg.path, e.mp3.path]));
}

export const MB = 1024 * 1024;
export const BUDGET_BYTES = 5 * MB;
export const HARD_FAIL_BYTES = 8 * MB;

export type Verdict = 'ok' | 'over-budget' | 'hard-fail';

/** Initial gzip bytes → verdict. Over 8 MB always fails; over 5 MB fails only with `strict`. */
export function verdict(initialGzip: number): Verdict {
  if (initialGzip > HARD_FAIL_BYTES) return 'hard-fail';
  if (initialGzip > BUDGET_BYTES) return 'over-budget';
  return 'ok';
}

/** v1.1 (D-032): each lazy chunk (a non-home biome, the `late` group) stays ≤ 1.5 MB gzip
 *  (Tech §15; long-range plan: "each lazy biome chunk ≤ 1.5 MB"). */
export const LAZY_CHUNK_BYTES = 1.5 * MB;

/** D-053: each HD group (`<group>-hd`, the optional HD pack) stays ≤ 4 MB gzip. */
export const HD_CHUNK_BYTES = 4 * MB;

/**
 * Lazy files by the chunk they load with: asset files by their group folder
 * (`assets/<group>/…`), a code chunk by the group its name starts (`bushveld-…js` →
 * bushveld-winter). Anything else is `other`.
 */
export function lazyGroups(
  lazy: readonly string[],
  groups: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (g: string, f: string): void => {
    out.set(g, [...(out.get(g) ?? []), f]);
  };
  for (const f of lazy) {
    const parts = f.split('/');
    const dir = parts.length > 2 && parts[0] === 'assets' ? parts[1] : undefined;
    if (dir !== undefined && groups.includes(dir)) {
      add(dir, f);
      continue;
    }
    const name = parts[parts.length - 1] ?? '';
    const g = groups.find((id) => name.startsWith(`${id.split('-')[0] ?? id}-`));
    add(g ?? 'other', f);
  }
  return out;
}
