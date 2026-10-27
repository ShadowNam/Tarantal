// D-053: Standard back while views live: objects leave the swapped-out HD images.
import type * as Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import type { AssetManifest } from './AssetManifest';
import { repointRetired } from './hdRuntime';

interface Obj {
  texture: { key: string };
  frame: { name: string };
  list?: Obj[];
  setTexture(key: string, frame?: string): Obj;
}

function obj(key: string, frame = '__BASE'): Obj {
  const o: Obj = {
    texture: { key },
    frame: { name: frame },
    setTexture(k: string, f?: string) {
      o.texture = { key: k };
      o.frame = { name: f ?? '__BASE' };
      return o;
    },
  };
  return o;
}

const keys = new Set(['fx/smoke', 'karoo/aloe_a']);
// Safe casts: repointRetired only calls exists() and get().has() on the textures, and reads
// specs on a manifest.
const textures = {
  exists: (k: string) => keys.has(k),
  get: () => ({ has: (f: string) => f === '__BASE' }),
} as unknown as Phaser.Textures.TextureManager;
const manifest = {
  specs: new Map([['karoo/aloe_a', { viewScaled: true }]]),
} as unknown as AssetManifest;
const scene = (list: Obj[]): Phaser.Scene => ({ children: { list } }) as unknown as Phaser.Scene;

describe('repointRetired (D-053)', () => {
  it('moves objects off a retired image onto the key, inside containers too', () => {
    const smoke = obj('fx/smoke#retired-3');
    const inner = obj('fx/smoke#retired-4');
    const box = { ...obj('none'), list: [inner] };
    expect(repointRetired([scene([smoke, box])], textures, [manifest])).toBe(2);
    expect(smoke.texture.key).toBe('fx/smoke');
    expect(smoke.frame.name).toBe('__BASE');
    expect(inner.texture.key).toBe('fx/smoke');
  });

  it('never moves a particle emitter (its frames would stay on the retired texture)', () => {
    const emitter = { ...obj('fx/smoke#retired-5'), alive: [] };
    expect(repointRetired([scene([emitter])], textures, [manifest])).toBe(0);
    expect(emitter.texture.key).toBe('fx/smoke#retired-5');
  });

  it('leaves view-scaled props, live keys and keys that are gone alone', () => {
    const aloe = obj('karoo/aloe_a#retired-1');
    const live = obj('fx/smoke');
    const gone = obj('fx/gone#retired-2');
    expect(repointRetired([scene([aloe, live, gone])], textures, [manifest])).toBe(0);
    expect(aloe.texture.key).toBe('karoo/aloe_a#retired-1');
    expect(gone.texture.key).toBe('fx/gone#retired-2');
  });
});
