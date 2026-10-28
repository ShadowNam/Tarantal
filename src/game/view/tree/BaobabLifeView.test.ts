import { describe, expect, it, vi } from 'vitest';
import { loadContent, loadFeel } from '../../../../tools/testContent';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import { coreWidth } from '../../../sim/world';
import type { ParallaxView } from '../ParallaxView';

vi.mock('phaser', () => ({}));
const { BaobabLifeView } = await import('./BaobabLifeView');
const { HOLLOWS } = await import('./baobabShape');

const content = loadContent();
const feel = loadFeel();
const biome = content.biomes.find((b) => b.id === 'bushveld-winter');
if (biome === undefined) throw new Error('bushveld');
const prop = biome.props.find((p) => p.asset === 'bushveld/baobab');
const layer = biome.layers.find((l) => l.id === prop?.layer);
if (prop === undefined || layer === undefined) throw new Error('baobab');
const f = layer.scrollFactor;

function view(cam = 2000) {
  return new BaobabLifeView({} as never, feel.treeLife, biome as never, {} as ParallaxView, {
    seed: () => 7,
    dusk: false,
    reducedMotion: false,
    preview: 'owl',
    farFactor: content.scoring.planes.far.scrollFactor,
    cameraAt: () => cam,
  });
}

/** A pellet that lands at layer point (lx, ly) with the camera at `cam` (planeX mapping). */
function pelletAt(lx: number, ly: number, tick: number, cam = 2000): SimEvent {
  const dx = lx - ((cam - 960) * f + 960);
  return {
    type: 'pelletImpact',
    tick,
    shotId: tick,
    dx,
    sy: ly,
    birdId: null,
    propId: prop?.id ?? null,
    partId: null,
    crateId: null,
  };
}

const state = (tick: number): SimState => ({ tick, cameraX: 2000 }) as unknown as SimState;
const owlX = prop.u * coreWidth(f) + HOLLOWS.owl.x;
const owlY = prop.y + HOLLOWS.owl.y;
const T = 60;

describe('BaobabLifeView near shots (D-057)', () => {
  it('a pellet near the owl, mapped through its layer, startles it', () => {
    const v = view();
    v.handle([pelletAt(owlX + 20, owlY - 10, T)], state(T), () => null);
    expect(v.duckCount).toBe(1);
    // Once per visit: a second shot doesn't count again.
    v.handle([pelletAt(owlX, owlY, T + 5)], state(T + 5), () => null);
    expect(v.duckCount).toBe(1);
  });

  it('a pellet far from every resident startles none', () => {
    const v = view();
    v.handle([pelletAt(owlX + 400, owlY - 300, T)], state(T), () => null);
    expect(v.duckCount).toBe(0);
  });

  it('the same screen point maps elsewhere with the camera moved: no duck', () => {
    const v = view(2600);
    v.handle([pelletAt(owlX, owlY, T, 2000)], state(T), () => null);
    expect(v.duckCount).toBe(0);
  });

  it('a pellet a nearer bird stopped never reaches the tree', () => {
    const v = view();
    v.handle([pelletAt(owlX, owlY, T)], state(T), () => ({ factor: 1, creature: true }));
    expect(v.duckCount).toBe(0);
  });
});
