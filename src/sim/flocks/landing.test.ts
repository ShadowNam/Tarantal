// v1.10 (D-067): landingX — where a flock will be on the ground: its centroid when grounded, and
// for a flushed flock the x where the flight model sets each bird down (the same steps as
// moveFlock, read only). Checked against a flushed flock flown to the ground.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { createStream } from '../rng';
import { centroid } from './Flock';
import { forceState } from './fsm';
import { landingX, moveFlock } from './steering';
import { makeFlock } from './testing';

describe('landingX (D-067)', () => {
  it('is the centroid on the ground', () => {
    const { flock, params } = makeFlock(loadContent(), { x: 1500 });
    expect(landingX(flock, params)).toBeCloseTo(centroid(flock).x, 6);
  });

  it('predicts where a flushed flock lands, within a few birds of it', () => {
    const c = loadContent();
    for (let seed = 1; seed <= 8; seed++) {
      const { flock, params } = makeFlock(c, { x: 1500, size: 6 });
      const rng = createStream(seed);
      forceState(flock, 'flush', 1400, 'event', params, rng);
      // After the stagger, mid-flight and gliding: the prediction holds all the way down.
      for (let t = 0; t < 2000; t++) {
        if (flock.members.every((b) => b.phase === 'land' || b.phase === 'walk')) break;
        if (t === 30 || t === 90) {
          const at = landingX(flock, params);
          const probe = structuredClone(flock);
          for (let k = 0; k < 2000; k++) {
            if (probe.members.every((b) => b.phase === 'land' || b.phase === 'walk')) break;
            moveFlock(probe, params, createStream(seed + 100));
          }
          // Landing x as the birds touch down (they run on a little after: not counted).
          expect(Math.abs(at - centroid(probe).x)).toBeLessThan(120);
        }
        moveFlock(flock, params, rng);
      }
    }
  });
});
