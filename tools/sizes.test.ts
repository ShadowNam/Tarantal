// v1.16 (D-078): the animals brought to real size stay within ±15 % of it next to the guineafowl
// on their plane; the ones left for the owner are listed, each with its reason.
import { describe, expect, it } from 'vitest';
import { TELL_BOXES } from '../src/game/view/tell/tellSheet';
import { NOT_FIXED, offBy, sizeTable, TELL_DRAWN_PX, TELL_REAL_M } from './sizes';
import { loadContent, loadFeel } from './testContent';

const TOLERANCE = 0.15;

describe('real animal sizes next to the guineafowl (D-078)', () => {
  const content = loadContent();
  const rows = sizeTable(content, loadFeel());

  it('covers the weavers, every tell and the meerkats', () => {
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('sociable_weaver');
    expect(ids).toContain('meerkat_mid');
    for (const sp of content.birds.tells.species) expect(ids).toContain(sp.id);
  });

  for (const r of rows)
    it(`${r.id} (${r.realM} m, ${r.measure}, ${r.plane}) is within ±15 %`, () => {
      expect(
        Math.abs(offBy(r)),
        `${r.drawnPx.toFixed(1)} px drawn, ${r.targetPx.toFixed(1)} px real`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });

  it('the measured tell lengths fit their frame boxes', () => {
    for (const [sp, px] of Object.entries(TELL_DRAWN_PX)) {
      const box = TELL_BOXES[sp as keyof typeof TELL_BOXES];
      expect(box, sp).toBeDefined();
      expect(px).toBeLessThanOrEqual(Math.max(box.w, box.h));
      expect(TELL_REAL_M[sp], sp).toBeGreaterThan(0);
    }
  });

  it('lists the animals left for the owner, each with its reason, none also fixed', () => {
    const fixed = new Set(rows.map((r) => r.id));
    expect(Object.keys(NOT_FIXED).length).toBeGreaterThan(0);
    for (const [id, why] of Object.entries(NOT_FIXED)) {
      expect(why.trim().length, id).toBeGreaterThan(10);
      expect(fixed.has(id), id).toBe(false);
    }
  });
});
