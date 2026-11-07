// v1.13 (D-075, review round 2): the test builds' cameo preview spots (?cameoPreview=, the
// screenshot spec and e2e) are clear of the first-person gun at rest on every landscape profile.
// The gun stands at 0.62 of the width (HuntScene's weapon.layout; right-handed, the default); at
// rest it is upright, about ±130 px round its column (its art box 420 px wide, ×0.8 on touch).
// A herd starts at the spot and trails behind its leader either way.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { CAMEO_PREVIEW_SPOT } from '../../content/cameoPreview';

const GUN_COLUMN = 0.62;
const GUN_HALF_PX = 130;

describe('cameo preview spots are clear of the gun (D-075)', () => {
  const c = loadContent().cameos;
  // Design widths at 1080 tall: 16:9 desktop, iPhone 14 (844 × 390), Pixel 7 (915 × 412), 21:9.
  for (const width of [1920, 2337, 2398, 2520])
    it(`at ${String(width)} px wide`, () => {
      const gunLo = (GUN_COLUMN - 0.5) * width - GUN_HALF_PX;
      for (const k of [
        'warthogs',
        'dungBeetle',
        'tortoise',
        'ostrich',
        'springbok',
        'gemsbok',
      ] as const) {
        const w = c.kinds[k];
        const members = w.group.reduce((n, g) => n + g.count[1], 0);
        const start = CAMEO_PREVIEW_SPOT.startDxPx[w.plane];
        // Its rightmost point: the herd trailing to the right, plus the widest hit shape.
        const reach = Math.max(...w.hitboxes.adult.map((h) => Math.abs(h.ox) + h.rx));
        const right = start + (members - 1) * w.spacingPx + reach;
        expect(right, `${k} reaches ${String(right)}`).toBeLessThan(gunLo);
        // And on the screen, clear of the left edge's HUD corner (the belt starts 568 px out).
        expect(start - reach).toBeGreaterThan(-width / 2 + 100);
      }
    });
});
