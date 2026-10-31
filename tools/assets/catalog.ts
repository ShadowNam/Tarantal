// Every manifest key the game can ask for (M10), built in Node from the same placeholder manifests
// the game builds at runtime (one per playable biome). The pack tool checks deliveries against it;
// the asset audit lists it. Placeholder draw functions are never called here.
import type { ContentBundle } from '../../src/content/schemas';
import type { ArtPlaneId as PlaneId } from '../../src/game/assets/artPlane';
import { coreWidth, LAYER_BLEED_PX } from '../../src/sim/world';
import { COMMON_GROUP } from '../../src/game/assets/assetIndex';
import { DESERT_GROUP, isDesertKey } from '../../src/game/assets/desertAssets';
import {
  FEESDAE_GROUP,
  HALLOWEEN_SHEET,
  SHEET_H as FEESDAE_SHEET_H,
  SHEET_W as FEESDAE_SHEET_W,
  SPOOK_SOUNDS,
} from '../../src/game/feesdae/feesdaeAssets';
import {
  CHRISTMAS_GROUP,
  CHRISTMAS_SHEET,
  XMAS_SHEET_H,
  XMAS_SHEET_W,
  XMAS_SOUNDS,
} from '../../src/game/feesdae/christmasAssets';
import {
  NEWYEAR_GROUP,
  NEWYEAR_SHEET,
  NY_SHEET_H,
  NY_SHEET_W,
  NY_SOUNDS,
} from '../../src/game/feesdae/newyearAssets';
import { specialLinesOf } from '../../src/game/audio/barks';
import type { AssetKind } from '../../src/game/assets/AssetManifest';
import {
  createPlaceholderManifest,
  loadBiomeArt,
  placeholderBiomes,
} from '../../src/game/placeholder/ProceduralAssetFactory';
import {
  specialVoiceGroup,
  veldLifeBarks,
  baboonBarks,
  harvestBarks,
  voiceGroup,
  voicedLines,
} from '../../src/game/audio/voiceLines';
import { voiceKey } from '../../src/game/assets/AssetManifest';
import { VOICE_LANGUAGES } from '../../src/i18n/i18n';
import {
  PLATE_FRAME_TEX,
  PLATE_FRAME_TEX_SIZE,
  PLATE_TEX,
  PLATE_TEX_SIZE,
  RANGE_GROUP,
  RANGE_SOUNDS,
} from '../../src/game/range/rangeAssets';
import { loadFeel, loadSoundscape } from '../testContent';
import { SOUNDSCAPE_GROUP, soundscapeSounds } from '../../src/game/audio/soundscapeKeys';
import { RaidActionSchema } from '../../src/content/schemas';

export interface CatalogEntry {
  readonly key: string;
  readonly kind: AssetKind;
  /** `common`, the one biome that uses it (loads with that biome), or a lazy group. */
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
  const entries = new Map<string, CatalogEntry>();
  const layers = new Map<string, LayerSpec>();
  const birds = new Map<string, PlaneId[]>();
  for (const id of ids) {
    const biome = content.biomes.find((b) => b.id === id);
    if (biome === undefined || !(await loadBiomeArt(id))) continue;
    const m = createPlaceholderManifest(content, biome, loadFeel().guns.ammo);
    for (const e of m.entries()) {
      const prev = entries.get(e.key);
      const biomes = [...(prev?.biomes ?? []), id];
      const size = e.kind === 'texture' ? m.size(e.key) : null;
      entries.set(e.key, {
        key: e.key,
        kind: e.kind,
        // v1.7 (D-044): the meerkats' sheet and sounds load with either desert map.
        group: isDesertKey(e.key) ? DESERT_GROUP : biomes.length === 1 ? id : COMMON_GROUP,
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
  // 24 Oct update (D-037): the Skietbaan's plate and sounds, in their own lazy group (the range
  // chunk loads them; no placeholder manifest has them).
  const everyBiome = [...ids];
  entries.set(PLATE_TEX, {
    key: PLATE_TEX,
    kind: 'texture',
    group: RANGE_GROUP,
    biomes: everyBiome,
    ...PLATE_TEX_SIZE,
  });
  // D-040: the plate's posts and crossbar (interim art at 2×, like the plate).
  entries.set(PLATE_FRAME_TEX, {
    key: PLATE_FRAME_TEX,
    kind: 'texture',
    group: RANGE_GROUP,
    biomes: everyBiome,
    ...PLATE_FRAME_TEX_SIZE,
  });
  for (const key of Object.values(RANGE_SOUNDS))
    entries.set(key, { key, kind: 'sound', group: RANGE_GROUP, biomes: everyBiome });
  // D-048: the special days' sheet and sounds, in their own lazy group (the feesdae chunk loads
  // them when a special day's hunt starts; no placeholder manifest has them).
  entries.set(HALLOWEEN_SHEET, {
    key: HALLOWEEN_SHEET,
    kind: 'texture',
    group: FEESDAE_GROUP,
    biomes: everyBiome,
    width: FEESDAE_SHEET_W,
    height: FEESDAE_SHEET_H,
  });
  for (const key of Object.values(SPOOK_SOUNDS))
    entries.set(key, { key, kind: 'sound', group: FEESDAE_GROUP, biomes: everyBiome });
  // D-064: Christmas's sheet and sounds in a lazy group of their own (never with Halloween's).
  entries.set(CHRISTMAS_SHEET, {
    key: CHRISTMAS_SHEET,
    kind: 'texture',
    group: CHRISTMAS_GROUP,
    biomes: everyBiome,
    width: XMAS_SHEET_W,
    height: XMAS_SHEET_H,
  });
  for (const key of Object.values(XMAS_SOUNDS))
    entries.set(key, { key, kind: 'sound', group: CHRISTMAS_GROUP, biomes: everyBiome });
  // D-065: New Year's sheet and sounds in a lazy group of their own (never with the others').
  entries.set(NEWYEAR_SHEET, {
    key: NEWYEAR_SHEET,
    kind: 'texture',
    group: NEWYEAR_GROUP,
    biomes: everyBiome,
    width: NY_SHEET_W,
    height: NY_SHEET_H,
  });
  for (const key of Object.values(NY_SOUNDS))
    entries.set(key, { key, kind: 'sound', group: NEWYEAR_GROUP, biomes: everyBiome });
  // v1.9 (D-066): the soundscape's calls, in one lazy group (its chunk loads them after the hunt
  // has started; no placeholder manifest has them).
  for (const key of soundscapeSounds(loadSoundscape()))
    entries.set(key, { key, kind: 'sound', group: SOUNDSCAPE_GROUP, biomes: everyBiome });
  // v1.5 (D-041): Oupa's voice, one lazy pack per voice language (voice/<lang>/<bark key>): his
  // trigger lines (feel.json barks) and every secret's bark.
  // D-048: a special day's own lines go in a lazy group per language, loaded with that day.
  const specialBarks = content.feesdae.specials.map((f) => f.barks);
  // D-064: each special's lines in its own pack per language (specialVoiceGroup).
  const special = new Map(
    content.feesdae.specials.flatMap((f) => specialLinesOf(f.barks).map((l) => [l, f.id] as const)),
  );
  for (const lang of VOICE_LANGUAGES)
    for (const line of voicedLines(
      loadFeel().barks,
      content.biomes,
      content.birds.meerkats,
      specialBarks,
      [
        ...veldLifeBarks(content.birds),
        ...baboonBarks(RaidActionSchema.options),
        ...harvestBarks(),
      ],
    )) {
      const key = voiceKey(lang, line);
      const owner = special.get(line);
      const group = owner === undefined ? voiceGroup(lang) : specialVoiceGroup(lang, owner);
      entries.set(key, { key, kind: 'sound', group, biomes: everyBiome });
    }
  return {
    homeBiome: content.modes.modes.classic.biome,
    biomes: ids,
    entries,
    layers,
    birds,
  };
}
