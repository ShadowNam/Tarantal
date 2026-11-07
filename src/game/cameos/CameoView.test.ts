// v1.13 (D-075, perf lessons 32–33): the cameos' view with stub images that count every setter — a
// proxy for perf.spec's cameoMs at 4× throttle (≈ 7 µs a Phaser call: ≈ 40 calls a frame for
// 0.3 ms). Through real hunts with several cameos out at ~20 sim ticks a frame (the smoke's
// regime) and at 1 tick a frame, every frame stays inside it; a frame where nothing changed makes
// no call. Every frame the picker asks for is on its area's sheet. The sheet: HD only inside the
// budget, and gone with the hunt; with no delivery nothing is drawn and nothing waits.
import { afterEach, describe, expect, it } from 'vitest';
import { base } from '../../../tools/simHarness';
import { loadFeel } from '../../../tools/testContent';
import { createSim } from '../../sim/Sim';
import type { CameoVisitView, SimState } from '../../sim/types';
import { withCameoParams } from '../devContent';
import type { ParallaxView } from '../view/ParallaxView';
import { CAMEO_KIND_AREA, cameoCalling, cameoPose } from './cameoAnim';
import { CAMEO_SHEETS, CAMEO_SHEET_SIZE, type CameoSheetArea } from './cameoKeys';
import { cameoFrames } from './cameoSheet';
import {
  CameoView,
  ensureCameoTexture,
  releaseCameoTexture,
  resetCameoFiles,
  setCameoImagesForTest,
} from './CameoView';

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
    'setFrame',
  ])
    img[n] = chain();
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

function makeView(area: CameoSheetArea, textures = stubTextures()) {
  const layers = ['mid', 'near'].map((id) => ({
    id,
    root: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    fixtures: { add: () => undefined },
  }));
  const parallax = {
    layer: (id: string) => layers.find((l) => id.includes(l.id)) ?? layers[0],
    layerTint: () => 0xffffff,
    faunaTrumpetSeen: () => false,
  } as unknown as ParallaxView;
  const scene = { add: { image: () => stubImage() }, textures } as unknown as Phaser.Scene;
  const seen: string[] = [];
  const view = new CameoView({
    scene,
    parallax,
    now: () => 0,
    tuning: feel.cameos,
    hd: false,
    area,
    reducedMotion: false,
    sightingAlpha: 0.5,
    onSighted: (id) => {
      seen.push(id);
      return true;
    },
    hooks: true,
  });
  /** Pans the stub layers so the visits are in view (layer x = screen x + offset). */
  const pan = (s: SimState): void => {
    const v = s.cameos?.visits[0];
    const m = v?.members[0];
    for (const l of layers) l.root.x = m === undefined ? 0 : 960 - m.x;
  };
  return { view, textures, pan, seen };
}

/** A hunt with these cameos out at once and more coming often (the preview content). */
function hunt(biome: string, kinds: string, tpf: number, frames: number): SimState[] {
  const content = withCameoParams(
    { ...base, brakkie: { ...base.brakkie, areas: [] } },
    new URLSearchParams(`cameos=1&cameoPreview=${kinds}`),
  );
  const sim = createSim({ seed: 4, content, mode: { id: 'classic', biome }, inputKind: 'pointer' });
  const out: SimState[] = [];
  for (let f = 0; f < frames && !sim.isOver(); f++) {
    for (let i = 0; i < tpf; i++) sim.step([]);
    sim.drainEvents();
    out.push(sim.snapshot());
  }
  return out;
}

describe('CameoView (D-075)', () => {
  afterEach(() => {
    resetCameoFiles();
  });

  it('every frame the picker asks for, in every phase and reaction, is on its area sheet', () => {
    const phases = ['walk', 'pause', 'react', 'flee', 'fadeIn', 'fadeOut'] as const;
    for (const [kind, area] of Object.entries(CAMEO_KIND_AREA)) {
      const names = new Set(cameoFrames(area).map((f) => f.name));
      for (const phase of phases)
        for (let t = 0; t < 80; t += 3)
          for (const role of ['adult', 'young'] as const) {
            const v = {
              kind,
              phase,
              t,
              dur: 40,
              facing: 1,
              alpha: 1,
              reaction: null,
              members: [],
            } as unknown as CameoVisitView;
            const p = cameoPose(v, { role, x: 0, y: 0, gaitT: t });
            expect(names.has(p.frame), `${kind} ${phase} ${String(t)} ${p.frame}`).toBe(true);
            expect(p.lift).toBeGreaterThanOrEqual(0);
          }
    }
  });

  it('the soundscape makes room while a cameo reacts or the elephants trumpet', () => {
    const base0 = { visitsSoFar: 0, hits: 0, aimedHits: 0, alarms: 0, trumpets: 0, flapTicks: 60 };
    expect(cameoCalling({ tick: 10, cameos: null })).toBe(false);
    expect(cameoCalling({ tick: 10, cameos: { ...base0, visits: [], trumpetTick: 5 } })).toBe(true);
    expect(cameoCalling({ tick: 100, cameos: { ...base0, visits: [], trumpetTick: 5 } })).toBe(
      false,
    );
  });

  for (const [biome, area, kinds, tpf] of [
    ['bushveld-winter', 'bushveld', 'warthogs,dungBeetle', 20],
    ['kalahari-summer', 'kalahari', 'springbok', 20],
    ['karoo-autumn', 'karoo', 'tortoise,ostrich', 20],
    ['namibie', 'namibie', 'gemsbok', 1],
  ] as const)
    it(`≤ 40 Phaser calls a frame (the whole budget, every cameo out) on ${area} at ${String(tpf)} tick(s) a frame`, () => {
      const { w, h } = CAMEO_SHEET_SIZE[area];
      setCameoImagesForTest(area, { width: w, height: h } as HTMLImageElement, null);
      const { view, pan, seen } = makeView(area);
      let worst = 0;
      let drawn = 0;
      const states = hunt(biome, kinds, tpf, tpf === 1 ? 900 : 200);
      for (const s of states) {
        pan(s);
        view.update(s);
        if (view.hook.sheet !== null) worst = Math.max(worst, view.hook.calls);
        if (view.hook.visits.some((v) => v.members.some((m) => m.visible))) drawn++;
      }
      expect(drawn).toBeGreaterThan(states.length / 4);
      expect(worst).toBeLessThanOrEqual(40);
      expect(seen.length).toBeGreaterThan(0);
      // A frame whose tick hasn't moved changes nothing.
      const last = states.at(-1);
      if (last !== undefined) {
        view.update(last);
        view.update(last);
        expect(view.hook.calls).toBe(0);
      }
    });

  it('HD only inside the texture budget; the sheet is removed with the hunt', () => {
    const area = 'karoo';
    const { w, h } = CAMEO_SHEET_SIZE[area];
    setCameoImagesForTest(
      area,
      { width: w, height: h } as HTMLImageElement,
      { width: w * 2, height: h * 2 } as HTMLImageElement,
    );
    const roomy = stubTextures();
    const tm = (x: ReturnType<typeof stubTextures>) =>
      x as unknown as Phaser.Textures.TextureManager;
    expect(ensureCameoTexture(tm(roomy), area, true, 1e9)?.sheet).toBe('hd');
    const full = stubTextures();
    // 249.5 MiB in use: the 2 MiB twin doesn't fit under 250 MiB (256 − 6).
    full.tex.set('heavy', { w: 249.5 * 1024 * 256, h: 1 });
    const budget = (feel.cameos.hd.budgetMiB - feel.cameos.hd.headroomMiB) * 1024 * 1024;
    expect(ensureCameoTexture(tm(full), area, true, budget)?.sheet).toBe('standard');
    expect(full.tex.get(CAMEO_SHEETS[area])?.w).toBe(w);
    releaseCameoTexture(tm(full), area);
    expect(full.tex.has(CAMEO_SHEETS[area])).toBe(false);
    const { view, textures } = makeView(area);
    for (const s of hunt('karoo-autumn', 'tortoise', 20, 40)) view.update(s);
    expect(textures.tex.has(CAMEO_SHEETS[area])).toBe(true);
    view.destroy();
    expect(textures.tex.has(CAMEO_SHEETS[area])).toBe(false);
  });

  it('with no delivery nothing is drawn and nothing waits', () => {
    const { view, textures } = makeView('bushveld');
    for (const s of hunt('bushveld-winter', 'warthogs', 20, 60)) view.update(s);
    expect(view.hook.visits).toHaveLength(0);
    expect(view.hook.sheet).toBeNull();
    expect(textures.tex.size).toBe(0);
  });
});
