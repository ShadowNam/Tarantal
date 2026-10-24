// Bonus maps (v1.2, GDD §11.5, D-033): Verder is unlocked by beating the map's quota on today's
// map, the unlock lasts until UTC midnight, and each bonus map keeps its own best score. Pure:
// the game passes in UTC day numbers (Date.now() lives in the game layer).
import { BONUS_MAP_IDS, type BonusMapId, type ContentBundle } from '../content/schemas';
import type { HuntResult } from '../sim/types';
import { layoutForDay } from './maps';
import type { BonusMapSave } from './saveSchema';

/** A map's quota: its season's plain-hunt quota in run.json (the number the Season Run uses). */
export function mapQuota(content: Pick<ContentBundle, 'run'>, biome: string): number {
  const season = content.run.seasons.find((s) => s.biome === biome);
  const i = content.run.huntPattern.indexOf('plain');
  const q = season?.quotas[i < 0 ? 0 : i];
  if (q === undefined) throw new Error(`biome ${biome} has no season quota`);
  return q;
}

/** v1.3: a bonus map id as it appears in i18n keys (`title.nog_verder`, `tally.die_verste_unlocked`). */
export function bonusSlug(id: string): string {
  return id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** v1.3 (D-036): whether a sight is a scope (it draws the scope picture). */
export function isScope(
  content: Pick<ContentBundle, 'weapons'>,
  sight: string | undefined,
): boolean {
  return content.weapons.sights.find((s) => s.id === sight)?.picture === 'scope';
}

/** v1.3 (D-036): whether a bonus map can start with this sight (Die Verste needs a scope). */
export function bonusAllowsSight(
  content: Pick<ContentBundle, 'weapons' | 'biomes'>,
  biome: string,
  bonus: string,
  sight: string | undefined,
): boolean {
  const map = content.biomes.find((b) => b.id === biome)?.bonusMaps.find((m) => m.id === bonus);
  return map?.needsScope !== true || isScope(content, sight);
}

/** Save key of a biome's bonus map ("karoo-autumn/verder"). */
export const bonusKey = (biome: string, bonus: string): string => `${biome}/${bonus}`;

/** The unlocks as they stand on `day`: yesterday's are gone (they reset at UTC midnight). */
export function unlocksOn(s: BonusMapSave, day: number): readonly string[] {
  return s.day === day ? s.unlocked : [];
}

export function isUnlocked(s: BonusMapSave, day: number, biome: string, bonus: string): boolean {
  return unlocksOn(s, day).includes(bonusKey(biome, bonus));
}

/** The bonus map a hunt on `bonus` (null = today's map) unlocks: the next one in order. */
export function nextBonus(bonus: string | null): BonusMapId | null {
  if (bonus === null) return BONUS_MAP_IDS[0];
  const i = (BONUS_MAP_IDS as readonly string[]).indexOf(bonus);
  return i < 0 ? null : (BONUS_MAP_IDS[i + 1] ?? null);
}

export interface BonusOutcome {
  readonly save: BonusMapSave;
  /** Bonus map this hunt unlocked for today (null = none, or it was unlocked already). */
  readonly unlocked: BonusMapId | null;
  /** The hunt was on a bonus map and beat its best (previous best, null = first). */
  readonly newBest: { readonly previous: number | null } | null;
}

/**
 * A finished Classic or Daily hunt → the bonus-map save. `huntDay` is the UTC day the hunt
 * started (its layout is that day's); `today` is the UTC day now. An unlock counts only for the
 * day it was earned: a hunt that started before midnight and ended after it unlocks nothing,
 * since that map is gone. A bonus map's best is kept whatever the day. Only `classicBiome` (the
 * biome Classic and the title play, where a Verder hunt can start) unlocks: a Daily in another
 * biome of the rotation unlocks nothing.
 */
export function applyBonusResult(
  s: BonusMapSave,
  result: Pick<HuntResult, 'mode' | 'biome' | 'layout' | 'bonus' | 'score' | 'rank'>,
  huntDay: number,
  today: number,
  content: Pick<ContentBundle, 'run' | 'biomes'>,
  classicBiome: string,
): BonusOutcome {
  let save: BonusMapSave = s.day === today ? s : { ...s, day: today, unlocked: [] };
  let newBest: BonusOutcome['newBest'] = null;
  if (result.mode !== 'classic' && result.mode !== 'daily')
    return { save, unlocked: null, newBest };

  if (result.bonus !== null) {
    const key = bonusKey(result.biome, result.bonus);
    const prev = save.bests[key];
    if (prev === undefined || result.score > prev.score) {
      save = {
        ...save,
        bests: { ...save.bests, [key]: { score: result.score, rank: result.rank } },
      };
      newBest = { previous: prev?.score ?? null };
    }
  }

  const todaysMap = result.layout !== null && result.layout === layoutForDay(huntDay);
  const next = nextBonus(result.bonus);
  const biome = content.biomes.find((b) => b.id === result.biome);
  const ids: readonly string[] = biome?.bonusMaps.map((b) => b.id) ?? [];
  const exists = next !== null && ids.includes(next);
  if (
    huntDay !== today ||
    result.biome !== classicBiome ||
    !todaysMap ||
    next === null ||
    !exists ||
    result.score < mapQuota(content, result.biome)
  )
    return { save, unlocked: null, newBest };
  const key = bonusKey(result.biome, next);
  if (save.unlocked.includes(key)) return { save, unlocked: null, newBest };
  return { save: { ...save, unlocked: [...save.unlocked, key].sort() }, unlocked: next, newBest };
}
