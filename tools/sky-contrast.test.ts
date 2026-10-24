// v1.2 (D-033): fly-overs stay readable against every weekday sky and Verder.
import { describe, expect, it } from 'vitest';
import { MIN_SKY_CONTRAST_RATIO, skyContrastRows } from './sky-contrast';

describe('sky contrast (bird readability)', () => {
  it(`every map keeps ≥ ${MIN_SKY_CONTRAST_RATIO * 100} % of its plain sky's contrast`, () => {
    const rows = skyContrastRows();
    // Four season biomes and the Namibië pack (v1.4 B), 15 maps each.
    expect(rows.length).toBe(5 * 15);
    for (const r of rows)
      expect(r.ratio, `${r.biome} ${r.map}: ${r.contrast.toFixed(2)}`).toBeGreaterThanOrEqual(
        MIN_SKY_CONTRAST_RATIO,
      );
  });
});
