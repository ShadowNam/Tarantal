// v1.4 B (D-039): area packs — biomes outside the Season Run (Namibië) that Classic can play from
// the title's area picker. An area pack unlocks for good once its `area.unlockBonus` bonus map
// (Die Verste) is reached in any area: unlocked for a day, or played (it has a best). Pure: the
// game layer saves the result through src/meta/storage.ts.
import type { Biome, ContentBundle, Notaboek } from '../content/schemas';
import type { SaveData } from './saveSchema';

export interface AreaCard {
  readonly biome: string;
  readonly nameKey: string;
  readonly unlocked: boolean;
  /** The bonus map that unlocks it (null for the home area). */
  readonly unlockBonus: string | null;
}

/** The Classic areas in picker order: the home area, then the area packs in content order. */
export function classicAreas(
  content: Pick<ContentBundle, 'biomes' | 'modes'>,
  playable: readonly string[],
): Biome[] {
  const home = content.biomes.find((b) => b.id === content.modes.modes.classic.biome);
  const packs = content.biomes.filter((b) => b.area !== undefined && playable.includes(b.id));
  return home === undefined ? packs : [home, ...packs];
}

/** Save fields the area rules read (`notaboek` only for the challenge backfill). */
type AreaSave = Pick<SaveData, 'areas' | 'bonusMaps'> & Partial<Pick<SaveData, 'notaboek'>>;

/**
 * The save shows this bonus map reached somewhere: unlocked (any day), played (a best), or its
 * Notaboek "unlock it" challenge done (a tester who unlocked Die Verste on the v1.4 A build but
 * never played it, D-039 review).
 */
export function bonusReachedAnywhere(
  save: Pick<SaveData, 'bonusMaps'> & Partial<Pick<SaveData, 'notaboek'>>,
  bonus: string,
  notaboek?: Pick<Notaboek, 'challenges'>,
): boolean {
  const suffix = `/${bonus}`;
  const done = save.notaboek?.done ?? [];
  return (
    save.bonusMaps.unlocked.some((k) => k.endsWith(suffix)) ||
    Object.keys(save.bonusMaps.bests).some((k) => k.endsWith(suffix)) ||
    (notaboek?.challenges.some(
      (c) => c.metric === 'bonusUnlocks' && c.bonus === bonus && done.includes(c.id),
    ) ??
      false)
  );
}

/** Whether Classic can play `biome` (the home area and seasons always; area packs once earned). */
export function isAreaUnlocked(
  biome: Pick<Biome, 'id' | 'area'>,
  save: AreaSave,
  notaboek?: Pick<Notaboek, 'challenges'>,
): boolean {
  if (biome.area === undefined) return true;
  return (
    save.areas.unlocked.includes(biome.id) ||
    bonusReachedAnywhere(save, biome.area.unlockBonus, notaboek)
  );
}

/**
 * The area packs this save has just earned (not yet in `areas.unlocked`): call after a hunt (and
 * at boot, for saves that reached Die Verste before the pack existed) and store them, so the
 * unlock outlives the bonus map's one-day unlock.
 */
export function newlyUnlockedAreas(
  content: Pick<ContentBundle, 'biomes'>,
  save: AreaSave,
  notaboek?: Pick<Notaboek, 'challenges'>,
): string[] {
  return content.biomes
    .filter(
      (b) =>
        b.area !== undefined &&
        !save.areas.unlocked.includes(b.id) &&
        bonusReachedAnywhere(save, b.area.unlockBonus, notaboek),
    )
    .map((b) => b.id);
}

/** The biome Classic plays: the saved choice when it is still playable and unlocked, else home. */
export function classicAreaId(
  content: Pick<ContentBundle, 'biomes' | 'modes'>,
  save: AreaSave,
  playable: readonly string[],
  notaboek?: Pick<Notaboek, 'challenges'>,
): string {
  const home = content.modes.modes.classic.biome;
  const chosen = save.areas.classic;
  if (chosen === null) return home;
  const b = content.biomes.find((x) => x.id === chosen);
  return b !== undefined && playable.includes(b.id) && isAreaUnlocked(b, save, notaboek)
    ? b.id
    : home;
}

/** One card per Classic area for the picker. */
export function areaCards(
  content: Pick<ContentBundle, 'biomes' | 'modes'>,
  save: AreaSave,
  playable: readonly string[],
  notaboek?: Pick<Notaboek, 'challenges'>,
): AreaCard[] {
  return classicAreas(content, playable).map((b) => ({
    biome: b.id,
    nameKey: b.nameKey,
    unlocked: isAreaUnlocked(b, save, notaboek),
    unlockBonus: b.area?.unlockBonus ?? null,
  }));
}

/**
 * The playable biomes this save may pick by hand (the bird book): every season biome, and an area
 * pack only once it is unlocked. The Daily, challenge links and the admin page (and its
 * Skietbaan) keep every playable biome (D-039).
 */
export function unlockedBiomes(
  content: Pick<ContentBundle, 'biomes'>,
  save: AreaSave,
  playable: readonly string[],
  notaboek?: Pick<Notaboek, 'challenges'>,
): string[] {
  return playable.filter((id) => {
    const b = content.biomes.find((x) => x.id === id);
    return b !== undefined && isAreaUnlocked(b, save, notaboek);
  });
}

/** `id` when it is in `list`, else the list's first (a stored choice that is now locked). */
export function biomeOrFirst(id: string, list: readonly string[]): string {
  return list.includes(id) ? id : (list[0] ?? id);
}
