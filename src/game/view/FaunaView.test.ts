import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '../assets/AssetManifest';
import {
  FAUNA_HERDS,
  frameName,
  lookOf,
  type FaunaFrames,
  type FaunaIdleTuning,
} from './faunaHerds';
import { FaunaView } from './FaunaView';

const IDLE: FaunaIdleTuning = {
  grazeDeg: 5,
  grazeEverySec: 4.5,
  grazeSec: 1.4,
  alertDeg: 2.5,
  alertEverySec: 6,
  alertSec: 0.5,
  walkDeg: 1.2,
  walkSec: 1.4,
  tailDeg: 16,
  tailEverySec: 5,
  tailSec: 0.9,
  earFold: 0.12,
  earSec: 3.6,
  swayDeg: 2.2,
  swaySec: 5.5,
  calm: 0.35,
};

/** Images as plain objects: what FaunaView sets on them. */
class FakeImage {
  angle = 0;
  scaleX = 1;
  scaleY = 1;
  constructor(
    readonly key: string,
    readonly frame: string,
  ) {}
  setOrigin(): this {
    return this;
  }
  setScale(x: number, y = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setAngle(a: number): this {
    this.angle = a;
    return this;
  }
  setTexture(): this {
    return this;
  }
}

class FakeContainer {
  readonly list: unknown[] = [];
  get length(): number {
    return this.list.length;
  }
  add(o: unknown): this {
    this.list.push(o);
    return this;
  }
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
}

/** The Karoo's springbok herd: a late sheet that lands after the hunt starts. */
const herd = FAUNA_HERDS['karoo-autumn']?.[0];
if (herd === undefined) throw new Error('no Karoo herd');
const frames: Record<
  string,
  readonly [number, number, number, number, number, number, number, number]
> = {};
for (const a of herd.animals)
  for (const part of ['tail', 'body', 'head'] as const)
    frames[frameName(lookOf(a), part)] = [0, 0, 10, 10, 5, 5, part === 'head' ? 8 : 0, -6];

function world(): {
  scene: Phaser.Scene;
  manifest: AssetManifest;
  images: FakeImage[];
  log: string[];
  land: () => void;
} {
  const images: FakeImage[] = [];
  const log: string[] = [];
  const cut = new Set<string>();
  let landed = false;
  let swapped = false;
  const textures = {
    exists: () => true,
    get: () => ({
      has: (n: string) => cut.has(n),
      add: (n: string) => {
        cut.add(n);
        log.push(`add ${n}`);
      },
    }),
    remove: () => log.push('remove'),
  };
  const scene = {
    textures,
    add: {
      container: () => new FakeContainer(),
      image: (_x: number, _y: number, key: string, frame: string) => {
        const img = new FakeImage(key, frame);
        images.push(img);
        return img;
      },
    },
  } as unknown as Phaser.Scene;
  const manifest = {
    hdEpoch: 0,
    faunaFrames: (): FaunaFrames | undefined => (landed ? frames : undefined),
    delivered: () => swapped,
    upgrade: () => {
      // AssetManifest.upgrade renames the placeholder away; it never removes a texture.
      log.push('upgrade');
      if (landed) swapped = true;
      return [];
    },
    displayScale: () => 1,
  } as unknown as AssetManifest;
  return { scene, manifest, images, log, land: () => (landed = true) };
}

const view = (w: ReturnType<typeof world>): FaunaView =>
  new FaunaView(
    w.scene,
    w.manifest,
    [herd],
    3040,
    new FakeContainer() as unknown as Phaser.GameObjects.Container,
    { idle: IDLE, ticksPerSecond: 60 },
  );

describe('FaunaView (D-054)', () => {
  it('a late sheet swaps in via upgrade() once it lands; nothing is ever removed', () => {
    const w = world();
    const v = view(w);
    expect(v.animalCount()).toBe(0);
    for (let t = 0; t < 60; t++) v.update(t, false);
    expect(v.animalCount()).toBe(0);
    w.land();
    for (let t = 60; t < 120; t++) v.update(t, false);
    expect(v.animalCount()).toBe(herd.animals.length);
    expect(w.log).toContain('upgrade');
    expect(w.log).not.toContain('remove');
  });

  it('poses are a function of the tick: a held tick holds still, reduce motion is calmer', () => {
    const w = world();
    w.land();
    const v = view(w);
    const heads = (): number[] =>
      w.images.filter((i) => i.frame.endsWith('.head')).map((i) => i.angle);
    let moved = false;
    let calmMax = 0;
    let fullMax = 0;
    for (let t = 0; t < 60 * 20; t += 5) {
      v.update(t, false);
      const a = heads();
      fullMax = Math.max(fullMax, ...a.map(Math.abs));
      v.update(t, false);
      expect(heads()).toEqual(a);
      v.update(t, true);
      calmMax = Math.max(calmMax, ...heads().map(Math.abs));
      if (a.some((x) => x !== 0)) moved = true;
    }
    expect(moved).toBe(true);
    expect(calmMax).toBeGreaterThan(0);
    expect(calmMax).toBeLessThan(fullMax);
  });
});
