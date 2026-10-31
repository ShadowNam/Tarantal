// D-065 (perf): New Year's view on a full pool of fireworks (?fireworks=max: a burst every slot),
// with stub images that count every setter and spies on the trig functions — a proxy for the
// Pixel 7 smoke's "New Year view ms per frame" (perf.spec). Each burst is baked frame by frame
// (fireworkMath.ts): per frame a burst changes its frame and alpha only when they change, the
// stars are four groups (an alpha each), and a frame whose tick has not moved does nothing.
// Measured with this harness: per-spark images (af6ce21) 186 setter and 305 trig calls a frame;
// precomputed per-spark (f78f3eb) 116 and 46; at 20 ticks a frame (the 4× smoke's regime) one baked
// strip per colour: ~8 calls and no trig (2 a frame at 60 fps).
// The ground's blue hour (300 statics + 20 herds over a 90-s hunt), before: every 1 % step of the
// sky's wash re-tinted the whole map in one frame — 13 928 setTint calls in all, 279 in the worst
// frame; after (1/32 steps, ≤ DIM_BUDGET images a frame, only real changes): 8 928, at most 40.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadContent, loadFeel } from '../../../tools/testContent';
import type { ParallaxView } from '../view/ParallaxView';
import { DIM_BUDGET, LayerDimmer, type DimLayer } from '../view/layerDimmer';
import { NEWYEAR_SHEET } from './newyearKeys';
import { NuwejaarSceneView } from './NuwejaarView';
import { FW_STRIPS } from './fireworkMath';
import type { FeesdagView as FeesdagState } from '../../sim/types';

/** Setter calls on every stub image, by name. */
const calls = new Map<string, number>();
const count = (name: string): void => {
  calls.set(name, (calls.get(name) ?? 0) + 1);
};

function stubImage(): Record<string, unknown> {
  const img: Record<string, unknown> = {
    visible: true,
    scaleX: 1,
    scaleY: 1,
    frame: { name: 'spark' },
    texture: { key: NEWYEAR_SHEET },
  };
  let rotation = 0;
  let alpha = 1;
  Object.defineProperty(img, 'rotation', {
    get: () => rotation,
    set: (v: number) => {
      count('rotation');
      rotation = v;
    },
  });
  Object.defineProperty(img, 'alpha', {
    get: () => alpha,
    set: (v: number) => {
      count('alpha');
      alpha = v;
    },
  });
  const chain =
    (name: string, f?: (...a: (number | undefined)[]) => void) =>
    (...a: (number | undefined)[]) => {
      count(name);
      f?.(...a);
      return img;
    };
  img['setVisible'] = chain('setVisible', (v) => {
    img['visible'] = Boolean(v);
  });
  img['setTint'] = chain('setTint');
  img['setPosition'] = chain('setPosition');
  img['setRotation'] = chain('setRotation', (v) => {
    rotation = v ?? 0;
  });
  img['setScale'] = chain('setScale', (x, y) => {
    img['scaleX'] = x;
    img['scaleY'] = y ?? x;
  });
  img['setAlpha'] = chain('setAlpha', (v) => {
    alpha = v ?? 1;
  });
  img['setOrigin'] = chain('setOrigin');
  img['setBlendMode'] = chain('setBlendMode');
  img['setTexture'] = chain('setTexture');
  img['setFrame'] = chain('setFrame');
  img['setFlipX'] = chain('setFlipX');
  img['destroy'] = () => undefined;
  return img;
}

/** A stub parallax: sky only, or (ground) N statics and herds spread over the ground layers,
 *  dimmed by the real LayerDimmer; counts setTint calls. */
interface GroundStub {
  readonly parallax: ParallaxView;
  /** setTint calls per frame index (update call), and the real tint changes made. */
  readonly perFrame: number[];
  changes: number;
}

function stubParallax(statics = 0, herds = 0): GroundStub {
  const sky = {
    id: 'sky',
    scrollFactor: 0.05,
    root: { x: 0, y: 0, scaleX: 1 },
    fixtures: { add: () => undefined },
  };
  const ids = ['sky', 'far_ridge', 'ver_veld', 'far_veld', 'mid', 'near', 'foreground'];
  const g: GroundStub = { parallax: null as never, perFrame: [], changes: 0 };
  let frameCalls = 0;
  const layers: DimLayer[] = ids.map((id, li) => {
    const imgs = Array.from({ length: Math.round(statics / ids.length) }, () => {
      const img = {
        tintTopLeft: 0xd8a080,
        setTint(t: number) {
          frameCalls++;
          if (t !== img.tintTopLeft) g.changes++;
          img.tintTopLeft = t;
          return img;
        },
      };
      return img;
    });
    const fauna = Array.from({ length: li >= 1 && li <= 3 ? Math.round(herds / 3) : 0 }, () => {
      let tint = 0xd8a080;
      return {
        setTint(t: number) {
          frameCalls++;
          if (t !== tint) g.changes++;
          tint = t;
        },
      };
    });
    return { id, base: 0xd8a080, images: () => imgs, fauna };
  });
  const dimmer = new LayerDimmer(layers);
  (g as { parallax: ParallaxView }).parallax = {
    layer: (id: string) => (id === 'sky' ? sky : undefined),
    dimLayers: (extra: ReadonlyMap<string, number>) => {
      dimmer.set(extra);
    },
    stepDim: () => {
      dimmer.step();
    },
    endFrame: () => {
      g.perFrame.push(frameCalls);
      frameCalls = 0;
    },
  } as unknown as ParallaxView;
  return g;
}

function makeView(ground: GroundStub = stubParallax()): NuwejaarSceneView {
  const feel = loadFeel();
  const special = loadContent().feesdae.specials.find((f) => f.id === 'newyear');
  if (special === undefined) throw new Error('no newyear');
  const scene = {
    add: {
      image: () => stubImage(),
      rectangle: () => stubImage(),
      container: () => {
        const box = stubImage();
        const list: unknown[] = [];
        box['list'] = list;
        box['add'] = (c: unknown) => {
          list.push(c);
          return box;
        };
        return box;
      },
    },
    textures: {
      exists: (k: string) => k === NEWYEAR_SHEET,
      get: () => ({ getSourceImage: () => ({ width: 400 }) }),
    },
  };
  const parallax = ground.parallax;
  return new NuwejaarSceneView({
    scene: scene as never,
    parallax,
    look: feel.feesdae.looks.newyear,
    special,
    planeScale: { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    decorations: special.decorations,
    sheet: null,
    reduceFlashes: false,
    lowTier: false,
    maxFireworks: true,
  });
}

const STATE: FeesdagState = {
  id: 'newyear',
  things: [],
  lanternsLit: 0,
  lanternsTotal: 0,
  countdown: { atTick: 4800, active: false, mult: 2 },
};

/** Runs `frames` frames (one tick each) from `from` after a warm-up that fills the pool; returns
 *  the setter and trig calls per frame. */
function measure(
  view: { update(s: FeesdagState, p: undefined, a: number, t: number): void },
  from = 600,
  frames = 240,
  /** Sim ticks a render frame advances (perf.spec's 4× throttle smoke: ~20). */
  step = 1,
): { setters: number; trig: number; held: number } {
  for (let t = from - 120; t < from; t += step) view.update(STATE, undefined, 0, t);
  const spies = (['sin', 'cos', 'atan2', 'hypot', 'tan', 'pow'] as const).map((f) =>
    vi.spyOn(Math, f),
  );
  calls.clear();
  let last = from;
  for (let f = 0; f < frames; f++) {
    last = from + f * step;
    view.update(STATE, undefined, 0, last);
  }
  const setters = [...calls.values()].reduce((a, b) => a + b, 0) / frames;
  const trig = spies.reduce((a, s) => a + s.mock.calls.length, 0) / frames;
  // A held frame: the same tick again.
  calls.clear();
  view.update(STATE, undefined, 0, last);
  const held = [...calls.values()].reduce((a, b) => a + b, 0);
  for (const s of spies) s.mockRestore();
  return { setters, trig, held };
}

describe('New Year view per-frame cost (D-065 perf)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a full pool of fireworks at the smoke’s 20 ticks a frame: ≤ 12 calls a frame, a held frame free', () => {
    // perf.spec's 4× throttle smoke runs ~330 ms a frame: every frame jumps ~20 sim ticks, so most
    // frames launch a burst and every live burst changes frame. Mid-hunt (the stars out).
    const view = makeView();
    const m = measure(view, 3000, 120, 20);
    expect(m.trig).toBeLessThanOrEqual(4);
    expect(m.setters).toBeLessThanOrEqual(12);
    expect(m.held).toBe(0);
    // And at a real 60 fps (a tick a frame).
    const smooth = measure(makeView(), 3000, 240, 1);
    expect(smooth.setters).toBeLessThanOrEqual(6);
    console.log(`[ny perf proxy] ${JSON.stringify({ smoke: m, smooth })}`);
  });

  it('one baked strip per burst colour', () => {
    expect(loadFeel().feesdae.looks.newyear.fireworks.colours.length).toBe(FW_STRIPS);
  });

  it('the ground goes to blue hour in steps, one changed layer a frame, tinting only what changes', () => {
    // 300 statics and 20 herds (the Okavango is about that) over a whole 90-s hunt.
    const ground = stubParallax(300, 20);
    const view = makeView(ground);
    const end = STATE.countdown === undefined ? 5400 : STATE.countdown.atTick + 600;
    const stub = ground.parallax as unknown as { endFrame: () => void };
    const endFrame = (): void => {
      stub.endFrame();
    };
    for (let t = 0; t <= end; t++) {
      view.update(STATE, undefined, 0, t);
      endFrame();
    }
    const total = ground.perFrame.reduce((a, b) => a + b, 0);
    const peak = Math.max(...ground.perFrame);
    // Every setTint call is a real change (herds tint themselves only on change as well).
    expect(total).toBeLessThanOrEqual(ground.changes);
    // At most DIM_BUDGET images (then the layer's herds) in any frame, never the whole map.
    expect(peak).toBeLessThanOrEqual(DIM_BUDGET + 7);
    console.log(`[ny dim proxy] ${JSON.stringify({ total, peak, changes: ground.changes })}`);
  });
});
