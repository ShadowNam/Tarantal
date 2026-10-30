// v1.8c (D-063): the Harvest's workers stand out of the line of fire of every target over the
// whole camera sweep (harvestLineOfFire.ts); a worker moved into the field is caught.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../testContent';
import { canMeet, harvestLineOfFireIssues, workerBoxes } from './harvestLineOfFire';

const content = loadContent();
const oes = content.biomes.find((b) => b.id === content.modes.modes.harvest.biome);

describe('the Harvest workers keep out of the line of fire (D-063)', () => {
  it('no target can line up with a worker anywhere in the sweep', () => {
    if (oes === undefined) throw new Error('no Harvest map');
    expect(workerBoxes(content, oes)).toHaveLength(oes.harvest?.workers.length ?? -1);
    expect(harvestLineOfFireIssues(content, oes)).toEqual([]);
  });

  it('catches a worker standing in the rows', () => {
    if (oes?.harvest === undefined) throw new Error('no Harvest map');
    const moved = {
      ...oes,
      harvest: {
        ...oes.harvest,
        workers: oes.harvest.workers.map((w, i) => (i === 0 ? { ...w, dx: -900 } : w)),
      },
    };
    expect(harvestLineOfFireIssues(content, moved).length).toBeGreaterThan(0);
  });

  it('two boxes on layers that scroll differently meet somewhere in the sweep', () => {
    // A mid box 500 px left of a near one catches up as the camera pans right (0.4 px per px).
    const a = { x0: 0, x1: 10, y0: 0, y1: 10, scroll: 1, what: 'a' };
    expect(canMeet(a, { ...a, x0: -500, x1: -490, scroll: 0.6 })).toBe(true);
    expect(canMeet(a, { ...a, x0: 500, x1: 510, scroll: 0.6 })).toBe(false);
    expect(canMeet(a, { ...a, y0: 20, y1: 30 })).toBe(false);
  });
});
