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

/** Tiers a streak has reached (0 = none). */
export function frenzyTier(streak: number, tiers: FrenzyTiers): number {
  let n = 0;
  for (const tier of tiers) if (streak >= tier.atStreak) n++;
  return n;
}

/** Geheime Resep: a miss drops one tier — to the start of the tier below, or to 0. */
export function dropTier(streak: number, tiers: FrenzyTiers): number {
  const n = frenzyTier(streak, tiers);
  if (n <= 1) return 0;
  return tiers[n - 2]?.atStreak ?? 0;
}
