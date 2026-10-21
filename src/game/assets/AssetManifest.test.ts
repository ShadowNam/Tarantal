import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { loadContent } from '../../../tools/testContent';
import { createPlaceholderManifest } from '../placeholder/ProceduralAssetFactory';
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
