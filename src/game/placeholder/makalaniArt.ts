// 1.9.3 (D-056): the makalani trunk, crown and nut sheet placeholders (makalaniSheet.ts sizes),
// drawn art only, like the fruit sheet and the far animals: the placeholders are empty, so a
// build without delivered art (`?art=placeholder`, dev builds without an asset index) shows no
// palms or nuts while the sim still plays them. The interim art (tools/art/makalani.ts) is what
// players see.
import type { CanvasSpec } from '../assets/AssetManifest';
import {
  NUT_SHEET,
  NUT_SHEET_H,
  NUT_SHEET_W,
  PALM_ART_PLANES,
  palmCrownKey,
  palmFrames,
  palmTrunkKey,
} from '../view/palms/makalaniSheet';

const empty = (): void => {
  // Nothing: drawn art only.
};

export function makalaniSpecs(): CanvasSpec[] {
  const out: CanvasSpec[] = [];
  for (const plane of PALM_ART_PLANES) {
    const f = palmFrames(plane);
    for (const [key, r] of [
      [palmTrunkKey(plane), f.trunk],
      [palmCrownKey(plane), f.crown],
    ] as const)
      out.push({
        key,
        width: r.w,
        height: r.h,
        originX: r.ox / r.w,
        originY: r.oy / r.h,
        viewScaled: true,
        draw: empty,
      });
  }
  out.push({
    key: NUT_SHEET,
    width: NUT_SHEET_W,
    height: NUT_SHEET_H,
    originX: 0,
    originY: 0,
    // Review M2: MakalaniView cuts its frames and scales its images by displayScale() (an HD
    // texture keeps its 2× size), so the sheet must be view-scaled like the palms.
    viewScaled: true,
    draw: empty,
  });
  return out;
}
