// Flat event bonuses before multipliers (GDD §9). Multiply with scoreEventBonus().
import type { Scoring } from '../../content/schemas';

/** Twee Vlieë: one shot bags ≥ 2 targets. Uses the largest table row with birds ≤ count. */
export function twoFliesBonus(birdsBagged: number, table: Scoring['twoFlies']): number {
  let best = 0;
  let bestBirds = 0;
  for (const row of table) {
    if (birdsBagged >= row.birds && row.birds > bestBirds) {
      best = row.bonus;
      bestBirds = row.birds;
    }
  }
  return best;
}

/** Whole Flock (GDD §6.4): every member of a flock of ≥ minSize bagged before it settles/exits. */
export function wholeFlockBonus(
  flockSize: number,
  bagged: number,
  rule: Scoring['wholeFlock'],
): number {
  if (flockSize < rule.minSize || bagged < flockSize) return 0;
  return rule.perBird * flockSize;
}
