// v1.7e (D-061): the tell sheet's table — its size matches tellKeys.ts (the placeholder's), every
// species in birds.json has a box and every box a species, frames don't overlap.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../../tools/testContent';
import { TELL_SHEET_H, TELL_SHEET_W } from './tellKeys';
import { TELL_SPECIES, tellFrames, tellSheetHeight } from './tellSheet';

describe('tell sheet (D-061)', () => {
  it('fits the size the placeholder declares', () => {
    expect(tellSheetHeight()).toBe(TELL_SHEET_H);
    for (const f of tellFrames()) expect(f.x + f.w).toBeLessThanOrEqual(TELL_SHEET_W);
  });

  it('has a box for every species in birds.json, and no other', () => {
    const ids = loadContent().birds.tells.species.map((s) => s.id);
    expect([...TELL_SPECIES].sort()).toEqual([...ids].sort());
  });

  it('frames never overlap', () => {
    const fr = tellFrames();
    for (let i = 0; i < fr.length; i++)
      for (let j = i + 1; j < fr.length; j++) {
        const a = fr[i];
        const b = fr[j];
        if (a === undefined || b === undefined) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
  });
});
