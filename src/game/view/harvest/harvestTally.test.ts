// v1.18 (D-081, review): the tally's "Crop saved" row (and the braai story and share card that
// read it) is the rush's crop, as the fence closed — not what Phase 2 left.
import { describe, expect, it } from 'vitest';
import { ofType } from '../../../../tools/simHarness';
import { loadContent } from '../../../../tools/testContent';
import type { SimEvent } from '../../../sim/events';
import { createSim } from '../../../sim/Sim';
import { harvestTallyNumbers } from './harvestTally';

const base = loadContent();
const H = base.modes.modes.harvest;

/** A Harvest that always unlocks Phase 2, where the animals eat fast. */
const content = {
  ...base,
  modes: {
    ...base.modes,
    modes: {
      ...base.modes.modes,
      harvest: {
        ...H,
        // The rush eats a little (no one shoots here), so it leaves some for Phase 2.
        crop: {
          ...H.crop,
          drainPerSecond: { guineafowl: 0.005, warthog: 0.1, baboon: 0.1 },
        },
        phase2: {
          ...H.phase2,
          unlockScore: 0,
          drainPerSecond: { warthog: 3, piglet: 3, baboon: 3 },
        },
      },
    },
  },
};

describe('the Harvest tally numbers (v1.18, D-081, review)', () => {
  it('"Crop saved" is the crop as the fence closed, beside its crop bonus; Phase 2 keeps its own', () => {
    const s = createSim({ seed: 5, content, mode: { id: 'harvest' }, inputKind: 'pointer' });
    const ev: SimEvent[] = [];
    for (let i = 0; i < 20000 && !s.isOver(); i++) {
      s.step([]);
      ev.push(...s.drainEvents());
    }
    const closed = ofType(ev, 'harvestFenceClosed')[0];
    const ended = ofType(ev, 'phase2Ended')[0];
    if (closed === undefined || ended === undefined) throw new Error('no Phase 2');
    const h = s.snapshot().harvest;
    // Phase 2 ate some of it: the live crop is not the rush's.
    expect(Math.floor(ended.crop)).toBeLessThan(Math.floor(closed.crop));
    expect(h?.crop).toBe(ended.crop);
    const n = harvestTallyNumbers(h);
    expect(n.crop).toBe(Math.floor(closed.crop));
    expect(n.cropBonus).toBe(closed.bonus);
    expect(h?.phase2?.result?.cropAtStart).toBe(closed.crop);
  });

  it('no Harvest: zeros', () => {
    expect(harvestTallyNumbers(null)).toEqual({ crop: 0, cropBonus: 0, bystanderPenalty: 0 });
  });
});
