// v1.7d (D-059): the Namibië veld-life sheets' placeholders, drawn art only (like the colony and
// makalani sheets): the placeholder is empty, so a build without delivered art
// (`?art=placeholder`) shows no ground cover while the hunt plays the same.
import type { CanvasSpec } from '../assets/AssetManifest';
import { VELD_SHEET, VELD_SHEET_H, VELD_SHEET_W } from '../view/namib/veldSheet';
import { OSTRICH_SHEET, OSTRICH_SHEET_H, OSTRICH_SHEET_W } from '../view/namib/ostrichSheet';
import { BALLOON_SHEET, BALLOON_SHEET_H, BALLOON_SHEET_W } from '../view/namib/balloonSheet';

const empty = (): void => {
  // Nothing: drawn art only.
};

export function namibieLifeSpecs(): CanvasSpec[] {
  return [
    {
      key: VELD_SHEET,
      width: VELD_SHEET_W,
      height: VELD_SHEET_H,
      originX: 0,
      originY: 0,
      // VeldView cuts its frames by the file under the key (1× Standard, 2× HD).
      viewScaled: true,
      draw: empty,
    },
    {
      key: OSTRICH_SHEET,
      width: OSTRICH_SHEET_W,
      height: OSTRICH_SHEET_H,
      originX: 0,
      originY: 0,
      // OstrichView cuts its frames by the file under the key (1× Standard, 2× HD).
      viewScaled: true,
      draw: empty,
    },
    {
      key: BALLOON_SHEET,
      width: BALLOON_SHEET_W,
      height: BALLOON_SHEET_H,
      originX: 0,
      originY: 0,
      // BalloonView cuts its frames by the file under the key (1× Standard, 2× HD).
      viewScaled: true,
      draw: empty,
    },
  ];
}
