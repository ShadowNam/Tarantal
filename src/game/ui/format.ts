// Number formatting for the HUD and tally (GDD §5.3: format large numbers as 12.4K, 1.2M).

/** 999 → "999", 12 400 → "12.4K", 1 200 000 → "1.2M"; negatives keep their sign. */
export function formatScore(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(Math.round(n));
  if (a < 10_000) return `${sign}${a}`;
  if (a < 1_000_000) return `${sign}${trim(a / 1000)}K`;
  return `${sign}${trim(a / 1_000_000)}M`;
}

function trim(v: number): string {
  const fixed = v >= 100 ? Math.floor(v).toString() : (Math.floor(v * 10) / 10).toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

/** Multiplier as shown in pops: 2 → "2", 2.5 → "2.5", 1.25 → "1.25". */
export function formatMult(m: number): string {
  return String(Math.round(m * 100) / 100);
}

/** Balatro-style pop: "10 ×2" (the part before it resolves to "+20"). */
export function popParts(points: number, mult: number): string {
  return `${formatScore(points)} ×${formatMult(mult)}`;
}

export function formatAward(award: number): string {
  return award >= 0 ? `+${formatScore(award)}` : formatScore(award);
}

/** Ticks left → "1:05"; rounds up so the clock shows 0:00 only at the very end. */
export function formatClock(ticksLeft: number, ticksPerSecond: number): string {
  const s = Math.ceil(ticksLeft / ticksPerSecond);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
