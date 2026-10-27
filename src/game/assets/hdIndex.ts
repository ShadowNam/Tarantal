// D-053: the HD half of the asset index (asset-index-hd.json): each entry's `hd` part by the same
// keys. assets:pack splits it off (the first download's index stays as it was); the game merges
// it back in only when the Graphics card shows or HD is chosen (hdRuntime.ts), the tools always
// (tools/assets/fullIndex.ts).
import { z } from 'zod';
import {
  atlasRef,
  hdImage,
  hdLayer,
  type AssetIndex,
  type AtlasRef,
  type BirdPlaneEntry,
} from './assetIndex';

/** D-053: the `hd` parts of an index's entries, by the same keys. */
export const hdIndexSchema = z.object({
  version: z.literal(1),
  images: z.record(z.string(), hdImage),
  layers: z.record(z.string(), hdLayer),
  birds: z.record(z.string(), z.partialRecord(z.enum(['near', 'mid', 'far']), atlasRef)),
  guns: z.record(z.string(), atlasRef),
});
export type HdIndex = z.infer<typeof hdIndexSchema>;

/** D-053: the index without its `hd` parts, and those parts on their own (assets:pack). */
export function splitHdIndex(index: AssetIndex): { index: AssetIndex; hd: HdIndex } {
  const hd: HdIndex = { version: 1, images: {}, layers: {}, birds: {}, guns: {} };
  const images: AssetIndex['images'] = {};
  for (const [k, e] of Object.entries(index.images)) {
    const { hd: h, ...rest } = e;
    images[k] = rest;
    if (h !== undefined) hd.images[k] = h;
  }
  const layers: AssetIndex['layers'] = {};
  for (const [k, e] of Object.entries(index.layers)) {
    const { hd: h, ...rest } = e;
    layers[k] = rest;
    if (h !== undefined) hd.layers[k] = h;
  }
  const birds: AssetIndex['birds'] = {};
  for (const [c, planes] of Object.entries(index.birds)) {
    const out: AssetIndex['birds'][string] = {};
    for (const [p, e] of Object.entries(planes) as [keyof typeof planes, BirdPlaneEntry][]) {
      const { hd: h, ...rest } = e;
      out[p] = rest;
      if (h !== undefined) (hd.birds[c] ??= {})[p] = h;
    }
    birds[c] = out;
  }
  const guns: AssetIndex['guns'] = {};
  for (const [k, e] of Object.entries(index.guns)) {
    const { hd: h, ...rest } = e;
    guns[k] = rest;
    if (h !== undefined) hd.guns[k] = h;
  }
  return { index: { ...index, images, layers, birds, guns }, hd };
}

/** D-053: the index with the HD parts put back on its entries (keys it lacks are ignored). */
export function mergeHdIndex(index: AssetIndex, hd: HdIndex): AssetIndex {
  const images = { ...index.images };
  for (const [k, h] of Object.entries(hd.images)) {
    const e = images[k];
    if (e !== undefined) images[k] = { ...e, hd: h };
  }
  const layers = { ...index.layers };
  for (const [k, h] of Object.entries(hd.layers)) {
    const e = layers[k];
    if (e !== undefined) layers[k] = { ...e, hd: h };
  }
  const birds = { ...index.birds };
  for (const [c, planes] of Object.entries(hd.birds)) {
    const now = birds[c];
    if (now === undefined) continue;
    const out = { ...now };
    for (const [p, h] of Object.entries(planes) as [keyof typeof planes, AtlasRef][]) {
      const e = out[p];
      if (e !== undefined) out[p] = { ...e, hd: h };
    }
    birds[c] = out;
  }
  const guns = { ...index.guns };
  for (const [k, h] of Object.entries(hd.guns)) {
    const e = guns[k];
    if (e !== undefined) guns[k] = { ...e, hd: h };
  }
  return { ...index, images, layers, birds, guns };
}

/** D-053: parses the HD half of an index (null when invalid). */
export function parseHdIndex(raw: unknown): HdIndex | null {
  const r = hdIndexSchema.safeParse(raw);
  return r.success ? r.data : null;
}
