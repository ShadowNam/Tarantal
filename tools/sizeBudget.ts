// Which built files the first playable hunt needs (M9 size budget, Tech §8/§15). From Vite's
// build manifest: the entry chunk and everything it imports statically (plus its CSS and
// assets), index.html, and every non-chunk file (icons, manifest, service worker) are
// "initial"; chunks reached only through dynamic import() (lazy biome bundles) are "lazy".
// M10: final art and audio in the asset index load with their group, so files of groups outside
// the index's `initialGroups` (the non-home biomes) are lazy too.

import { indexFiles, type AssetIndex } from '../src/game/assets/assetIndex';

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
}

/** Files are dist-relative posix paths; build metadata under `.vite/` is ignored. */
export function splitInitialLazy(
  manifest: ViteManifest,
  files: readonly string[],
  /** Asset-index files that load with a non-initial group (lazyAssetFiles). */
  lazyAssets: ReadonlySet<string> = new Set(),
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
  return {
    initial: keep.filter((f) => !isLazy(f)),
    lazy: keep.filter(isLazy),
  };
}

/** Files of an asset index whose group is not in its initialGroups (dist-relative paths). */
export function lazyAssetFiles(index: AssetIndex): Set<string> {
  const initial = new Set(index.initialGroups);
  return new Set(
    indexFiles(index)
      .filter((f) => !initial.has(f.group))
      .map((f) => f.path),
  );
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
