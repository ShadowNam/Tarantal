import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/events';
import type { HuntResult } from '../sim/types';
import { createHuntLogger } from './huntLog';

describe('hunt log', () => {
  it('collects creatures seen and secrets set off from the event stream', () => {
    const log = createHuntLogger();
    const events: SimEvent[] = [
      {
        type: 'birdSpawned',
        tick: 1,
        birdId: 1,
        creature: 'tarentaal',
        plane: 'mid',
        motion: 'flock',
      },
      {
        type: 'birdSpawned',
        tick: 2,
        birdId: 2,
        creature: 'kwevoel',
        plane: 'mid',
        motion: 'perch',
      },
      {
        type: 'birdSpawned',
        tick: 3,
        birdId: 3,
        creature: 'tarentaal',
        plane: 'far',
        motion: 'flock',
      },
      { type: 'secretTriggered', tick: 4, propId: 'potjie', partId: 'lid' },
    ] as SimEvent[];
    log.add(events);
    expect([...log.creaturesSeen]).toEqual(['tarentaal', 'kwevoel']);
    const result = {
      mode: 'classic',
      biome: 'karoo-autumn',
      score: 10,
      rank: 'stadsjapie',
      shots: 3,
      bagged: 1,
      baggedByPlane: { near: 0, mid: 0, far: 1 },
      wingShots: 0,
      wholeFlocks: 0,
      secrets: 1,
      crates: 0,
    } as unknown as HuntResult;
    const h = log.finish(result);
    expect(h.creaturesSeen).toEqual(['kwevoel', 'tarentaal']);
    expect(h.secretsFound).toEqual(['potjie']);
    expect(h.baggedFar).toBe(1);
  });
});
