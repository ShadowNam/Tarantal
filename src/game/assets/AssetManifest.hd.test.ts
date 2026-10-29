// D-053: the HD pack in the manifest: which files an area needs (before its hunt, in the
// background), and that HD art goes under the same keys at the same on-screen size, then back.
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest, loadBiomeArt } from '../placeholder/ProceduralAssetFactory';
import { hdTextureCount, hdUnderKey, retiredTextures, type AssetManifest } from './AssetManifest';
import { applyHd, dropHd, hdFiles, loadHd, purgeRetired } from './hdRuntime';
import { readFullIndex } from '../../../tools/assets/fullIndex';
import { type AssetIndex } from './assetIndex';
import { isHdGroup } from './hdPack';

/** Path → pixel size of every delivered image (the fake decoder's answer). */
const dims = new Map<string, { width: number; height: number }>();

vi.mock('./finalLoader', () => ({
  loadImage: (path: string) =>
    Promise.resolve({ path, ...(dims.get(path) ?? { width: 4, height: 4 }) }),
  loadJson: () => Promise.resolve({ frames: {} }),
  loadBytes: () => Promise.resolve(null),
  forgetImage: () => undefined,
}));

interface FakeFrame {
  width: number;
  height: number;
  halfWidth: number;
  halfHeight: number;
  centerX: number;
  centerY: number;
  x: number;
  y: number;
  cutWidth: number;
  cutHeight: number;
  data: {
    sourceSize: { w: number; h: number };
    spriteSourceSize: { x: number; y: number; w: number; h: number; r: number; b: number };
    radius: number;
  };
}
interface FakeTexture {
  key: string;
  source: { resolution: number; image: { width: number; height: number } }[];
  frames: Record<string, FakeFrame>;
  getSourceImage(): unknown;
}

/** Just enough of Phaser's TextureManager for the manifest. */
function fakeTextures() {
  const map = new Map<string, FakeTexture>();
  const frame = (w: number, h: number): FakeFrame => ({
    width: w,
    height: h,
    halfWidth: w / 2,
    halfHeight: h / 2,
    centerX: w / 2,
    centerY: h / 2,
    x: 0,
    y: 0,
    cutWidth: w,
    cutHeight: h,
    data: {
      sourceSize: { w, h },
      spriteSourceSize: { x: 0, y: 0, w, h, r: w, b: h },
      radius: Math.hypot(w, h) / 2,
    },
  });
  const add = (key: string, image: { width: number; height: number }): FakeTexture => {
    const t: FakeTexture = {
      key,
      source: [{ resolution: 1, image }],
      frames: { __BASE: frame(image.width, image.height) },
      getSourceImage: () => image,
    };
    map.set(key, t);
    return t;
  };
  const api = {
    exists: (k: string) => map.has(k),
    get: (k: string) => map.get(k),
    addImage: (k: string, img: { width: number; height: number }) => add(k, img),
    addCanvas: (k: string, c: { width: number; height: number }) => add(k, c),
    addAtlasJSONHash: (k: string, img: { width: number; height: number }[]) =>
      add(k, img[0] ?? { width: 1, height: 1 }),
    renameTexture: (from: string, to: string) => {
      const t = map.get(from);
      if (t === undefined) return false;
      map.delete(from);
      t.key = to;
      map.set(to, t);
      return true;
    },
    remove: (k: string) => map.delete(k),
    getTextureKeys: () => [...map.keys()],
  };
  // Safe: the manifest only calls the methods above.
  return { api: api as unknown as Phaser.Textures.TextureManager, map };
}

/** On-screen size of `key` as a view draws it: frame size × the manifest's display scale. */
function shown(
  m: AssetManifest,
  map: Map<string, FakeTexture>,
  key: string,
): { w: number; h: number } {
  const f = map.get(key)?.frames['__BASE'];
  if (f === undefined) throw new Error(`no texture ${key}`);
  const s = m.displayScale(key);
  return { w: f.data.sourceSize.w * s, h: f.data.sourceSize.h * s };
}

let index: AssetIndex;
const content = loadContent();
const bushveld = content.biomes.find((b) => b.id === 'bushveld-winter');

beforeAll(async () => {
  // The index with its HD half (asset-index-hd.json) merged back in, as the game does.
  const full = readFullIndex(join(import.meta.dirname, '..', '..', '..', 'public'));
  expect(full.error).toBeNull();
  if (full.index === null) throw new Error('no asset index');
  index = full.index;
  for (const e of Object.values(index.images)) {
    dims.set(e.file.path, { width: e.width, height: e.height });
    if (e.hd !== undefined) dims.set(e.hd.file.path, { width: e.hd.width, height: e.hd.height });
  }
  expect(await loadBiomeArt('bushveld-winter')).toBe(true);
  expect(await loadBiomeArt('karoo-autumn')).toBe(true);
});

/** A loaded manifest for any area (A→B→A tests). */
async function loadedArea(id: string): Promise<AssetManifest> {
  const b = content.biomes.find((x) => x.id === id);
  if (b === undefined) throw new Error(`no biome ${id}`);
  const m = createPlaceholderManifest(content, b);
  await m.loadFinal(index, { atlasScale: 1, timeoutMs: 1000, audioFormat: null, biome: id });
  await m.lateLoaded;
  return m;
}

async function loaded(): Promise<AssetManifest> {
  if (bushveld === undefined) throw new Error('no biome');
  const m = createPlaceholderManifest(content, bushveld);
  await m.loadFinal(index, {
    atlasScale: 1,
    timeoutMs: 1000,
    audioFormat: null,
    biome: bushveld.id,
  });
  await m.lateLoaded;
  return m;
}

describe('AssetManifest HD files', () => {
  it('splits an area into its hunt (common, the area) and the background (late, Ver)', async () => {
    const m = await loaded();
    const f = hdFiles(m, index, 'bushveld-winter');
    const now = new Set(f.now.map((x) => x.group));
    const later = new Set(f.background.map((x) => x.group));
    expect([...now].sort()).toEqual(['bushveld-winter-hd', 'common-hd']);
    expect([...later].sort()).toEqual(['late-hd', 'ver-hd']);
    for (const x of [...f.now, ...f.background]) {
      expect(isHdGroup(x.group)).toBe(true);
      expect(x.path.startsWith(`assets/${x.group}/`)).toBe(true);
    }
    // The 2× Bushveld aloes are in the Bushveld HD group.
    const aloe = index.images['bushveld/aloe_a']?.hd?.file.path;
    expect(f.now.map((x) => x.path)).toContain(aloe);
  });

  it('loads with progress, and nothing is missing afterwards', async () => {
    const m = await loaded();
    const files = hdFiles(m, index, 'bushveld-winter', true);
    expect(files.now.length).toBeGreaterThan(0);
    const load = loadHd(m, index, { timeoutMs: 1000, biome: 'bushveld-winter' });
    expect(m.hdReady).toBe(false);
    await load.now;
    expect(m.hdReady).toBe(true);
    expect(m.hdProgress().done).toBe(m.hdProgress().total);
    await load.all;
    // Every image and layer tile is in (atlases need real frame data: this fake has none).
    const left = hdFiles(m, index, 'bushveld-winter', true);
    for (const x of [...left.now, ...left.background]) expect(x.path).toMatch(/\/(birds|guns)\//);
  });
});

describe('AssetManifest.applyHd', () => {
  it('draws HD art at the standard size, then swaps back to Standard', async () => {
    const m = await loaded();
    const { api, map } = fakeTextures();
    m.install(api, () => false);
    const keys = ['bushveld/aloe_a', 'fx/feather', 'crate/box'].filter(
      (k) => index.images[k]?.hd !== undefined,
    );
    expect(keys).toContain('bushveld/aloe_a');
    expect(keys.length).toBeGreaterThan(1);
    const before = Object.fromEntries(keys.map((k) => [k, shown(m, map, k)]));
    const layerBefore = m.layer('bushveld/mid');
    await loadHd(m, index, { timeoutMs: 1000, biome: 'bushveld-winter' }).all;
    m.setHd(true);
    const epoch = m.hdEpoch;
    expect(applyHd(m, api)).toBe(true);
    expect(m.hdEpoch).toBe(epoch + 1);
    expect(hdTextureCount(api)).toBeGreaterThan(0);
    for (const k of keys) {
      const tex = map.get(k);
      // The HD file is under the key, at twice the pixels…
      expect(tex?.source[0]?.image.width).toBe(index.images[k]?.hd?.width);
      // …and every view sees the standard size on screen.
      expect(shown(m, map, k)).toEqual(before[k]);
    }
    // A prop (view-scaled) keeps its HD frame and halves its display scale; a sprite drawn
    // without a view scale halves its frames and draws at resolution 2.
    expect(m.displayScale('bushveld/aloe_a')).toBe(0.5);
    const generic = keys.find((k) => k !== 'bushveld/aloe_a') ?? '';
    expect(map.get(generic)?.source[0]?.resolution).toBe(2);
    // Layers: HD tiles cover the same span at scale 0.5.
    const hdLayer = m.layer('bushveld/mid');
    expect(hdLayer?.scale).toBe(0.5);
    expect(hdLayer?.left).toBe(layerBefore?.left);
    expect(hdLayer?.top).toBe(layerBefore?.top);
    expect(hdLayer?.tiles.length).toBeGreaterThan(layerBefore?.tiles.length ?? 0);
    // The standard textures were renamed, not removed (an object may still draw them).
    const retired = [...map.keys()].filter((k) => k.includes('#retired-'));
    expect(retired.length).toBe(keys.length > 0 ? retired.length : 0);
    expect(retired.length).toBeGreaterThanOrEqual(keys.length);
    // A retired texture still drawn stays; the rest go.
    const kept = retired[0] ?? '';
    purgeRetired(api, new Set([kept]));
    expect(map.has(kept)).toBe(true);
    expect([...map.keys()].filter((k) => k.includes('#retired-'))).toEqual([kept]);

    // Back to Standard: the standard files under the keys, the same size again.
    m.setHd(false);
    expect(applyHd(m, api)).toBe(true);
    for (const k of keys) {
      expect(map.get(k)?.source[0]?.image.width).toBe(index.images[k]?.width);
      expect(shown(m, map, k)).toEqual(before[k]);
    }
    expect(m.displayScale('bushveld/aloe_a')).toBe(1);
    expect(m.layer('bushveld/mid')).toEqual(layerBefore);
    dropHd(m);
    purgeRetired(api, new Set());
    expect(hdTextureCount(api)).toBe(0);
    expect([...map.keys()].some((k) => k.includes('#retired-'))).toBe(false);
  });

  it('with Standard chosen, nothing HD is ever installed', async () => {
    const m = await loaded();
    const { api } = fakeTextures();
    m.install(api, () => false);
    expect(applyHd(m, api)).toBe(false);
    expect(hdTextureCount(api)).toBe(0);
  });
});

describe('HD after leaving an area and coming back (release)', () => {
  const A = 'bushveld-winter';
  const B = 'karoo-autumn';

  it('A → B → A in HD: every layer tile A draws exists', async () => {
    const a = await loadedArea(A);
    const b = await loadedArea(B);
    const { api } = fakeTextures();
    for (const [m, id] of [
      [a, A],
      [b, B],
    ] as const) {
      m.setHd(true);
      await loadHd(m, index, { timeoutMs: 1000, biome: id }).all;
    }
    a.install(api, () => false);
    applyHd(a, api);
    a.release(api, b);
    b.install(api, () => false);
    applyHd(b, api);
    b.release(api, a);
    a.install(api, () => false);
    applyHd(a, api);
    const layers = Object.keys(index.layers).filter(
      (id) => id.startsWith('bushveld/') && index.layers[id]?.hd !== undefined,
    );
    expect(layers.length).toBeGreaterThan(2);
    for (const id of layers) {
      const art = a.layer(id);
      expect(art, id).toBeDefined();
      for (const key of art?.tiles ?? []) expect(api.exists(key), `${id}: ${key}`).toBe(true);
    }
  });

  it('HD in A → B → Standard → back to A: A’s props draw at full size (scale 1)', async () => {
    const a = await loadedArea(A);
    const b = await loadedArea(B);
    const { api } = fakeTextures();
    a.setHd(true);
    b.setHd(true);
    await loadHd(a, index, { timeoutMs: 1000, biome: A }).all;
    a.install(api, () => false);
    applyHd(a, api);
    expect(a.displayScale('bushveld/aloe_a')).toBe(0.5);
    a.release(api, b);
    b.install(api, () => false);
    // Standard chosen in B (Settings), then the scene changes (as GraphicsControl.sync does:
    // every manifest swaps back, then forgets its HD files).
    a.setHd(false);
    b.setHd(false);
    applyHd(a, api);
    applyHd(b, api);
    dropHd(a);
    dropHd(b);
    purgeRetired(api, new Set());
    b.release(api, a);
    a.install(api, () => false);
    expect(a.displayScale('bushveld/aloe_a')).toBe(1);
    expect(hdTextureCount(api)).toBe(0);
  });
});

describe('HD layers and their standard tiles (GPU memory)', () => {
  it('installed with HD, a layer uploads its HD tiles only', async () => {
    const m = await loaded();
    m.setHd(true);
    await loadHd(m, index, { timeoutMs: 1000, biome: 'bushveld-winter' }).all;
    const { api } = fakeTextures();
    m.install(api, () => false);
    const hd = m.layer('bushveld/mid');
    expect(hd?.tiles.every((k) => k.includes('/hd/') && api.exists(k))).toBe(true);
    m.setHd(false);
    const std = m.layer('bushveld/mid')?.tiles ?? [];
    m.setHd(true);
    expect(std.length).toBeGreaterThan(0);
    expect(std.some((k) => api.exists(k))).toBe(false);
    // Not reported missing either.
    expect(m.missing(api).filter((k) => std.includes(k))).toEqual([]);
  });

  it('switched to HD, the standard tiles go once unused; back to Standard they return first', async () => {
    const m = await loaded();
    const { api } = fakeTextures();
    m.install(api, () => false);
    const std = m.layer('bushveld/mid')?.tiles ?? [];
    expect(std.length).toBeGreaterThan(0);
    await loadHd(m, index, { timeoutMs: 1000, biome: 'bushveld-winter' }).all;
    m.setHd(true);
    applyHd(m, api);
    // Still drawn: kept.
    purgeRetired(api, new Set(std));
    expect(std.every((k) => api.exists(k))).toBe(true);
    // The views moved to the HD tiles: freed.
    purgeRetired(api, new Set());
    expect(std.some((k) => api.exists(k))).toBe(false);
    // Standard again: the tiles are back before any view asks for them, and never purged.
    m.setHd(false);
    applyHd(m, api);
    expect(m.layer('bushveld/mid')?.tiles).toEqual(std);
    purgeRetired(api, new Set());
    expect(std.every((k) => api.exists(k))).toBe(true);
  });
});

describe('D-054 review: a late sheet whose HD file went under its key first', () => {
  it('Standard chosen since: upgrade() puts the standard file under the key at its own scale and retires the HD texture', async () => {
    const m = await loadedArea('karoo-autumn');
    const { api, map } = fakeTextures();
    const key = 'fauna/karoo_ostrich';
    // Node has no DOM: a canvas class for the placeholder check.
    vi.stubGlobal(
      'HTMLCanvasElement',
      class FakeCanvas {
        readonly canvas = true;
      },
    );
    // The late-hd sheet landed first and went under the key (HD then); the standard file is in.
    const hdImg = { width: 999, height: 999 };
    // Safe: the fake texture manager takes any { width, height } as an image.
    api.addImage(key, hdImg as unknown as HTMLImageElement);
    hdUnderKey.set(key, 0.5);
    (m as unknown as { drawn: Set<string> }).drawn.add(key);
    m.hdWanted = false;
    expect(m.upgrade(api, key)).toEqual([key]);
    expect(m.delivered(api, key)).toBe(true);
    expect(map.get(key)?.getSourceImage()).not.toBe(hdImg);
    expect(hdUnderKey.has(key)).toBe(false);
    expect(m.displayScale(key)).toBe(1);
    const retired = [...retiredTextures].filter((k) => k.startsWith(`${key}#retired-`));
    expect(retired.length).toBe(1);
    expect(map.get(retired[0] ?? '')?.getSourceImage()).toBe(hdImg);
    vi.unstubAllGlobals();
  });
});

describe('D-054: a released area keeps no HD layers on the GPU (Pixel 7 HD hunts at 358–384 MB)', () => {
  const hdTiles = (m: AssetManifest, id: string): readonly string[] => m.layer(id)?.tiles ?? [];
  it('title (Karoo, HD) → a Bushveld hunt: sync no longer puts the Karoo HD layers back; back to the title restores them', async () => {
    const karoo = await loadedArea('karoo-autumn');
    const bush = await loadedArea('bushveld-winter');
    const { api } = fakeTextures();
    for (const m of [karoo, bush]) {
      m.setHd(true);
      await loadHd(m, index, {
        timeoutMs: 1000,
        biome: m === karoo ? 'karoo-autumn' : 'bushveld-winter',
      }).all;
    }
    // A preloaded area that was never shown uploads nothing.
    applyHd(bush, api);
    expect(hdTiles(bush, 'bushveld/mid').some((k) => api.exists(k))).toBe(false);
    // The title.
    karoo.install(api, () => false);
    applyHd(karoo, api);
    const karooMid = hdTiles(karoo, 'karoo/mid');
    expect(karooMid.length).toBeGreaterThan(0);
    expect(karooMid.every((k) => k.includes('/hd/') && api.exists(k))).toBe(true);
    // The hunt in the Bushveld: release, install, then buildViews' sync (applyHd on every manifest).
    karoo.release(api, bush);
    bush.install(api, () => false);
    applyHd(karoo, api);
    applyHd(bush, api);
    expect(karooMid.some((k) => api.exists(k))).toBe(false);
    expect(hdTiles(bush, 'bushveld/mid').every((k) => api.exists(k))).toBe(true);
    // Back to the title (A → B → A): the Karoo HD layers come back, the Bushveld's go.
    bush.release(api, karoo);
    karoo.install(api, () => false);
    applyHd(bush, api);
    applyHd(karoo, api);
    expect(karooMid.every((k) => api.exists(k))).toBe(true);
    expect(hdTiles(bush, 'bushveld/mid').some((k) => api.exists(k))).toBe(false);
  });
});
