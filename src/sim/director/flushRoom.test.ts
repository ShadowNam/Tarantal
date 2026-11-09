import { describe, expect, it } from 'vitest';
import { flushRoom } from './flushRoom';

describe('flushRoom (D-080)', () => {
  const caps = { liveFlocks: 2, maxFlocks: 3, aliveBirds: 20, maxBirds: 30 };

  it('allows a flock when both caps have room', () => {
    expect(flushRoom(caps, 5)).toBe(true);
    expect(flushRoom({ ...caps, aliveBirds: 25 }, 5)).toBe(true);
  });

  it('refuses at the flock cap', () => {
    expect(flushRoom({ ...caps, liveFlocks: 3 }, 5)).toBe(false);
  });

  it('refuses when the bird cap has no room for every bird of the flock', () => {
    expect(flushRoom({ ...caps, aliveBirds: 26 }, 5)).toBe(false);
    expect(flushRoom({ ...caps, aliveBirds: 30 }, 1)).toBe(false);
  });
});
