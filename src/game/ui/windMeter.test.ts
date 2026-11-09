import { describe, expect, it } from 'vitest';
import { WIND_BARS, windBars } from './windMeter';

describe('wind meter bars (v1.17, D-079)', () => {
  it('rise with the strength, one for a breath, five for a full gale', () => {
    expect(windBars(0)).toBe(0);
    expect(windBars(0.05)).toBe(1);
    expect(windBars(0.4)).toBe(2);
    expect(windBars(0.7)).toBe(4);
    expect(windBars(1)).toBe(WIND_BARS);
    let last = 0;
    for (let s = 0; s <= 1; s += 0.01) {
      expect(windBars(s)).toBeGreaterThanOrEqual(last);
      last = windBars(s);
    }
  });
});
