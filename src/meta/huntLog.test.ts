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

  it('v1.10 (D-067): a Reënbui swarm adds the alates to the Bird Book and counts its bags', () => {
    const log = createHuntLogger();
    log.add([
      { type: 'alatesSwarm', tick: 100, mult: 1.3, columns: [] },
      { type: 'rainEased', tick: 1000, bagged: 11 },
    ]);
    const h = log.finish({
      mode: 'classic',
      biome: 'kalahari-summer',
      baggedByPlane: { near: 0, mid: 0, far: 0, ver: 0 },
    } as unknown as HuntResult);
    expect(h.creaturesSeen).toContain('rysmier');
    expect(h.reenbuiBags).toBe(11);
    expect(
      createHuntLogger().finish({ baggedByPlane: { far: 0, ver: 0 } } as unknown as HuntResult)
        .reenbuiBags,
    ).toBe(0);
  });

  it('records a perching creature only once it lands and calls (same rule as the ⛔ call-out)', () => {
    const log = createHuntLogger((c) => c === 'kwevoel');
    log.add([
      {
        type: 'birdSpawned',
        tick: 1,
        birdId: 9,
        creature: 'kwevoel',
        plane: 'mid',
        motion: 'perch',
      },
    ] as SimEvent[]);
    expect(log.creaturesSeen.has('kwevoel')).toBe(false);
    log.add([
      { type: 'birdCalled', tick: 200, birdId: 9, creature: 'kwevoel', plane: 'mid', x: 0, y: 0 },
    ] as unknown as SimEvent[]);
    expect(log.creaturesSeen.has('kwevoel')).toBe(true);
  });

  it('v1.7 (D-044): a meerkat colony counts the meerkat as seen; the Familiefoto is a secret', () => {
    const log = createHuntLogger();
    log.add([
      { type: 'colonySpawned', tick: 0, colonyId: 'dune', plane: 'mid', x: 1, y: 812, family: 6 },
      { type: 'secretTriggered', tick: 900, propId: 'familiefoto', partId: 'dune' },
    ]);
    expect(log.creaturesSeen.has('meerkat')).toBe(true);
    const result = {
      mode: 'classic',
      biome: 'kalahari-summer',
      baggedByPlane: { near: 0, mid: 0, far: 0, ver: 0 },
    } as unknown as HuntResult;
    expect(log.finish(result).secretsFound).toEqual(['familiefoto']);
  });
});
