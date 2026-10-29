// v1.7d (D-059, review): the ground cover is baked into a few strip textures trimmed to the
// tufts (no ~1 500 live images).
import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import type { ParallaxView } from '../ParallaxView';
import { VeldView } from './VeldView';
import { VELD_SHEET } from './veldSheet';
import spots from './veld-namibie.json' with { type: 'json' };

function stub(): {
  scene: Phaser.Scene;
  parallax: ParallaxView;
  images: number[];
  stamps: number[];
  renders: number[];
  dts: { w: number; h: number }[];
} {
  const images = [0];
  const stamps = [0];
  const renders = [0];
  const dts: { w: number; h: number }[] = [];
  const img = (): Record<string, unknown> => {
    images[0] = (images[0] ?? 0) + 1;
    const o: Record<string, unknown> = { visible: true };
    for (const m of ['setOrigin', 'setTexture', 'setFlipX', 'setScale', 'setVisible', 'destroy'])
      o[m] = () => o;
    return o;
  };
  const frames = new Set<string>();
  const sheet = {
    getSourceImage: () => ({ width: 576 }),
    has: (n: string) => frames.has(n),
    add: (n: string) => frames.add(n),
  };
  const scene = {
    textures: {
      exists: (k: string) => k === VELD_SHEET,
      get: () => sheet,
      remove: () => undefined,
      addDynamicTexture: (_k: string, w: number, h: number) => {
        dts.push({ w, h });
        return {
          width: w,
          height: h,
          clear: () => undefined,
          stamp: () => {
            stamps[0] = (stamps[0] ?? 0) + 1;
          },
          render: () => {
            renders[0] = (renders[0] ?? 0) + 1;
          },
        };
      },
    },
    add: { image: img },
  } as unknown as Phaser.Scene;
  const node = { root: { x: 0, scale: 1, visible: true }, fruit: { addAt: () => undefined } };
  const parallax = { layer: () => node } as unknown as ParallaxView;
  return { scene, parallax, images, stamps, renders, dts };
}

describe('VeldView (v1.7d, D-059)', () => {
  it('bakes every tuft into ≤ 1024-wide strips trimmed to the tufts, one image each', () => {
    const st = stub();
    const v = new VeldView(st.scene, st.parallax, 'namibie');
    const all = spots;
    // A few strip pieces: never one image per tuft.
    expect(st.dts.length).toBeGreaterThan(0);
    expect(st.dts.length).toBeLessThanOrEqual(20);
    for (const d of st.dts) expect(d.w).toBeLessThanOrEqual(1024);
    expect(st.images[0]).toBe(st.dts.length);
    expect(v.strips).toBe(st.dts.length);
    // Every tuft is stamped (one rendered batch per piece).
    expect(st.stamps[0]).toBeGreaterThanOrEqual(all.length);
    expect(v.baked).toBeGreaterThanOrEqual(all.length);
    expect(st.renders[0]).toBe(st.dts.length);
    expect(v.count).toBe(all.length);
    // The strips' texture memory (4 bytes a texel), the same in Standard and HD.
    console.log(
      `[veld] ${String(v.strips)} strips, ${((v.bakedTexels * 4) / 2 ** 20).toFixed(2)} MB`,
    );
    v.update(1920);
    expect(v.shown).toBeGreaterThan(0);
    expect(v.shown).toBeLessThanOrEqual(v.strips);
  });
});
