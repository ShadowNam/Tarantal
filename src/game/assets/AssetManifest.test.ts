import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest, loadBiomeArt } from '../placeholder/ProceduralAssetFactory';
import { neededBeforeStart } from './AssetManifest';

// A 2D context that accepts any drawing call (Node has no canvas): every property is a
// function returning the same stub, so gradients etc. chain too.
const ctxStub: unknown = new Proxy(() => ctxStub, {
  get: () => ctxStub,
  set: () => true,
  apply: () => ctxStub,
});

function fakeTextures(): Phaser.Textures.TextureManager & { keys: Set<string> } {
  const keys = new Set<string>();
  return {
    keys,
    exists: (k: string) => keys.has(k),
    addCanvas: (k: string) => {
      keys.add(k);
      return null;
    },
    remove: (k: string) => {
      keys.delete(k);
      return null;
    },
  } as unknown as Phaser.Textures.TextureManager & { keys: Set<string> };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssetManifest.install', () => {
  const content = loadContent();
  const biome = content.biomes.find((b) => b.id === 'karoo-autumn');
  if (!biome) throw new Error('no biome');

  it('reports incomplete while filtered-out textures (birds) are still missing', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctxStub }) });
    const m = createPlaceholderManifest(content, biome);
    const tex = fakeTextures();
    expect(m.install(tex, neededBeforeStart)).toBe(false);
    const missing = m.missing(tex);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((k) => k.startsWith('bird/'))).toBe(true);
    // Background slices with no time budget left make no progress and stay incomplete.
    expect(m.install(tex, () => true, -1)).toBe(false);
    expect(m.install(tex)).toBe(true);
    expect(m.missing(tex)).toEqual([]);
  });
});

describe('AssetManifest.release (D-031: one biome of scenery at a time)', () => {
  const content = loadContent();
  const karoo = content.biomes.find((b) => b.id === 'karoo-autumn');
  const bushveld = content.biomes.find((b) => b.id === 'bushveld-winter');
  if (!karoo || !bushveld) throw new Error('no biome');

  it('switching biome removes the old biome layer and prop keys, keeps shared ones', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctxStub }) });
    expect(await loadBiomeArt(bushveld.id)).toBe(true);
    const a = createPlaceholderManifest(content, karoo);
    const b = createPlaceholderManifest(content, bushveld);
    const tex = fakeTextures();
    a.install(tex);
    expect(tex.keys.has('karoo/windpomp')).toBe(true);
    expect([...tex.keys].some((k) => k.startsWith('karoo/sky'))).toBe(true);
    const removed = a.release(tex, b);
    b.install(tex);
    // The Karoo's scenery is gone; the Bushveld's and the shared UI/FX are in.
    expect(removed).toContain('karoo/windpomp');
    expect([...tex.keys].some((k) => k.startsWith('karoo/'))).toBe(false);
    expect(tex.keys.has('bushveld/baobab')).toBe(true);
    expect(tex.keys.has('ui/windsock')).toBe(true);
    expect(removed).not.toContain('ui/windsock');
    // Back to the Karoo: release the Bushveld, the Karoo re-installs.
    b.release(tex, a);
    a.install(tex);
    expect(tex.keys.has('karoo/windpomp')).toBe(true);
    expect([...tex.keys].some((k) => k.startsWith('bushveld/'))).toBe(false);
    expect(a.release(tex, a)).toEqual([]);
  });
});

describe('AssetManifest.releaseGuns (v1.3: only the equipped gun stays on the GPU)', () => {
  const content = loadContent();
  const karoo = content.biomes.find((b) => b.id === 'karoo-autumn');
  if (!karoo) throw new Error('no biome');

  it('removes every delivered gun atlas but the kept one, with its animations', () => {
    const m = createPlaceholderManifest(content, karoo);
    // Stand-in delivered rigs (the loader fills this map from the asset index in the browser).
    const guns = (m as unknown as { finalGuns: Map<string, object> }).finalGuns;
    for (const id of ['dubbelloop', 'voorlaaier', 'mielie_masjien'])
      guns.set(id, {
        atlasKey: `final:gun/${id}@1x`,
        entry: { clips: { idle: { frames: ['a'] }, fire: { frames: ['a', 'b'] } } },
        scale: 1,
        img: [],
        data: [],
      });
    const tex = fakeTextures();
    for (const id of ['dubbelloop', 'voorlaaier', 'mielie_masjien'])
      tex.keys.add(`final:gun/${id}@1x`);
    const animKeys = new Set(['final:gun/voorlaaier@1x/fire', 'final:gun/dubbelloop@1x/fire']);
    const anims = {
      exists: (k: string) => animKeys.has(k),
      remove: (k: string) => animKeys.delete(k),
    } as unknown as Phaser.Animations.AnimationManager;
    const removed = m.releaseGuns(tex, new Set(['dubbelloop']), anims);
    expect(removed.sort()).toEqual(['final:gun/mielie_masjien@1x', 'final:gun/voorlaaier@1x']);
    expect(tex.keys.has('final:gun/dubbelloop@1x')).toBe(true);
    expect([...animKeys]).toEqual(['final:gun/dubbelloop@1x/fire']);
    // Nothing left to drop the second time.
    expect(m.releaseGuns(tex, new Set(['dubbelloop']), anims)).toEqual([]);
  });
});
