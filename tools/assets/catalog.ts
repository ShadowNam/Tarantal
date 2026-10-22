// Every manifest key the game can ask for (M10), built in Node from the same placeholder manifests
// the game builds at runtime (one per playable biome). The pack tool checks deliveries against it;
// the asset audit lists it. Placeholder draw functions are never called here.
import type { ContentBundle } from '../../src/content/schemas';
import type { PlaneId } from '../../src/sim/types';
import { coreWidth, LAYER_BLEED_PX } from '../../src/sim/world';
import { COMMON_GROUP } from '../../src/game/assets/assetIndex';
import type { AssetKind } from '../../src/game/assets/AssetManifest';
import {
  createPlaceholderManifest,
  loadBiomeArt,
  placeholderBiomes,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import { allBarkLines } from '../../src/game/audio/barks';
import { loadFeel } from '../testContent';

export interface CatalogEntry {
  readonly key: string;
  readonly kind: AssetKind;
  /** `common`, or the one biome that uses it (loads with that biome). */
  readonly group: string;
  /** Biomes whose manifest has this key. */
  readonly biomes: readonly string[];
  /** Textures: the placeholder's size in texture px (a delivered image must match). */
  readonly width?: number;
  readonly height?: number;
}

export interface LayerSpec {
  readonly assetId: string;
  readonly biome: string;
  readonly layerId: string;
  readonly scrollFactor: number;
  /** Full delivered width: core + bleed on both sides (art bible §4.1). */
  readonly width: number;
  readonly left: number;
  /** The placeholder band: top edge and height in design px. */
  readonly top: number;
  readonly height: number;
}

export interface Catalog {
  readonly homeBiome: string;
  readonly biomes: readonly string[];
  readonly entries: ReadonlyMap<string, CatalogEntry>;
  readonly layers: ReadonlyMap<string, LayerSpec>;
  /** creature → planes it has placeholder frames on. */
  readonly birds: ReadonlyMap<string, readonly PlaneId[]>;
}

export async function buildCatalog(content: ContentBundle): Promise<Catalog> {
  const ids = placeholderBiomes();
  // v1.0.1 (D-028 §3): Oupa's barks are common voice keys (feel.json barks lines).
  const barkLines = allBarkLines(loadFeel().barks);
  const entries = new Map<string, CatalogEntry>();
  const layers = new Map<string, LayerSpec>();
  const birds = new Map<string, PlaneId[]>();
  for (const id of ids) {
    const biome = content.biomes.find((b) => b.id === id);
    if (biome === undefined || !(await loadBiomeArt(id))) continue;
    const m = createPlaceholderManifest(content, biome, barkLines);
    for (const e of m.entries()) {
      const prev = entries.get(e.key);
      const biomes = [...(prev?.biomes ?? []), id];
      const size = e.kind === 'texture' ? m.size(e.key) : null;
      entries.set(e.key, {
        key: e.key,
        kind: e.kind,
        group: biomes.length === 1 ? id : COMMON_GROUP,
        biomes,
        ...(size === null ? {} : size),
      });
      if (e.kind === 'bird') {
        const [, creature, plane] = e.key.split('/') as [string, string, PlaneId];
        const planes = birds.get(creature) ?? [];
        if (!planes.includes(plane)) planes.push(plane);
        birds.set(creature, planes);
      }
    }
    for (const layer of biome.layers) {
      const art = m.layer(layer.asset);
      const first = art?.tiles[0];
      const tile = first === undefined ? null : m.size(first);
      if (art === undefined || tile === null) continue;
      layers.set(layer.asset, {
        assetId: layer.asset,
        biome: id,
        layerId: layer.id,
        scrollFactor: layer.scrollFactor,
        width: coreWidth(layer.scrollFactor) + LAYER_BLEED_PX * 2,
        left: -LAYER_BLEED_PX,
        top: art.top,
        height: Math.round(tile.height * art.scale),
      });
    }
  }
  return {
    homeBiome: content.modes.modes.classic.biome,
    biomes: ids,
    entries,
    layers,
    birds,
  };
}
