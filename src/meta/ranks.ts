// Rank titles (GDD §14) from scoring.json ranks, ordered by minScore. Pure.
import type { Scoring } from '../content/schemas';

type Ranks = Scoring['ranks'];

export function rankIndex(ranks: Ranks, id: string | null): number {
  return id === null ? -1 : ranks.findIndex((r) => r.id === id);
}

/** The higher of two rank ids (null = none yet). */
export function higherRank(ranks: Ranks, a: string | null, b: string | null): string | null {
  return rankIndex(ranks, b) > rankIndex(ranks, a) ? b : a;
}

/** True once the best rank reached is at least `id`. */
export function hasRank(ranks: Ranks, best: string | null, id: string): boolean {
  const need = rankIndex(ranks, id);
  return need >= 0 && rankIndex(ranks, best) >= need;
}
