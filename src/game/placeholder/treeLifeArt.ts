// 1.9.4 (D-057): the baobab residents' sheet placeholder (residentSheet.ts sizes), drawn art only,
// like the makalani and fruit sheets: the placeholder is empty, so a build without delivered art
// (`?art=placeholder`) shows no residents while the hunt plays the same. The interim art
// (tools/art/baobabLife.ts) is what players see.
import type { CanvasSpec } from '../assets/AssetManifest';
import { RESIDENT_SHEET, RESIDENT_SHEET_H, RESIDENT_SHEET_W } from '../view/tree/residentSheet';

const empty = (): void => {
  // Nothing: drawn art only.
};

export function treeLifeSpecs(): CanvasSpec[] {
  return [
    {
      key: RESIDENT_SHEET,
      width: RESIDENT_SHEET_W,
      height: RESIDENT_SHEET_H,
      originX: 0,
      originY: 0,
      // BaobabLifeView cuts its frames by the file under the key (1× Standard, 2× HD).
      viewScaled: true,
      draw: empty,
    },
  ];
}
