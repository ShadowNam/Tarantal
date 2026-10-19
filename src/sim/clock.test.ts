import { describe, expect, it } from 'vitest';
import { msToTicks, secondsToTicks, TICKS_PER_SECOND } from './clock';

describe('clock', () => {
  it('converts at 60 Hz', () => {
    expect(TICKS_PER_SECOND).toBe(60);
    expect(secondsToTicks(90)).toBe(5400);
    expect(secondsToTicks(15)).toBe(900);
    expect(msToTicks(900)).toBe(54);
    expect(msToTicks(140)).toBe(8); // 8.4 ticks rounds to 8
    expect(msToTicks(250)).toBe(15);
  });
});
