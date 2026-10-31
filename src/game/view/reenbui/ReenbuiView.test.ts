// v1.10 (D-067, perf lessons 32–34): Reënbui's view with stub images that count every setter — a
// proxy for perf.spec's "Reënbui view ms per frame" at 4× throttle (≈ 7 µs a Phaser call, so a
// 0.3 ms budget is ≈ 40 calls a frame). At the swarm's peak, in the smoke's regime (~20 sim ticks
// a frame) and at 60 fps; a frame whose tick has not moved does nothing; the lightning forks go
// through the shared flash limiter (≥ ½ s apart, dimmer with "reduce flashes", none with "reduce
// motion"); the columns stand on their plane's ground band.
import { describe, expect, it } from 'vitest';
import type { ReenbuiView as SimReenbui, SimState } from '../../../sim/types';
import { FlashLimiter } from '../flashLimit';
import { LayerDimmer, type DimLayer } from '../layerDimmer';
import type { ParallaxView } from '../ParallaxView';
import { REENBUI_SHEET } from './reenbuiSheet';
import { ReenbuiView } from './ReenbuiView';

const calls = new Map<string, number>();
const count = (name: string): void => {
  calls.set(name, (calls.get(name) ?? 0) + 1);
};
const total = (): number => [...calls.values()].reduce((a, b) => a + b, 0);

function stub(): Record<string, unknown> {
  const img: Record<string, unknown> = { scaleX: 1, scaleY: 1, list: [] as unknown[] };
  const chain =
    (name: string, f?: (...a: unknown[]) => void) =>
    (...a: unknown[]) => {
      count(name);
      f?.(...a);
      return img;
    };
  for (const n of ['setVisible', 'setAlpha', 'setPosition', 'setFrame', 'setTint', 'setFlipX'])
    img[n] = chain(n);
  img['setScale'] = chain('setScale', (x) => {
    img['scaleX'] = x;
  });
  img['add'] = (c: unknown) => {
    (img['list'] as unknown[]).push(c);
    return img;
  };
  img['destroy'] = () => undefined;
  return img;
}

function layerNode(id: string, plane: string | null): Record<string, unknown> {
  return {
    id,
    plane,
    scrollFactor: 1,
    root: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    fixtures: stub(),
  };
}

function makeView(
  opts: { reduceFlashes?: boolean; reducedMotion?: boolean; limiter?: FlashLimiter } = {},
) {
  const layers = [
    layerNode('sky', null),
    layerNode('far', 'far'),
    layerNode('mid', 'mid'),
    layerNode('near', 'near'),
  ];
  const dimLayers: DimLayer[] = layers.map((l) => ({
    id: l['id'] as string,
    base: 0xffffff,
    images: () =>
      Array.from({ length: 30 }, () => ({
        tintTopLeft: 0xffffff,
        setTint(t: number) {
          count('dimTint');
          this.tintTopLeft = t;
          return this;
        },
      })),
    fauna: [],
  }));
  const dimmer = new LayerDimmer(dimLayers);
  const parallax = {
    layers,
    layer: (id: string) => layers.find((l) => l['id'] === id),
    layerTint: () => 0xffffff,
    dimLayers: (m: ReadonlyMap<string, number>) => {
      dimmer.set(m);
    },
    stepDim: () => {
      dimmer.step();
    },
  } as unknown as ParallaxView;
  const frame = { customPivot: false, pivotX: 0, pivotY: 0 };
  const scene = {
    add: { image: () => stub(), container: () => stub() },
    textures: {
      exists: (k: string) => k === REENBUI_SHEET,
      get: () => ({ getSourceImage: () => ({ width: 1024 }), has: () => true, get: () => frame }),
    },
  };
  let clock = 0;
  const view = new ReenbuiView({
    scene: scene as never,
    parallax,
    manifest: { delivered: () => true, upgrade: () => [] },
    screen: stub() as never,
    planeScale: { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    groundY: { near: [880, 1000], mid: [700, 760], far: [560, 600] },
    flashes: opts.limiter ?? new FlashLimiter(3),
    reduceFlashes: () => opts.reduceFlashes === true,
    reducedMotion: opts.reducedMotion === true,
    now: () => (clock += 0.001),
    hooks: true,
  });
  return view;
}

const PLAN: SimReenbui = {
  phase: null,
  buildupTick: 600,
  dropsTick: 960,
  swarmTick: 1140,
  easingTick: 2040,
  endTick: 2280,
  withStorm: false,
  columns: [],
  bagged: 0,
  mult: 1.3,
};
const COLUMNS: SimReenbui['columns'] = [
  { id: 0, plane: 'mid', x: 900, y: 720 },
  { id: 1, plane: 'mid', x: 1500, y: 740 },
  { id: 2, plane: 'far', x: 1100, y: 580 },
  { id: 3, plane: 'mid', x: 300, y: 710 },
];

function state(tick: number, plan: SimReenbui = PLAN): SimState {
  const phase =
    tick < plan.buildupTick || tick >= plan.endTick
      ? null
      : tick >= plan.easingTick
        ? 'easing'
        : tick >= plan.swarmTick
          ? 'swarm'
          : tick >= plan.dropsTick
            ? 'drops'
            : 'buildup';
  const cols = phase === 'swarm' || phase === 'easing' ? COLUMNS : [];
  return { tick, reenbui: { ...plan, phase, columns: cols } } as unknown as SimState;
}

/** Runs frames from `from` to `to` (`step` ticks a frame); setter calls per frame after warm-up. */
function run(view: ReenbuiView, from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let t = from; t < to; t += step) {
    calls.clear();
    view.update(state(t), 1920);
    out.push(total());
  }
  return out;
}

describe('ReenbuiView (D-067, lessons 32–34)', () => {
  it('stays within ~40 Phaser calls a frame at the swarm peak, 20 ticks a frame and at 60 fps', () => {
    const v = makeView();
    // The whole event once (pools made, dim ramped), then the peak measured.
    run(v, 500, 1400, 20);
    const peak20 = run(v, 1400, 2000, 20);
    const peak1 = run(v, 1400, 1700, 1);
    expect(Math.max(...peak20)).toBeLessThanOrEqual(40);
    expect(peak20.reduce((a, b) => a + b, 0) / peak20.length).toBeLessThanOrEqual(16);
    expect(peak1.reduce((a, b) => a + b, 0) / peak1.length).toBeLessThanOrEqual(10);
    // The build-up and easing (towers rolling, dim stepping, chunked): still bounded.
    const v2 = makeView();
    const ramp = run(v2, 560, 2400, 20);
    expect(Math.max(...ramp)).toBeLessThanOrEqual(80);
  });

  it('does nothing on a frame whose tick has not moved (a held hunt)', () => {
    const v = makeView();
    run(v, 1100, 1400, 20);
    v.update(state(1400), 1920);
    calls.clear();
    for (let i = 0; i < 10; i++) v.update(state(1400), 1920);
    expect(total()).toBe(0);
  });

  it('heavy first drops, a drizzle in the swarm, none before or once it eases; columns on the ground', () => {
    const v = makeView();
    run(v, 600, 900, 2);
    expect(v.hook?.rainNear).toBe(0);
    expect(v.hook?.phase).toBe('buildup');
    run(v, 900, 1136, 2);
    const heavy = { near: v.hook?.rainNear ?? 0, far: v.hook?.rainFar ?? 0 };
    expect(v.hook?.phase).toBe('drops');
    expect(heavy.near).toBeGreaterThan(0.4);
    run(v, 1136, 1500, 2);
    const h = v.hook;
    expect(h?.phase).toBe('swarm');
    // The drizzle: no fat near drops, the fine streaks fainter than the first drops' rain.
    expect(h?.rainNear).toBe(0);
    expect(h?.rainFar).toBeGreaterThan(0);
    expect(h?.rainFar ?? 1).toBeLessThan(Math.max(heavy.near, heavy.far));
    expect(h?.columns).toHaveLength(4);
    for (const c of h?.columns ?? []) {
      expect(c.y).toBeGreaterThanOrEqual(c.groundTop);
      expect(c.y).toBeLessThanOrEqual(c.groundBottom);
    }
    expect(h?.columns.some((c) => c.visible)).toBe(true);
    run(v, 1500, 2120, 4);
    expect(v.hook?.phase).toBe('easing');
    expect(v.hook?.rainFar).toBe(0);
    run(v, 2120, 2600, 4);
    expect(v.hook?.rainNear).toBe(0);
    expect(v.hook?.columns.every((c) => !c.visible)).toBe(true);
  });

  it('forks only through the shared limiter, ≥ ½ s apart; none with reduce motion', () => {
    const lim = new FlashLimiter(3);
    const v = makeView({ limiter: lim });
    const seen: number[] = [];
    let last = 0;
    for (let t = 560; t < 2100; t++) {
      v.update(state(t), 1920);
      const f = v.hook?.forks ?? 0;
      if (f > last) seen.push(t);
      last = f;
    }
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < seen.length; i++)
      expect((seen[i] ?? 0) - (seen[i - 1] ?? 0)).toBeGreaterThanOrEqual(30);
    const calm = makeView({ reducedMotion: true });
    run(calm, 560, 2100, 1);
    expect(calm.hook?.forks).toBe(0);
    // A limiter that is full refuses the fork (it stays dark).
    const full = new FlashLimiter(0);
    const refused = makeView({ limiter: full });
    run(refused, 560, 2100, 1);
    expect(refused.hook?.forks).toBe(0);
    expect(refused.hook?.forksRefused).toBeGreaterThan(0);
  });

  it('with the Kalahari storm: no rain, towers or forks of its own; the columns still rise', () => {
    const v = makeView();
    const plan = { ...PLAN, buildupTick: 1140, dropsTick: 1140, withStorm: true };
    for (let t = 1100; t < 1500; t += 2) v.update(state(t, plan), 1920);
    expect(v.hook?.rainNear).toBe(0);
    expect(v.hook?.clouds).toBe(0);
    expect(v.hook?.forks).toBe(0);
    expect(v.hook?.columns.some((c) => c.visible)).toBe(true);
  });
});
