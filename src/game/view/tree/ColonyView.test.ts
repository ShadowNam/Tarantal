import { describe, expect, it, vi } from 'vitest';
import { loadContent, loadFeel } from '../../../../tools/testContent';
import type { SimEvent } from '../../../sim/events';
import type { SimState } from '../../../sim/types';
import { coreWidth } from '../../../sim/world';
import type { ParallaxView } from '../ParallaxView';

vi.mock('phaser', () => ({}));
const { ColonyView } = await import('./ColonyView');

const content = loadContent();
const feel = loadFeel();
const biome = content.biomes.find((b) => b.id === 'kalahari-summer');
if (biome === undefined) throw new Error('kalahari');
const prop = biome.props.find((p) => p.id === 'weaver_camelthorn');
const layer = biome.layers.find((l) => l.id === prop?.layer);
if (prop === undefined || layer === undefined || prop.secret?.type !== 'singleHit')
  throw new Error('nest');
const shape = prop.secret.part.shape;
const f = layer.scrollFactor;
const planeScale = {
  near: content.scoring.planes.near.scale,
  mid: content.scoring.planes.mid.scale,
  far: content.scoring.planes.far.scale,
  ver: content.scoring.planes.ver.scale,
};

function view() {
  return new ColonyView({} as never, feel, biome as never, {} as ParallaxView, {
    seed: () => 3,
    reducedMotion: false,
    planeScale,
    falconPreview: false,
    farFactor: content.scoring.planes.far.scrollFactor,
    cameraAt: () => 1500,
  });
}

function pellet(lx: number, ly: number, tick: number): SimEvent {
  return {
    type: 'pelletImpact',
    tick,
    shotId: tick,
    dx: lx - ((1500 - 960) * f + 960),
    sy: ly,
    birdId: null,
    propId: null,
    partId: null,
    crateId: null,
  };
}
const state = (tick: number): SimState => ({ tick, cameraX: 1500 }) as unknown as SimState;
const nestX = prop.u * coreWidth(f) + shape.ox;
const nestY = prop.y + shape.oy;

describe('ColonyView scatters (D-057)', () => {
  it('finds the Kalahari family nest', () => {
    expect(ColonyView.wants(biome, feel)).toBe(true);
  });

  it('a pellet just beside the nest scatters the colony; one far off does not', () => {
    const v = view();
    v.handle([pellet(nestX + 400, nestY - 300, 60)], state(60), () => null);
    expect(v.hook.scatters).toBe(0);
    const w = shape.type === 'ellipse' ? shape.rx : 0;
    v.handle([pellet(nestX + w + 20, nestY, 90)], state(90), () => null);
    expect(v.scatterCount).toBe(1);
  });

  it('the nest shot (secretPenalty) scatters it too', () => {
    const v = view();
    v.handle(
      [{ type: 'secretPenalty', tick: 120, propId: prop.id } as unknown as SimEvent],
      state(120),
      () => null,
    );
    expect(v.scatterCount).toBe(1);
  });
});
