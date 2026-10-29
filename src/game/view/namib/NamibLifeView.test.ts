// v1.7d (D-059, review): the balloons are drawn. BirdView leaves drifters out, so NamibLifeView
// must update BalloonView every frame: a lugballon alive in the snapshot shows in the hook.
import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import type { Biome } from '../../../content/schemas';
import type { BirdView, SimState } from '../../../sim/types';
import type { AssetManifest } from '../../assets/AssetManifest';
import type { AudioDirector } from '../../audio/AudioDirector';
import type { ParallaxView } from '../ParallaxView';
import { BALLOON_SHEET } from './balloonSheet';
import { NamibLifeView } from './NamibLifeView';

/** A chainable stand-in for a Phaser image (every setter returns itself). */
function fakeImage(): Record<string, unknown> {
  const img: Record<string, unknown> = { displayHeight: 112, frame: { name: 'balloon_a' } };
  for (const m of [
    'setPosition',
    'setScale',
    'setVisible',
    'setAlpha',
    'setRotation',
    'setTexture',
    'setOrigin',
    'setFrame',
    'setFlipX',
    'setTint',
    'destroy',
  ])
    img[m] = () => img;
  return img;
}

function fakes(): { scene: Phaser.Scene; parallax: ParallaxView } {
  const frames = new Set<string>();
  const tex = {
    getSourceImage: () => ({ width: 256 }),
    has: (n: string) => frames.has(n),
    get: () => ({}),
    add: (n: string) => {
      frames.add(n);
      return {};
    },
  };
  const scene = {
    textures: { exists: (k: string) => k === BALLOON_SHEET, get: () => tex },
    add: { image: fakeImage, container: fakeImage },
  } as unknown as Phaser.Scene;
  const node = { root: { x: 0, y: 0, scale: 1 }, fixtures: { add: () => undefined } };
  const parallax = {
    layer: () => undefined,
    plane: () => node,
    screenX: () => 960,
    setHerdVisible: () => undefined,
  } as unknown as ParallaxView;
  return { scene, parallax };
}

const balloon = { id: 9, creature: 'lugballon', kind: 'nonTarget', plane: 'far', x: 1500, y: 76 };

describe('NamibLifeView (v1.7d, D-059)', () => {
  it('draws a balloon alive in the snapshot (the hook lists it)', () => {
    const { scene, parallax } = fakes();
    const view = new NamibLifeView(scene, { id: 'namibie' } as Biome, parallax, {
      reducedMotion: false,
      reduceFlashes: () => false,
      manifest: {} as AssetManifest,
      fauna: { idle: {} as never, ticksPerSecond: 60 },
      lightIds: () => ['dawn_mist'],
      audio: { playExtra: () => undefined } as unknown as AudioDirector,
      planeScales: { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    });
    const s = {
      tick: 600,
      mirage: false,
      ostriches: [],
      birds: [balloon as unknown as BirdView],
    } as unknown as SimState;
    view.update(s, null, 0, 1920);
    const hook = view.hook();
    expect(hook.balloonsLive).toBe(1);
    expect(hook.balloonSheet).toBe(true);
    expect(hook.balloons.map((b) => b.id)).toEqual([9]);
  });
});
