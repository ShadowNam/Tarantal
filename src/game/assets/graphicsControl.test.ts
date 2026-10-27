// D-053: GraphicsControl's failure paths: no HD runtime or index, and failed files.
import { describe, expect, it, vi } from 'vitest';
import type { Biome } from '../../content/schemas';
import type { AssetManifest } from './AssetManifest';
import type { AssetIndex } from './assetIndex';
import { createGraphicsControl, type GraphicsDeps, type HdRuntimeApi } from './graphicsControl';

const biome = { id: 'karoo-autumn' } as unknown as Biome; // Safe: only the id is read.
const index = {} as unknown as AssetIndex; // Safe: passed through to the runtime only.

function fakeManifest(): AssetManifest {
  const m = {
    hd: false,
    hdReady: false,
    setHd: vi.fn(),
    hdProgress: () => ({ done: 0, total: 0 }),
  };
  return m as unknown as AssetManifest; // Safe: the control calls only these.
}

function deps(rt: HdRuntimeApi | null, m: AssetManifest): GraphicsDeps {
  return {
    mode: () => 'hd',
    setting: () => 'hd',
    index: () => index,
    biome: (id) => (id === biome.id ? biome : undefined),
    manifestFor: () => m,
    manifests: () => [m],
    artReady: () => true,
    finalDone: () => true,
    ensureRuntime: () => Promise.resolve(rt),
    runtime: () => rt,
    fileTimeoutMs: 1000,
  };
}

describe('createGraphicsControl (D-053)', () => {
  it('no HD runtime or index (offline, 404): the area is ready in Standard, no endless veil', async () => {
    const g = createGraphicsControl(deps(null, fakeManifest()));
    expect(g.ready(biome.id)).toBe(false);
    await g.loadHd(biome.id);
    // ready() is what HuntScene.create checks before putting up the veil again.
    expect(g.ready(biome.id)).toBe(true);
    expect(g.skipped(biome.id)).toBe(true);
    expect(g.available()).toBe(false);
    expect(g.hdBytes(biome.id)).toBe(0);
  });

  it('preload tries an area once per scene change (a failing file is not refetched every 30 frames)', () => {
    const m = fakeManifest();
    const loadHd = vi.fn(() => ({ now: Promise.resolve(), all: Promise.resolve() }));
    const rt = { loadHd } as unknown as HdRuntimeApi; // Safe: preload → loadHd only.
    const g = createGraphicsControl(deps(rt, m));
    const tried = vi.spyOn(g, 'loadHd');
    g.preload(biome.id);
    g.preload(biome.id);
    g.preload(biome.id);
    expect(tried).toHaveBeenCalledTimes(1);
  });
});
