import { describe, expect, it } from 'vitest';
import { loadFeel } from '../../../tools/testContent';
import { rumbleDue, stampedeTintAlpha } from './juice';

const feel = loadFeel();
const st = feel.juice.stampede;

describe('Stampede juice (GDD §17, M10)', () => {
  it('the sky tint is off outside the Stampede and dimmed by reduce flashes', () => {
    const reduced = feel.accessibility.reducedFlashAlpha;
    expect(stampedeTintAlpha(false, st.tintAlpha, false, reduced)).toBe(0);
    expect(stampedeTintAlpha(true, st.tintAlpha, false, reduced)).toBe(st.tintAlpha);
    expect(stampedeTintAlpha(true, st.tintAlpha, true, reduced)).toBeCloseTo(
      st.tintAlpha * reduced,
    );
    expect(stampedeTintAlpha(true, st.tintAlpha, true, reduced)).toBeLessThan(st.tintAlpha);
  });

  it('the rumble is off with screen shake off, and paced by rumbleEveryMs', () => {
    const base = {
      on: true,
      shakeAllowed: true,
      rumblePx: st.rumblePx,
      shakeScale: feel.juice.shakeScale,
      nowMs: 1000,
      nextAtMs: 0,
      everyMs: st.rumbleEveryMs,
    };
    expect(rumbleDue({ ...base, shakeAllowed: false })).toBeNull();
    expect(rumbleDue({ ...base, on: false })).toBeNull();
    const due = rumbleDue(base);
    expect(due).toEqual({
      px: st.rumblePx * feel.juice.shakeScale,
      nextAtMs: 1000 + st.rumbleEveryMs,
    });
    expect(rumbleDue({ ...base, nextAtMs: due?.nextAtMs ?? 0 })).toBeNull();
    expect(rumbleDue({ ...base, shakeScale: 0 })).toBeNull();
  });
});
