// 1.9.4 (D-057): the baobab residents' and the weaver colony's sheet placeholders, drawn art only,
// like the makalani and fruit sheets: the placeholder is empty, so a build without delivered art
// (`?art=placeholder`) shows no residents while the hunt plays the same. The interim art
// (tools/art/baobabLife.ts) is what players see.
import type { CanvasSpec } from '../assets/AssetManifest';
import { COLONY_SHEET, COLONY_SHEET_H, COLONY_SHEET_W } from '../view/tree/colonySheet';
import { RESIDENT_SHEET, RESIDENT_SHEET_H, RESIDENT_SHEET_W } from '../view/tree/residentSheet';
import { meerkatSpecs } from './meerkatArt';

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

/** The desert maps' extra sheets: the meerkats' and the weaver colony's (desert group). */
export function desertSpecs(): CanvasSpec[] {
  return [
    ...meerkatSpecs(),
    {
      key: COLONY_SHEET,
      width: COLONY_SHEET_W,
      height: COLONY_SHEET_H,
      originX: 0,
      originY: 0,
      // ColonyView cuts its frames by the file under the key (1× Standard, 2× HD).
      viewScaled: true,
      draw: empty,
    },
  ];
}
