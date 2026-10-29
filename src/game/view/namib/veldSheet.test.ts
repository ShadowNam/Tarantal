import { describe, expect, it } from 'vitest';
import { VELD_FRAMES, VELD_SHEET_H, VELD_SHEET_W, veldFrameFor, veldFrames } from './veldSheet';
import spots from './veld-namibie.json' with { type: 'json' };

describe('veld sheet (v1.7d, D-059)', () => {
  it('fits every frame on the sheet without overlaps', () => {
    const fr = veldFrames();
    for (const f of fr) {
      expect(f.x + f.w).toBeLessThanOrEqual(VELD_SHEET_W);
      expect(f.y + f.h).toBeLessThanOrEqual(VELD_SHEET_H);
      expect(f.ox).toBeLessThanOrEqual(f.w);
      expect(f.oy).toBeLessThanOrEqual(f.h);
    }
    for (const a of fr)
      for (const b of fr)
        if (a !== b)
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(
            false,
          );
  });

  it('picks the frame of the nearest size class, cycling its variants', () => {
    const near = veldFrameFor('grass', 60, 0);
    expect(VELD_FRAMES[near]?.ref).toBe(58);
    expect(VELD_FRAMES[veldFrameFor('grass', 9, 0)]?.ref).toBe(12);
    const variants = new Set([0, 1, 2].map((v) => veldFrameFor('grass', 150, v)));
    expect(variants.size).toBe(3);
  });

  it('places only known frames at sane scales, on the ground layers', () => {
    expect(spots.length).toBeGreaterThan(500);
    for (const [layer, frame, x, y, s100, flip] of spots) {
      expect([0, 1, 2]).toContain(layer);
      expect(VELD_FRAMES[frame ?? -1]).toBeDefined();
      expect(x).toBeGreaterThan(-100);
      expect(y).toBeGreaterThan(600);
      expect(y).toBeLessThan(1100);
      // A frame is never scaled far from its drawn size (no shimmer, no blur).
      expect(s100).toBeGreaterThanOrEqual(40);
      expect(s100).toBeLessThanOrEqual(160);
      expect([0, 1]).toContain(flip);
    }
  });
});
