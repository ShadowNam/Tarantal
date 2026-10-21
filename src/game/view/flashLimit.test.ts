import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import { FlashGate, FlashLimiter } from './flashLimit';

describe('large-flash limit (GDD §18.3, M10)', () => {
  it('allows at most N flash starts in any rolling second', () => {
    const l = new FlashLimiter(3);
    expect([0, 100, 200, 300].map((t) => l.start(t))).toEqual([true, true, true, false]);
    expect(l.start(999)).toBe(false);
    expect(l.start(1000)).toBe(true);
  });

  it('a refused flash stays dark for its whole length; sources share the budget', () => {
    const l = new FlashLimiter(3);
    const storm = new FlashGate(l);
    const season = new FlashGate(l);
    // Two sources strobing at 8 Hz for a second: only 3 flashes ever show.
    let shown = 0;
    let prev = [false, false];
    for (let t = 0; t < 1000; t += 16) {
      const on = Math.floor(t / 62) % 2 === 0;
      const now = [storm.lit(on, t), season.lit(on, t)];
      now.forEach((lit, i) => {
        if (lit && prev[i] !== true) shown++;
      });
      prev = now;
    }
    expect(shown).toBe(3);
  });

  it('feel.json caps large flashes at 3 a second or fewer', () => {
    expect(loadFeel().accessibility.maxLargeFlashesPerSec).toBeLessThanOrEqual(3);
  });
});
