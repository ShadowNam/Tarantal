// D-053: the HD pack in the manifest: which files an area needs (before its hunt, in the
// background), and that HD art goes under the same keys at the same on-screen size, then back.
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest, loadBiomeArt } from '../placeholder/ProceduralAssetFactory';
import { hdTextureCount, type AssetManifest } from './AssetManifest';
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
