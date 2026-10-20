// e2e/dev-only content tweaks from URL parameters (main.ts allows them only in dev/test builds
// and with ?e2e=1). They change the content, so the hunt's contentHash changes too: such hunts
// are never official.
import type { ContentBundle } from '../content/schemas';

/**
 * ?crate=<id>: every crate holds this power-up or crate weapon, and the first crate drops in the
 * first seconds of the hunt (so tests and hand checks can try one without waiting).
 */
export function withTestCrate(b: ContentBundle, item: string): ContentBundle {
  const weapon = b.weapons.weapons.some((w) => w.id === item && w.kind === 'crate');
  const powerup = b.powerups.powerups.some((p) => p.id === item);
  if (!weapon && !powerup) return b;
  const crates = b.powerups.crates;
  return {
    ...b,
    powerups: {
      ...b.powerups,
      crates: {
        ...crates,
        modes: ['classic', 'daily'],
        windows: crates.windows.map((w, i) => (i === 0 ? ([0.02, 0.04] as [number, number]) : w)),
        table: [{ id: item, weight: 1, type: weapon ? 'weapon' : 'powerup' }],
      },
    },
  };
}

/** ?quotaMul=0.1: every Season Run quota × this (0 = every hunt passes). */
export function withQuotaMul(b: ContentBundle, mul: number): ContentBundle {
  return {
    ...b,
    run: {
      ...b.run,
      seasons: b.run.seasons.map((s) => ({
        ...s,
        quotas: s.quotas.map((q) => Math.round(q * mul)),
      })),
    },
  };
}
