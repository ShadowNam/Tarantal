// v1.7d (D-059, review): the mid and near ground cover is baked into a few strip textures (no
// ~1 500 live images); only the foreground's few tufts stay images.
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
  it('bakes the mid and near cover into ≤ 2048-wide strips; the foreground stays images', () => {
    const st = stub();
    const v = new VeldView(st.scene, st.parallax, 'namibie');
    const all = spots;
    const fg = all.filter((s) => s[0] === 2).length;
    // A few strip pieces plus the foreground's tufts: never one image per tuft.
    expect(st.dts.length).toBeGreaterThan(0);
    expect(st.dts.length).toBeLessThanOrEqual(8);
    for (const d of st.dts) expect(d.w).toBeLessThanOrEqual(2048);
    expect(st.images[0]).toBe(st.dts.length + fg);
    // Every mid and near tuft is stamped (one rendered batch per piece).
    expect(st.stamps[0]).toBeGreaterThanOrEqual(all.length - fg);
    expect(st.renders[0]).toBe(st.dts.length);
    expect(v.count).toBe(all.length);
    v.update(1920);
    expect(v.shown).toBeGreaterThan(0);
    expect(v.shown).toBeLessThan(40);
  });
});
