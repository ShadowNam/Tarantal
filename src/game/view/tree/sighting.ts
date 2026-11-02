// A journal discovery must have a drawn, visible sprite in the player's design viewport.
import { JOURNAL } from '../../../content/journal';
export function sightingVisible(
  x: number,
  y: number,
  alpha: number,
  width: number,
  height: number,
): boolean {
  return alpha >= JOURNAL.sightingAlpha && x >= 0 && x <= width && y >= 0 && y <= height;
}
