// "Bosveld Frenzy" (GDD §9): consecutive shots that bag ≥ 1 target. A shot that bags nothing
// resets the streak; reloading and empty clicks do not. A shot's bags score with the streak
// including that shot (the 3rd consecutive bagging shot is the first at ×1.5) — D-018.
import type { Scoring } from '../../content/schemas';

export type FrenzyTiers = Scoring['frenzyTiers'];

/** Streak after a resolved shot. */
export function nextStreak(streak: number, shotBagged: boolean): number {
  return shotBagged ? streak + 1 : 0;
}

/** Multiplier for a streak: the highest tier reached, else 1. Tiers are sorted (schema). */
export function frenzyMul(streak: number, tiers: FrenzyTiers): number {
  let mul = 1;
  for (const tier of tiers) {
    if (streak >= tier.atStreak) mul = tier.mul;
  }
  return mul;
}
