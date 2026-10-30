// v1.8c (D-063): where the Harvest's HUD bars go and their colour (pure; HarvestBars draws them).
import type { HudLayout, Rect } from './hudLayout';

export const CROP_H = 46;
const REPAIR_H = 26;
const GAP = 10;

export interface HarvestBarsRects {
  readonly crop: Rect;
  readonly repair: Rect;
}

/**
 * Where the bars go (review round 1): top centre UNDER the pause button, between the left column
 * (clock, Frenzy) and the score's column (score plate, pops), so they overlap none of them.
 */
export function harvestBarsRects(
  l: Pick<HudLayout, 'pause' | 'frenzy' | 'score'>,
): HarvestBarsRects {
  const mid = l.pause.x + l.pause.w / 2;
  const top = l.pause.y + l.pause.h + 10;
  const half = Math.max(
    120,
    Math.min(320, mid - (l.frenzy.x + l.frenzy.w) - 24, l.score.x - 24 - mid),
  );
  const x = mid - half;
  const w = half * 2;
  return {
    crop: { x, y: top, w, h: CROP_H },
    repair: { x: x + w * 0.15, y: top + CROP_H + GAP, w: w * 0.7, h: REPAIR_H },
  };
}

/** The crop bar's colour for a crop percent and the warning line. */
export function cropColor(crop: number, warnBelow: number): number {
  if (crop < warnBelow) return 0xc8302a;
  if (crop < 70) return 0xe0a030;
  return 0x5aa640;
}
