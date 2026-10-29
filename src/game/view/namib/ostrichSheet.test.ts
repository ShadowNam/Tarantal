import { describe, expect, it } from 'vitest';
import {
  EGG_SPOTS,
  OSTRICH_POSES,
  OSTRICH_SHEET_H,
  OSTRICH_SHEET_W,
  framePose,
  ostrichFrame,
  ostrichFrames,
} from './ostrichSheet';

describe('ostrich sheet (v1.7d, D-059)', () => {
  it('fits every frame without overlaps; the hen has every pose but the display', () => {
    const fr = ostrichFrames();
    for (const f of fr) {
      expect(f.x + f.w).toBeLessThanOrEqual(OSTRICH_SHEET_W);
      expect(f.y + f.h).toBeLessThanOrEqual(OSTRICH_SHEET_H);
    }
    for (const a of fr)
      for (const b of fr)
        if (a !== b)
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(
            false,
          );
    const names = new Set(fr.map((f) => f.name));
    for (const p of OSTRICH_POSES) {
      expect(names).toContain(ostrichFrame(true, p));
      if (p !== 'display') expect(names).toContain(ostrichFrame(false, p));
    }
    expect(names).not.toContain(ostrichFrame(false, 'display'));
    expect(EGG_SPOTS.length).toBeGreaterThanOrEqual(15);
  });

  it('steps the walk and run on the pose tick (a held tick holds the frame)', () => {
    expect(framePose({ pose: 'walk', t: 0, male: true })).toBe('walk_0');
    expect(framePose({ pose: 'walk', t: 9, male: true })).toBe('walk_1');
    expect(framePose({ pose: 'walk', t: 36, male: false })).toBe('walk_0');
    expect(framePose({ pose: 'run', t: 10, male: true })).toBe('run_2');
    expect(framePose({ pose: 'display', t: 3, male: false })).toBe('stand');
    expect(framePose({ pose: 'sit', t: 50, male: false })).toBe('sit');
  });
});
