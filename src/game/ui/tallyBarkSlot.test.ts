import { describe, expect, it } from 'vitest';
import { tallyBarkSlot } from './hudLayout';

describe('tallyBarkSlot (v1.0.1, D-028 §3)', () => {
  it('16:9: beside the panel, inside the safe area', () => {
    const safe = { x: 0, y: 0, w: 1920, h: 1080 };
    const panel = { x: 410, y: 90, w: 1100, h: 900 };
    const s = tallyBarkSlot(safe, panel);
    expect(s.x + s.w).toBeLessThanOrEqual(panel.x);
    expect(s.x).toBeGreaterThanOrEqual(safe.x);
  });

  it('4:3: in the panel top-right corner, in its top sixth (title row, above the score)', () => {
    const safe = { x: 0, y: 0, w: 1440, h: 1080 };
    const panel = { x: 170, y: 90, w: 1100, h: 900 };
    const s = tallyBarkSlot(safe, panel);
    expect(s.x).toBeGreaterThan(panel.x + panel.w / 2 + 150);
    expect(s.x + s.w).toBeLessThanOrEqual(panel.x + panel.w);
    expect(s.y + s.h).toBeLessThan(panel.y + panel.h / 6);
  });
});
