// D-065 (perf): New Year's view on a full pool of fireworks (?fireworks=max: a burst every slot),
// with stub images that count every setter and spies on the trig functions — a proxy for the
// Pixel 7 smoke's "New Year view ms per frame" (perf.spec). Per frame the sparks may do only
// arithmetic and one atan2 each (their rays' sin/cos are worked out once, at launch), the stars
// read a sine table, setters run only when a value changes, and a frame whose tick has not moved
// (a held frame, a fast display) does nothing at all.
// Measured with this harness on the version before (D-065 perf fix): 186 setter calls and 305 trig
// calls a frame, 256 setter calls on a held frame; after: 116, 46 and 0.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadContent, loadFeel } from '../../../tools/testContent';
import type { ParallaxView } from '../view/ParallaxView';
import { NEWYEAR_SHEET } from './newyearKeys';
import { NuwejaarSceneView } from './NuwejaarView';
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
  img['destroy'] = () => undefined;
  return img;
}

function makeView(): NuwejaarSceneView {
  const feel = loadFeel();
  const special = loadContent().feesdae.specials.find((f) => f.id === 'newyear');
  if (special === undefined) throw new Error('no newyear');
  const sky = {
    id: 'sky',
    scrollFactor: 0.05,
    root: { x: 0, y: 0, scaleX: 1 },
    fixtures: { add: () => undefined },
  };
  const scene = {
    add: { image: () => stubImage(), rectangle: () => stubImage() },
    textures: {
      exists: (k: string) => k === NEWYEAR_SHEET,
      get: () => ({ getSourceImage: () => ({ width: 400 }) }),
    },
  };
  const parallax = {
    layer: (id: string) => (id === 'sky' ? sky : undefined),
    dimLayers: () => undefined,
  } as unknown as ParallaxView;
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
): { setters: number; trig: number; held: number } {
  for (let t = from - 120; t < from; t++) view.update(STATE, undefined, 0, t);
  const spies = (['sin', 'cos', 'atan2', 'hypot', 'tan', 'pow'] as const).map((f) =>
    vi.spyOn(Math, f),
  );
  calls.clear();
  for (let t = from; t < from + frames; t++) view.update(STATE, undefined, 0, t);
  const setters = [...calls.values()].reduce((a, b) => a + b, 0) / frames;
  const trig = spies.reduce((a, s) => a + s.mock.calls.length, 0) / frames;
  // A held frame: the same tick again.
  calls.clear();
  view.update(STATE, undefined, 0, from + frames - 1);
  const held = [...calls.values()].reduce((a, b) => a + b, 0);
  for (const s of spies) s.mockRestore();
  return { setters, trig, held };
}

describe('New Year view per-frame cost (D-065 perf)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a full pool of fireworks: one atan2 a spark, setters only on change, a held frame free', () => {
    const view = makeView();
    const m = measure(view);
    // 4 bursts × 16 sparks: about one atan2 per live spark and frame, no other trig per frame.
    expect(m.trig).toBeLessThanOrEqual(64);
    // Positions move every tick; rotation, scale and alpha only when they change.
    expect(m.setters).toBeLessThanOrEqual(150);
    expect(m.held).toBe(0);
    console.log(`[ny perf proxy] ${JSON.stringify(m)}`);
  });
});
