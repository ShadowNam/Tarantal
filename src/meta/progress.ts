// Applies a finished hunt to the save: stats, Bird Book, per-biome bests, best rank, Notaboek
// challenges and the unlocks they grant (GDD §13.6, §14, §15). Pure: returns a new SaveData and
// what changed, so the tally can celebrate it.
import { FAMILIEFOTO_SECRET } from '../sim/meerkats/colony';
import { bonusReachedAnywhere } from './areas';
import type {
  ContentBundle,
  Notaboek,
  NotaboekChallenge,
  NotaboekMetric,
  Sight,
  Weapon,
} from '../content/schemas';
import type { HuntLog } from './huntLog';
import { hasRank, higherRank } from './ranks';
import type { SaveData } from './saveSchema';

export interface HuntOutcome {
  readonly save: SaveData;
  /** Challenges finished by this hunt. */
  readonly completed: readonly string[];
  readonly unlockedWeapons: readonly string[];
  /** v1.3: sights unlocked by this hunt's challenges. */
  readonly unlockedSights: readonly string[];
  /** Previous best for this biome (null = first Classic hunt there); set only on a new best. */
  readonly newBest: { readonly previous: number | null } | null;
  readonly rankUp: string | null;
  readonly newCreatures: readonly string[];
  readonly newSecrets: readonly string[];
}

/** Bird Book id of a secret: biome/propId. */
export const secretKey = (biome: string, propId: string): string => `${biome}/${propId}`;

/** Modes whose score is a Classic-style score (bests and rank titles). */
const SCORED_MODES = new Set(['classic', 'daily']);

function metricValue(m: NotaboekMetric, log: HuntLog): number {
  switch (m) {
    case 'hunts':
      return 1;
    case 'bagged':
      return log.bagged;
    case 'baggedFar':
      return log.baggedFar;
    case 'baggedVer':
      return log.baggedVer;
    case 'bonusUnlocks':
      return log.bonusUnlocked !== null ? 1 : 0;
    case 'wingShots':
      return log.wingShots;
    case 'wholeFlocks':
      return log.wholeFlocks;
    case 'secrets':
      return log.secrets;
    case 'crates':
      return log.crates;
    case 'score':
      return log.score;
    case 'distinctSecrets':
      return 0; // counted from the Bird Book below
    case 'familiefotos':
      return log.secretsFound.includes(FAMILIEFOTO_SECRET) ? 1 : 0;
    case 'canChain':
      return log.canChain ?? 0;
    case 'reenbuiBags':
      return log.reenbuiBags ?? 0;
  }
}

function counts(c: NotaboekChallenge, log: HuntLog): boolean {
  if (c.modes !== undefined && !c.modes.some((m) => m === log.mode)) return false;
  if (c.biome !== undefined && c.metric !== 'distinctSecrets' && c.biome !== log.biome)
    return false;
  if (c.bonus !== undefined && c.metric === 'bonusUnlocks' && c.bonus !== log.bonusUnlocked)
    return false;
  return true;
}

/**
 * v1.4 (D-038): the save already shows this bonus map reached in some area (unlocked today, or
 * played: it has a best). A one-off "unlock it" challenge then counts as met, so a save from
 * before the challenge existed (v1.3 players who reached Die Verste) still earns its reward.
 */
function bonusReached(save: SaveData, bonus: string): boolean {
  return bonusReachedAnywhere(save, bonus);
}

const union = (a: readonly string[], b: readonly string[]): string[] =>
  [...new Set([...a, ...b])].sort();

export function applyHunt(
  save: SaveData,
  log: HuntLog,
  content: Pick<ContentBundle, 'scoring'>,
  notaboek: Notaboek,
  /** False for practice Daily hunts: they never move bests or the rank (first-attempt rule). */
  ranked = true,
): HuntOutcome {
  const ranks = content.scoring.ranks;
  const newCreatures = log.creaturesSeen.filter((c) => !save.birdBook.creatures.includes(c));
  const secretIds = log.secretsFound.map((p) => secretKey(log.biome, p));
  const newSecrets = secretIds.filter((s) => !save.birdBook.secrets.includes(s));
  const birdBook = {
    creatures: union(save.birdBook.creatures, log.creaturesSeen),
    secrets: union(save.birdBook.secrets, secretIds),
  };

  let bests = save.bests;
  let newBest: HuntOutcome['newBest'] = null;
  let bestRank = save.bestRank;
  let rankUp: string | null = null;
  if (ranked && SCORED_MODES.has(log.mode)) {
    const prev = save.bests[log.biome];
    // A bonus map (v1.2) keeps its own best (bonusMaps.ts); it still counts for rank titles.
    const bonus = log.bonus ?? null;
    if (
      log.mode === 'classic' &&
      bonus === null &&
      (prev === undefined || log.score > prev.score)
    ) {
      bests = { ...save.bests, [log.biome]: { score: log.score, rank: log.rank } };
      newBest = { previous: prev?.score ?? null };
    }
    const higher = higherRank(ranks, save.bestRank, log.rank);
    if (higher !== save.bestRank) {
      bestRank = higher;
      rankUp = higher;
    }
  }

  const progress: Record<string, number> = { ...save.notaboek.progress };
  const done = new Set(save.notaboek.done);
  const completed: string[] = [];
  const unlocked = new Set(save.unlocks.weapons);
  const unlockedWeapons: string[] = [];
  const sights = new Set(save.unlocks.sights);
  const unlockedSights: string[] = [];
  for (const c of notaboek.challenges) {
    if (done.has(c.id)) continue;
    let value = progress[c.id] ?? 0;
    if (c.metric === 'distinctSecrets') {
      const prefix = `${c.biome ?? ''}/`;
      value = birdBook.secrets.filter((s) => s.startsWith(prefix)).length;
    } else if (counts(c, log)) {
      const v = metricValue(c.metric, log);
      value = c.scope === 'total' ? value + v : Math.max(value, v);
    }
    if (
      c.metric === 'bonusUnlocks' &&
      c.bonus !== undefined &&
      c.target === 1 &&
      bonusReached(save, c.bonus)
    )
      value = Math.max(value, c.target);
    progress[c.id] = Math.min(value, c.target);
    if (value >= c.target) {
      done.add(c.id);
      completed.push(c.id);
      if (c.reward.type === 'weapon' && !unlocked.has(c.reward.id)) {
        unlocked.add(c.reward.id);
        unlockedWeapons.push(c.reward.id);
      }
      if (c.reward.type === 'sight' && !sights.has(c.reward.id)) {
        sights.add(c.reward.id);
        unlockedSights.push(c.reward.id);
      }
    }
  }

  return {
    save: {
      ...save,
      stats: {
        hunts: save.stats.hunts + 1,
        bagged: save.stats.bagged + log.bagged,
        shots: save.stats.shots + log.shots,
      },
      birdBook,
      bests,
      bestRank,
      notaboek: { progress, done: [...done].sort() },
      unlocks: { ...save.unlocks, weapons: [...unlocked].sort(), sights: [...sights].sort() },
    },
    completed,
    unlockedWeapons,
    unlockedSights,
    newBest,
    rankUp,
    newCreatures,
    newSecrets,
  };
}

/** Whether a primary weapon can be picked in the Skiet-Skuur (start, rank or challenge unlock). */
export function isWeaponUnlocked(
  w: Weapon,
  save: Pick<SaveData, 'unlocks' | 'bestRank'>,
  content: Pick<ContentBundle, 'scoring'>,
): boolean {
  if (w.kind !== 'primary') return false;
  switch (w.unlock.type) {
    case 'start':
      return true;
    case 'rank':
      return hasRank(content.scoring.ranks, save.bestRank, w.unlock.id);
    case 'challenge':
      return save.unlocks.weapons.includes(w.id);
  }
}

/** v1.3: whether a sight can be fitted (start, a rank reached, or its Notaboek challenge done). */
export function isSightUnlocked(
  s: Sight,
  save: Pick<SaveData, 'unlocks' | 'bestRank'>,
  content: Pick<ContentBundle, 'scoring'>,
): boolean {
  switch (s.unlock.type) {
    case 'start':
      return true;
    case 'rank':
      return hasRank(content.scoring.ranks, save.bestRank, s.unlock.id);
    case 'challenge':
      return save.unlocks.sights.includes(s.id);
  }
}

/**
 * v1.3: the sight a rifle carries into a hunt — the one fitted in the Skiet-Skuur if it fits
 * this gun and is unlocked, else the gun's default. Undefined for guns without sights.
 */
export function fittedSight(
  weaponId: string,
  save: Pick<SaveData, 'unlocks' | 'bestRank' | 'loadout'>,
  content: Pick<ContentBundle, 'scoring' | 'weapons'>,
): string | undefined {
  const w = content.weapons.weapons.find((x) => x.id === weaponId);
  if (w?.kind !== 'primary' || w.aim === undefined) return undefined;
  const chosen = save.loadout.sights[weaponId];
  const sight = content.weapons.sights.find((s) => s.id === chosen);
  return sight !== undefined &&
    w.aim.sights.includes(sight.id) &&
    isSightUnlocked(sight, save, content)
    ? sight.id
    : w.aim.defaultSight;
}

/** Unlocked and a primary the player can equip (crate weapons never are). */
export function isWeaponEquippable(
  w: Weapon,
  save: Pick<SaveData, 'unlocks' | 'bestRank'>,
  content: Pick<ContentBundle, 'scoring'>,
): boolean {
  return isWeaponUnlocked(w, save, content) && w.kind === 'primary';
}

/**
 * v1.3 (D-036): the gun a Classic or Daily hunt plays — the admin page's, else the Skiet-Skuur
 * loadout while it is equippable, else the mode's own gun. The title reads it to tell whether a
 * bonus map can start (Die Verste needs a scope).
 */
export function plainGun(
  save: Pick<SaveData, 'unlocks' | 'bestRank' | 'loadout'>,
  content: Pick<ContentBundle, 'scoring' | 'weapons' | 'modes'>,
  mode: 'classic' | 'daily',
  override?: string,
): string {
  if (override !== undefined) return override;
  const loadout = content.weapons.weapons.find((w) => w.id === save.loadout.weapon);
  return loadout !== undefined && isWeaponEquippable(loadout, save, content)
    ? loadout.id
    : content.modes.modes[mode].weapon;
}

/** v1.3: the sight a gun carries into a hunt — the admin page's if it fits, else the fitted one. */
export function huntSight(
  gun: string,
  save: Pick<SaveData, 'unlocks' | 'bestRank' | 'loadout'>,
  content: Pick<ContentBundle, 'scoring' | 'weapons'>,
  override?: string,
): string | undefined {
  const def = content.weapons.weapons.find((w) => w.id === gun);
  if (def?.kind !== 'primary' || def.aim === undefined) return undefined;
  return override !== undefined && def.aim.sights.includes(override)
    ? override
    : fittedSight(gun, save, content);
}
