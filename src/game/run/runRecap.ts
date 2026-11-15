import type { HuntRecord } from '../../sim/run/run';

/** Only recorded facts: no retrospective attribution of points to equipped charms. */
export function runRecap(history: readonly HuntRecord[]) {
  const scored = history.filter((h) => h.quota > 0);
  const ordered = [...scored].sort(
    (a, b) => (a.score - a.quota) / a.quota - (b.score - b.quota) / b.quota,
  );
  return { hunts: history, weakest: ordered[0] ?? null, strongest: ordered.at(-1) ?? null };
}
