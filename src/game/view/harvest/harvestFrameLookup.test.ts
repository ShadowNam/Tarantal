// v1.18 perf (D-081): the Harvest view's constant lookups give what the old per-frame code built.
import { describe, expect, it } from 'vitest';
import { BABOON_SHEET } from '../baboon/baboonKeys';
import { HARVEST2_FRAME_NAMES, HARVEST2_SHEET } from './harvest2Sheet';
import { BABOON_BORROWED, texOf, workerFrame } from './harvestFrameLookup';
import { HARVEST_FRAME_NAMES, HARVEST_SHEET } from './harvestSheet';

describe('texOf (v1.18 perf)', () => {
  it('maps every frame to the sheet it is cut on', () => {
    for (const f of HARVEST_FRAME_NAMES) expect(texOf(f), f).toBe(HARVEST_SHEET);
    for (const f of HARVEST2_FRAME_NAMES) expect(texOf(f), f).toBe(HARVEST2_SHEET);
    for (const f of BABOON_BORROWED) expect(texOf(f), f).toBe(BABOON_SHEET);
  });
});

describe('workerFrame (v1.18 perf)', () => {
  const alt = (t: number, every: number): boolean => Math.floor(t / every) % 2 === 0;
  /** The frame name as the view used to build it each frame. */
  const built = (look: number, phase: string, t: number): string => {
    const l = look % 3;
    return phase === 'duck'
      ? `wk${String(l)}_duck`
      : phase === 'run' || phase === 'leave'
        ? `wk${String(l)}_run_${alt(t, 8) ? 'a' : 'b'}`
        : `wk${String(l)}_work_${alt(t, 12) ? 'a' : 'b'}`;
  };

  it('matches the built name for every look, phase and tick, and names a sheet frame', () => {
    const names = new Set<string>(HARVEST_FRAME_NAMES);
    for (let look = 0; look < 6; look++)
      for (const phase of ['work', 'duck', 'run', 'leave', 'walk'])
        for (let t = 0; t < 50; t++) {
          const f = workerFrame(look, phase, t, 8, 12);
          expect(f).toBe(built(look, phase, t));
          expect(names.has(f), f).toBe(true);
        }
  });
});
