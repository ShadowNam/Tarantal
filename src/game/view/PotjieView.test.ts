// D-051: the potjie view's state (lid off after the secret event) and the HD prop swap, which
// keeps the first-download texture until the HD file (and the lid) have landed. A fake scene and
// fake textures stand in for Phaser.
import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../../sim/events';
import type { SimState } from '../../sim/types';
import { POTJIE_LID } from '../assets/hdProps';

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
