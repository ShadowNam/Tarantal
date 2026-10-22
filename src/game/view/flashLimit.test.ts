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
    // Two sources strobing at 8 Hz for a second: only 3 strikes ever show (a strike both sources
    // light at the same moment is one flash).
    let shown = 0;
    let prev = false;
    for (let t = 0; t < 1000; t += 16) {
      const on = Math.floor(t / 62) % 2 === 0;
      const a = storm.lit(on, t);
      const b = season.lit(on, t);
      if ((a || b) && !prev) shown++;
      prev = a || b;
    }
    expect(shown).toBe(3);
  });

  it('one strike seen by two sources (same or next frame) takes one slot', () => {
    const l = new FlashLimiter(3, 50);
    const storm = new FlashGate(l);
    const dark = new FlashGate(l);
    // Three strikes 300 ms apart, each lighting both overlays a frame apart: all three show.
    let shown = 0;
    for (const at of [0, 300, 600]) {
      if (storm.lit(true, at)) shown++;
      if (dark.lit(true, at + 16)) shown++;
      storm.lit(false, at + 100);
      dark.lit(false, at + 100);
    }
    expect(shown).toBe(6);
    // A fourth strike within the second is refused for both sources.
    expect(storm.lit(true, 900)).toBe(false);
    expect(dark.lit(true, 916)).toBe(false);
  });

  it('feel.json caps large flashes at 3 a second or fewer', () => {
    expect(loadFeel().accessibility.maxLargeFlashesPerSec).toBeLessThanOrEqual(3);
  });
});
