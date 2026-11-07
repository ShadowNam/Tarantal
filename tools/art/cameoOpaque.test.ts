// v1.13 (D-075, review round 2): no cameo reads see-through. Every frame on the delivered sheets
// (the 2× masters the pack serves at 1× and as the HD twins) is opaque inside: of the pixels at
// least 3 px in from the drawing's edge, ≥ 94 % have full alpha (the dust puff is soft on purpose;
// the ostrich, Namibië's D-059 art reused unchanged, has wispy white plumes: ≥ 80 %).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMEO_SHEETS, CAMEO_SHEET_AREAS, CAMEO_SHEET_SIZE } from '../../src/game/cameos/cameoKeys';
import { cameoFrames, sheetRect } from '../../src/game/cameos/cameoSheet';
import { decodePng } from '../assets/image';

describe('the cameos are solid inside (D-075)', () => {
  for (const area of CAMEO_SHEET_AREAS) {
    const img = decodePng(
      readFileSync(join(process.cwd(), 'art-source', 'sprites', `${CAMEO_SHEETS[area]}.png`)),
    );
    const k = img.width / CAMEO_SHEET_SIZE[area].w;
    const alpha = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3] ?? 0;
    for (const f of cameoFrames(area)) {
      if (f.name === 'dust') continue;
      it(`${area}/${f.name}`, () => {
        const r = sheetRect(f);
        let inner = 0;
        let solid = 0;
        for (let y = r.y * k + 3; y < (r.y + r.h) * k - 3; y++)
          for (let x = r.x * k + 3; x < (r.x + r.w) * k - 3; x++) {
            let deep = true;
            for (let d = -3; d <= 3 && deep; d++)
              if (alpha(x + d, y) === 0 || alpha(x, y + d) === 0) deep = false;
            if (!deep) continue;
            inner++;
            if (alpha(x, y) === 255) solid++;
          }
        expect(inner).toBeGreaterThan(0);
        expect(solid / inner).toBeGreaterThanOrEqual(f.name.startsWith('ost_') ? 0.8 : 0.94);
      });
    }
  }
});
