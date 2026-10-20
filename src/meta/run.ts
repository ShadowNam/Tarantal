// Season Run ↔ save (Tech §11, GDD §13.6). Pure: which charms the Notaboek has unlocked (the
// Padstal's pool), whether a saved run still fits the content (else it is dropped, never
// "repaired" into a different run), and the run stats a finished run adds.
import type { ContentBundle, Notaboek } from '../content/schemas';
import { charmPool, RUN_STATE_VERSION, totalHunts, type RunState } from '../sim/run/run';
import type { SaveData } from './saveSchema';

/** Charms that start locked: some Notaboek challenge rewards them. */
export function lockedCharms(notaboek: Notaboek): string[] {
  return notaboek.challenges.flatMap((c) => (c.reward.type === 'charm' ? [c.reward.id] : []));
}

/** Charms unlocked by finished challenges. */
export function unlockedCharms(save: Pick<SaveData, 'notaboek'>, notaboek: Notaboek): string[] {
  return notaboek.challenges.flatMap((c) =>
    c.reward.type === 'charm' && save.notaboek.done.includes(c.id) ? [c.reward.id] : [],
  );
}

/** The Padstal's charm pool for this player (unlocks widen it, never add power). */
export function playerPool(
  save: Pick<SaveData, 'notaboek'>,
  content: ContentBundle,
  notaboek: Notaboek,
): string[] {
  return charmPool(content, lockedCharms(notaboek), unlockedCharms(save, notaboek));
}

/** The saved run if it still matches the content (ids, slots, hunt count), else null. */
export function validRun(run: SaveData['run'], content: ContentBundle): RunState | null {
  if (run === null || run.v !== RUN_STATE_VERSION) return null;
  const charmIds = new Set(content.charms.charms.map((c) => c.id));
  const powerups = new Set(content.powerups.powerups.map((p) => p.id));
  const weapons = content.weapons.weapons;
  const crate = new Set(weapons.filter((w) => w.kind === 'crate').map((w) => w.id));
  const ok =
    weapons.some((w) => w.id === run.weapon && w.kind === 'primary') &&
    run.huntIndex < totalHunts(content) &&
    run.charms.length <= content.charms.slots &&
    run.charms.every((id) => charmIds.has(id)) &&
    run.pool.every((id) => charmIds.has(id)) &&
    run.consumables.length === content.run.padstal.consumableSlots &&
    run.consumables.every((id) => id === null || powerups.has(id)) &&
    (run.rental === null || crate.has(run.rental)) &&
    (run.padstal?.offers ?? []).every((o) =>
      o.kind === 'charm'
        ? charmIds.has(o.id)
        : o.kind === 'consumable'
          ? powerups.has(o.id)
          : crate.has(o.id),
    );
  return ok ? run : null;
}

/** Run stats after a run ends. */
export function finishRunStats(stats: SaveData['runStats'], run: RunState): SaveData['runStats'] {
  const cleared = run.history.filter((h) => h.passed).length;
  return {
    started: stats.started,
    won: stats.won + (run.phase === 'victory' ? 1 : 0),
    bestHunts: Math.max(stats.bestHunts, cleared),
  };
}
