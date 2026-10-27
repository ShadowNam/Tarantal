// D-051: the potjie view's state (lid off after the secret event) and the HD prop swap, which
// keeps the first-download texture until the HD file (and the lid) have landed. A fake scene and
// fake textures stand in for Phaser.
import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../../sim/events';
import type { SimState } from '../../sim/types';
import { POTJIE_LID } from '../assets/hdProps';
import { multiplyRgb } from './lightTint';

vi.mock('phaser', () => ({ BlendModes: { ADD: 1 } }));
const { PotjieView } = await import('./PotjieView');
const { ParallaxView } = await import('./ParallaxView');

/** A chainable no-op (Container, Image): every method returns the object itself. */
function chain(): object {
  const p: object = new Proxy({}, { get: () => () => p });
  return p;
}

const content = loadContent();
const karoo = content.biomes.find((b) => b.id === 'karoo-autumn');
if (karoo === undefined) throw new Error('no karoo');

function view(hd = false): InstanceType<typeof PotjieView> {
  const scene = { add: { container: () => chain() } } as unknown as Phaser.Scene;
  const parallax = {
    layer: () => ({ fixtures: chain() }),
    hdShown: () => hd,
  } as unknown as ConstructorParameters<typeof PotjieView>[2];
  return new PotjieView(scene, karoo as NonNullable<typeof karoo>, parallax);
}

/** A recording stand-in for a Phaser Image (the fields PotjieView reads back). */
class FakeImage {
  x = 0;
  y = 0;
  rotation = 0;
  visible = true;
  tint: number | null = null;
  constructor(readonly key: string) {}
  setTint(t: number): this {
    this.tint = t;
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setRotation(r: number): this {
    this.rotation = r;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
  setOrigin(): this {
    return this;
  }
  setScale(): this {
    return this;
  }
  setAlpha(): this {
    return this;
  }
}

/** A view whose HD art has landed, on a layer under `light`; records every image it makes. */
function liveView(light = 0xffffff): { v: InstanceType<typeof PotjieView>; images: FakeImage[] } {
  const images: FakeImage[] = [];
  const scene = {
    add: {
      container: () => chain(),
      image: (_x: number, _y: number, key: string) => {
        const img = new FakeImage(key);
        images.push(img);
        return img;
      },
    },
  } as unknown as Phaser.Scene;
  const parallax = {
    layer: () => ({ fixtures: chain() }),
    hdShown: () => true,
    layerTint: () => light,
    displayScale: () => 0.5,
    screenX: () => 960,
  } as unknown as ConstructorParameters<typeof PotjieView>[2];
  return { v: new PotjieView(scene, karoo as NonNullable<typeof karoo>, parallax), images };
}

const state = (tick: number, done = false): SimState =>
  ({ tick, wind: null, secrets: [{ propId: 'potjie', done }] }) as unknown as SimState;

describe('PotjieView (D-051)', () => {
  it('the lid comes off on the lid secret only (once), and stays off', () => {
    const v = view();
    expect(v.hook?.lidOff).toBe(false);
    const other: SimEvent = {
      type: 'secretTriggered',
      tick: 10,
      propId: 'fence_bell',
      partId: 'bell',
    };
    v.handle([other]);
    expect(v.lidOff).toBe(false);
    v.handle([{ type: 'secretTriggered', tick: 20, propId: 'potjie', partId: 'lid' }]);
    expect(v.lidOff).toBe(true);
    v.update(state(500, true), false, 1920);
    expect(v.hook).toMatchObject({ lidOff: true, hd: false });
    // Before the HD art has landed nothing of the view is drawn (the old pot shows as it was).
    expect(v.hook?.lid).toBeNull();
    // A new hunt starts with the lid on.
    v.clear();
    expect(v.lidOff).toBe(false);
  });

  it('a hunt whose lid secret is already spent shows the lid off', () => {
    const v = view();
    v.update(state(900, true), false, 1920);
    expect(v.lidOff).toBe(true);
  });
  it('the map light tints the lid, the steam and the coals as it tints the pot', () => {
    const dusk = 0x8a88b2;
    const { v, images } = liveView(dusk);
    v.update(state(10), false, 1920);
    const lid = images.find((i) => i.key === POTJIE_LID);
    expect(lid?.tint).toBe(dusk);
    const smoke = images.filter((i) => i.key !== POTJIE_LID);
    expect(smoke.length).toBeGreaterThan(1);
    // White steam under the light is the light's colour; the warmth is multiplied too.
    for (const img of smoke) expect(img.tint).not.toBeNull();
    expect(smoke.slice(1).every((i) => i.tint === multiplyRgb(0xffffff, dusk))).toBe(true);
    expect(smoke[0]?.tint).toBe(multiplyRgb(0xff5a1e, dusk));
    // Without a map light the lid keeps its own colours.
    const plain = liveView();
    plain.v.update(state(10), false, 1920);
    expect(plain.images.find((i) => i.key === POTJIE_LID)?.tint).toBeNull();
  });

  it('a held frame (the same tick twice) makes no sound', () => {
    const { v } = liveView();
    let heard = 0;
    for (let t = 0; t < 600; t++) {
      v.update(state(t), false, 1920);
      heard += v.cues.length;
      // The same tick again: nothing new.
      v.update(state(t), false, 1920);
      expect(v.cues).toEqual([]);
    }
    expect(heard).toBeGreaterThan(0);
  });
});

describe('ParallaxView.upgradeHd (D-051)', () => {
  it('keeps the old texture until the HD file and its pieces have landed, then swaps', () => {
    const delivered = new Set<string>();
    const upgraded: string[] = [];
    const manifest = {
      upgrade: (_t: unknown, k: string) => {
        upgraded.push(k);
        return [];
      },
      delivered: (_t: unknown, k: string) => delivered.has(k),
      origin: () => ({ x: 0.5, y: 0.54 }),
      displayScale: () => 0.5,
    };
    const set: string[] = [];
    const img = new Proxy(
      {},
      {
        get:
          (_o, name) =>
          (...args: unknown[]) => {
            if (name === 'setTexture') set.push(String(args[0]));
            return img;
          },
      },
    );
    const fake = {
      manifest,
      hdPending: [
        {
          propId: 'potjie',
          art: { img, crop: null },
          hd: 'karoo/hd/potjie',
          parts: [POTJIE_LID],
        },
      ],
      hdLive: new Set<string>(),
    };
    const textures = {} as Phaser.Textures.TextureManager;
    const upgradeHd = ParallaxView.prototype.upgradeHd.bind(
      fake as unknown as InstanceType<typeof ParallaxView>,
    );
    const hdShown = ParallaxView.prototype.hdShown.bind(
      fake as unknown as InstanceType<typeof ParallaxView>,
    );
    // Nothing landed: the prop keeps its first-download texture.
    expect(upgradeHd(textures)).toEqual([]);
    expect(set).toEqual([]);
    expect(hdShown('potjie')).toBe(false);
    // The pot alone is not enough: the lid must be there too.
    delivered.add('karoo/hd/potjie');
    expect(upgradeHd(textures)).toEqual([]);
    expect(set).toEqual([]);
    delivered.add(POTJIE_LID);
    expect(upgradeHd(textures)).toEqual(['potjie']);
    expect(set).toEqual(['karoo/hd/potjie']);
    expect(hdShown('potjie')).toBe(true);
    // Placeholders were renamed through AssetManifest.upgrade (never removed); done once.
    expect(upgraded).toContain(POTJIE_LID);
    expect(upgradeHd(textures)).toEqual([]);
  });
});
