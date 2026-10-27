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
import { drawnBox, FaunaView } from './FaunaView';

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
  rhythmSpread: 0.5,
  secondBite: 0.45,
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
  getWorldTransformMatrix(): { a: number; d: number; tx: number; ty: number } {
    return { a: 1, d: 1, tx: 0, ty: 0 };
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

describe('FaunaView HD swaps (D-054 review)', () => {
  it('an HD/Standard swap that lands on a build retry frame is not lost', () => {
    const w = world();
    // Two herds: one built now, one whose sheet never lands (the retry keeps running).
    const late = { ...herd, key: 'fauna/never_lands' };
    const m = w.manifest as unknown as {
      hdEpoch: number;
      faunaFrames: (k: string) => FaunaFrames | undefined;
    };
    w.land();
    const base = m.faunaFrames;
    m.faunaFrames = (k: string) => (k === late.key ? undefined : base(k));
    const v = new FaunaView(
      w.scene,
      w.manifest,
      [herd, late],
      3040,
      new FakeContainer() as unknown as Phaser.GameObjects.Container,
      { idle: IDLE, ticksPerSecond: 60 },
    );
    expect(v.animalCount()).toBe(herd.animals.length);
    const retextured: string[] = [];
    for (const img of w.images)
      img.setTexture = function (this: FakeImage) {
        retextured.push(this.frame);
        return this;
      };
    // The swap lands on the 30th update, the same frame as a build retry.
    for (let t = 1; t <= 30; t++) {
      if (t === 30) m.hdEpoch = 1;
      v.update(t, false);
    }
    expect(retextured.length).toBe(w.images.length);
  });
});

describe('drawnBox (D-054 review: getBounds() ignores a negative scale)', () => {
  it('puts a mirrored part on the far side of its pivot', () => {
    // A 100 × 50 frame, origin at x 10 (the pivot near its left edge), drawn at (200, 100).
    const img = (sx: number) =>
      ({
        displayOriginX: 10,
        displayOriginY: 25,
        frame: { cutWidth: 100, cutHeight: 50, source: { resolution: 1 } },
        getWorldTransformMatrix: () => ({
          transformPoint: (x: number, y: number) => ({ x: 200 + x * sx, y: 100 + y }),
        }),
      }) as unknown as Phaser.GameObjects.Image;
    expect(drawnBox(img(1))).toEqual({ x: 190, y: 75, w: 100, h: 50 });
    // Facing left: the part reaches left of the pivot, not right.
    expect(drawnBox(img(-1))).toEqual({ x: 110, y: 75, w: 100, h: 50 });
  });
});
