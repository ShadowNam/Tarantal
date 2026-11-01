// v1.12 (D-069, perf lessons 32–33): Brakkie's view with stub images that count every setter — a
// proxy for perf.spec's brakkieMs at 4× throttle (≈ 7 µs a Phaser call: ≈ 40 calls a frame for
// 0.3 ms). Through a real hunt with him (fetching, barking, flushing) at ~20 sim ticks a frame
// (the smoke's regime) and at 1 tick a frame, every frame stays far inside it; a frame where
// nothing changed makes no call. His sheet: HD only inside the budget, and gone when he is.
import { afterEach, describe, expect, it } from 'vitest';
import { base } from '../../../tools/simHarness';
import { loadFeel } from '../../../tools/testContent';
import { createSim } from '../../sim/Sim';
import type { SimState } from '../../sim/types';
import { withBrakkieParams } from '../devContent';
import type { ParallaxView } from '../view/ParallaxView';
import { dogFrame, wagFrame } from './brakkieAnim';
import { BRAKKIE_SHEET, BRAKKIE_SHEET_H, BRAKKIE_SHEET_W } from './brakkieKeys';
import {
  BrakkieView,
  ensureBrakkieTexture,
  releaseBrakkieTexture,
  resetBrakkieFiles,
  setBrakkieImagesForTest,
} from './BrakkieView';

const feel = loadFeel();

function stubImage(): Record<string, unknown> {
  const img: Record<string, unknown> = {
    originX: 0.5,
    originY: 0.5,
    frame: { pivotX: 0.5, pivotY: 1, customPivot: true },
  };
  const chain =
    (fn?: (...a: unknown[]) => void) =>
    (...a: unknown[]) => {
      fn?.(...a);
      return img;
    };
  for (const n of [
    'setVisible',
    'setAlpha',
    'setPosition',
    'setTint',
    'clearTint',
    'setFlipX',
    'setScale',
    'setDepth',
    'setTexture',
  ])
    img[n] = chain();
  img['setFrame'] = chain();
  img['setOrigin'] = chain((x, y) => {
    img['originX'] = x;
    img['originY'] = y;
  });
  img['destroy'] = () => undefined;
  return img;
}

function stubTextures() {
  const tex = new Map<string, { w: number; h: number }>();
  return {
    tex,
    exists: (k: string) => tex.has(k),
    get: (k: string) => ({
      getSourceImage: () => ({ width: tex.get(k)?.w ?? 0 }),
      source: [{ width: tex.get(k)?.w ?? 0, height: tex.get(k)?.h ?? 0 }],
    }),
    getTextureKeys: () => [...tex.keys()],
    addImage: (k: string, img: { width: number; height: number }) => {
      tex.set(k, { w: img.width, h: img.height });
      return { add: () => ({ customPivot: false, pivotX: 0, pivotY: 0 }) };
    },
    remove: (k: string) => tex.delete(k),
  };
}

function makeView(textures = stubTextures()) {
  const layers = ['mid', 'near'].map((id) => ({
    id,
    sf: id === 'mid' ? 0.6 : 1,
    root: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    fixtures: { add: () => undefined },
  }));
  const parallax = {
    layer: (id: string) => layers.find((l) => l.id === id),
    layerTint: () => 0xffffff,
  } as unknown as ParallaxView;
  const scene = {
    add: { image: () => stubImage() },
    textures,
  } as unknown as Phaser.Scene;
  const view = new BrakkieView({
    scene,
    parallax,
    now: () => 0,
    tuning: feel.brakkie,
    hd: false,
    hooks: true,
  });
  /** Pans the stub layers to the snapshot's camera (as ParallaxView does). */
  const pan = (s: SimState): void => {
    for (const l of layers) l.root.x = 960 - ((s.cameraX - 960) * l.sf + 960);
  };
  return { view, textures, pan };
}

/** A hunt with him out at once, barking and flushing (the preview content). */
function hunt(preview: 'bark' | 'flush', ticksPerFrame: number, frames: number): SimState[] {
  const content = withBrakkieParams(base, new URLSearchParams(`brakkiePreview=${preview}`));
  const sim = createSim({
    seed: 4,
    content,
    mode: { id: 'classic', biome: 'karoo-autumn' },
    inputKind: 'pointer',
  });
  const out: SimState[] = [];
  for (let f = 0; f < frames && !sim.isOver(); f++) {
    for (let i = 0; i < ticksPerFrame; i++) sim.step([]);
    sim.drainEvents();
    // Centre the camera on him (he is drawn, never culled), as a player watching him would.
    const s = sim.snapshot();
    out.push({ ...s, cameraX: s.brakkie?.x ?? s.cameraX });
  }
  return out;
}

describe('BrakkieView (D-069)', () => {
  afterEach(() => {
    resetBrakkieFiles();
  });

  it('frames from the snapshot: away is null, the trot and run alternate, the bark opens', () => {
    expect(dogFrame({ present: false, pose: 'trot', t: 0 })).toBeNull();
    expect(dogFrame({ present: true, pose: 'trot', t: 0 })).toBe('trot_a');
    expect(dogFrame({ present: true, pose: 'trot', t: 8 })).toBe('trot_b');
    expect(dogFrame({ present: true, pose: 'carry', t: 5 })).toBe('run_b');
    expect(dogFrame({ present: true, pose: 'bark', t: 0 })).toBe('bark');
    expect(dogFrame({ present: true, pose: 'yelp', t: 3 })).toBe('yelp');
  });

  it("the title's wag swishes after a tap; reduce motion keeps one calm frame", () => {
    expect(wagFrame(null, 1400, 110, false)).toBe('sit');
    expect(wagFrame(0, 1400, 110, false)).toBe('wag_a');
    expect(wagFrame(120, 1400, 110, false)).toBe('sit');
    for (let ms = 0; ms < 1400; ms += 50) expect(wagFrame(ms, 1400, 110, true)).toBe('wag_a');
    expect(wagFrame(1500, 1400, 110, false)).toBe('sit');
  });

  for (const [preview, tpf] of [
    ['bark', 20],
    ['flush', 20],
    ['bark', 1],
  ] as const)
    it(`≤ 20 Phaser calls a frame (half the ≈ 40 budget) through a ${preview} hunt at ${String(tpf)} tick(s) a frame`, () => {
      setBrakkieImagesForTest(
        { width: BRAKKIE_SHEET_W, height: BRAKKIE_SHEET_H } as HTMLImageElement,
        null,
      );
      const { view, pan } = makeView();
      let worst = 0;
      let drawn = 0;
      const states = hunt(preview, tpf, tpf === 1 ? 1800 : 260);
      for (const s of states) {
        pan(s);
        view.update(s);
        // The first frames build the sheet (polled every 30 frames until it is in).
        if (view.hook.sheet !== null) worst = Math.max(worst, view.hook.calls);
        if (view.hook.visible) drawn++;
      }
      expect(drawn).toBeGreaterThan(states.length / 4);
      expect(worst).toBeLessThanOrEqual(20);
      // A frame whose tick hasn't moved changes nothing.
      const last = states.at(-1);
      if (last !== undefined) {
        view.update(last);
        view.update(last);
        expect(view.hook.calls).toBe(0);
      }
    });

  it('HD only inside the texture budget; his sheet is removed with him', () => {
    setBrakkieImagesForTest(
      { width: BRAKKIE_SHEET_W, height: BRAKKIE_SHEET_H } as HTMLImageElement,
      { width: BRAKKIE_SHEET_W * 2, height: BRAKKIE_SHEET_H * 2 } as HTMLImageElement,
    );
    const roomy = stubTextures();
    const t = ensureBrakkieTexture(roomy as unknown as Phaser.Textures.TextureManager, true, 1e9);
    expect(t?.sheet).toBe('hd');
    const full = stubTextures();
    // 254.8 MB in use (the Okavango Reënbui HD hunt): the 2 MiB twin doesn't fit under 250 MiB.
    full.tex.set('heavy', { w: 254.8 * 1024 * 256, h: 1 });
    const budget = (feel.brakkie.hd.budgetMiB - feel.brakkie.hd.headroomMiB) * 1024 * 1024;
    const t2 = ensureBrakkieTexture(
      full as unknown as Phaser.Textures.TextureManager,
      true,
      budget,
    );
    expect(t2?.sheet).toBe('standard');
    expect(full.tex.get(BRAKKIE_SHEET)?.w).toBe(BRAKKIE_SHEET_W);
    releaseBrakkieTexture(full as unknown as Phaser.Textures.TextureManager);
    expect(full.tex.has(BRAKKIE_SHEET)).toBe(false);
    // The view's destroy releases it too (the hunt ends before the tally opens).
    const { view, textures } = makeView();
    for (const s of hunt('bark', 20, 40)) view.update(s);
    expect(textures.tex.has(BRAKKIE_SHEET)).toBe(true);
    view.destroy();
    expect(textures.tex.has(BRAKKIE_SHEET)).toBe(false);
  });

  it('with no delivery he is never drawn and nothing waits', () => {
    const { view, textures } = makeView();
    for (const s of hunt('bark', 20, 60)) view.update(s);
    expect(view.hook.visible).toBe(false);
    expect(view.hook.sheet).toBeNull();
    expect(textures.tex.size).toBe(0);
  });
});
