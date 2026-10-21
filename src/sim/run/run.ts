// Season Run state machine (GDD §13, Tech §3.9):
//   RunStart → (Hunt → Tally → Padstal) × 12 → Victory | Defeat
// Pure and deterministic like the rest of src/sim: every function takes the validated content
// and a RunState and returns a new RunState. The state is plain JSON, so the game saves it after
// every Padstal (Tech §11) and a closed tab resumes the run. Hunt seeds and Padstal rolls are
// derived from the run seed and their position, so no RNG cursor needs saving.
import type { Biome, ContentBundle } from '../../content/schemas';
import { passivesOf } from '../charms/interpreter';
import { createRng, fnv1a32, type RandomStream } from '../rng';
import type { HuntResult, ModeConfig, SeasonHuntKind } from '../types';

export const RUN_STATE_VERSION = 1;

export type RunPhase = 'hunt' | 'tally' | 'padstal' | 'victory' | 'defeat';

export interface ShopOffer {
  readonly kind: 'charm' | 'consumable' | 'weapon';
  readonly id: string;
  readonly price: number;
  readonly bought: boolean;
}

export interface PadstalState {
  readonly offers: readonly ShopOffer[];
  /** Rerolls bought at this Padstal (the price goes up with each). */
  readonly rerolls: number;
}

/** GDD §13.4 payout after a passed hunt. */
export interface DoppiesTally {
  readonly base: number;
  readonly overQuota: number;
  readonly interest: number;
  readonly boss: number;
  /** Found in the hunt (white tarentaal, charms). */
  readonly found: number;
  readonly total: number;
}

export interface HuntRecord {
  readonly huntIndex: number;
  readonly score: number;
  readonly quota: number;
  readonly passed: boolean;
  /** Null for the hunt that ended the run. */
  readonly doppies: DoppiesTally | null;
}

export interface RunState {
  readonly v: number;
  /** u32 run seed. */
  readonly seed: number;
  /** The player's primary weapon for the whole run. */
  readonly weapon: string;
  /** Charm ids the Padstal may offer (unlocks widen it, GDD §13.6). */
  readonly pool: readonly string[];
  readonly phase: RunPhase;
  /** The current (or next) hunt, 0 … seasons × huntPattern − 1. */
  readonly huntIndex: number;
  /** Equipped charms in slot order. */
  readonly charms: readonly string[];
  readonly doppies: number;
  readonly consumables: readonly (string | null)[];
  /** Crate weapon rented for the next hunt. */
  readonly rental: string | null;
  /** Shell capacity built up over the run (Generaal se Pot). */
  readonly runShellBonus: number;
  readonly padstal: PadstalState | null;
  readonly history: readonly HuntRecord[];
}

export interface NewRunOptions {
  readonly seed: number;
  readonly weapon: string;
  readonly pool: readonly string[];
}

/** Charm ids in the pool for a player who has unlocked `unlocked` (meta decides what's locked). */
export function charmPool(
  content: ContentBundle,
  locked: readonly string[],
  unlocked: readonly string[] = [],
): string[] {
  return content.charms.charms
    .map((c) => c.id)
    .filter((id) => !locked.includes(id) || unlocked.includes(id));
}

export function createRun(content: ContentBundle, o: NewRunOptions): RunState {
  return {
    v: RUN_STATE_VERSION,
    seed: o.seed >>> 0,
    weapon: o.weapon,
    pool: [...o.pool],
    phase: 'hunt',
    huntIndex: 0,
    charms: [],
    doppies: content.run.doppies.start,
    consumables: Array.from({ length: content.run.padstal.consumableSlots }, () => null),
    rental: null,
    runShellBonus: 0,
    padstal: null,
    history: [],
  };
}

export function totalHunts(content: ContentBundle): number {
  return content.run.seasons.length * content.run.huntPattern.length;
}

/** Everything about one hunt of the run, with the M8 stand-ins resolved. */
export interface HuntInfo {
  readonly huntIndex: number;
  readonly season: string;
  readonly seasonIndex: number;
  /** 0-based hunt within the season. */
  readonly huntInSeason: number;
  readonly kind: SeasonHuntKind;
  readonly quota: number;
  /** The season's own biome (M8: every season has one; the Karoo stand-in is gone). */
  readonly biome: string;
  /** The season's boss and its Boss Rule (in force only in the boss hunt). */
  readonly boss: string;
  readonly bossRule: string | null;
}

export function huntInfo(content: ContentBundle, huntIndex: number): HuntInfo {
  const pattern = content.run.huntPattern;
  const seasonIndex = Math.floor(huntIndex / pattern.length);
  const huntInSeason = huntIndex % pattern.length;
  const s = content.run.seasons[seasonIndex];
  const kind = pattern[huntInSeason];
  const quota = s?.quotas[huntInSeason];
  if (s === undefined || kind === undefined || quota === undefined) {
    throw new Error(`hunt ${huntIndex} is outside the run`);
  }
  if (!content.biomes.some((b: Biome) => b.id === s.biome))
    throw new Error(`season ${s.id}: biome ${s.biome} is not loaded`);
  const boss = content.birds.creatures.find((c) => c.id === s.boss);
  return {
    huntIndex,
    season: s.id,
    seasonIndex,
    huntInSeason,
    kind,
    quota,
    biome: s.biome,
    boss: s.boss,
    bossRule: boss?.kind === 'boss' ? boss.bossRule : null,
  };
}

/** Seed for a named part of the run (a hunt, a Padstal roll): pure function of the run seed. */
export function deriveSeed(runSeed: number, label: string): number {
  return fnv1a32(label, runSeed >>> 0);
}

/** The SimConfig pieces for the run's current hunt (Tech §3.9 → §3.1). */
export function huntSetup(
  content: ContentBundle,
  run: RunState,
): { readonly seed: number; readonly mode: ModeConfig; readonly info: HuntInfo } {
  const info = huntInfo(content, run.huntIndex);
  return {
    seed: deriveSeed(run.seed, `hunt:${run.huntIndex}`),
    info,
    mode: {
      id: 'seasonHunt',
      biome: info.biome,
      weapon: run.weapon,
      season: {
        kind: info.kind,
        boss: info.kind === 'boss' ? info.boss : null,
        charms: [...run.charms],
        consumables: [...run.consumables],
        rental: run.rental,
        runShellBonus: run.runShellBonus,
      },
    },
  };
}

function charmDefs(content: ContentBundle, ids: readonly string[]) {
  return ids.flatMap((id) => content.charms.charms.filter((c) => c.id === id));
}

/** Doppies an action of a run-level trigger (runStart, shopOpen) adds. */
function triggerDoppies(
  content: ContentBundle,
  run: RunState,
  on: 'runStart' | 'shopOpen',
): number {
  let n = 0;
  for (const c of charmDefs(content, run.charms)) {
    for (const e of c.effects) if (e.on === on) n += e.do.addDoppies ?? 0;
  }
  return n;
}

/** GDD §13.4: +3 base, +1 per full 10 % over quota (max +5), +1 per 5 unspent (max +5,
 *  Spaarblik raises the cap), +3 after a boss hunt, plus what was found in the hunt. */
export function doppiesTally(
  content: ContentBundle,
  run: RunState,
  score: number,
  quota: number,
  kind: SeasonHuntKind,
  found: number,
): DoppiesTally {
  const d = content.run.doppies;
  const over = quota <= 0 ? d.overQuotaCap : Math.floor(((score - quota) * 10) / quota);
  const overQuota = Math.min(d.overQuotaCap, Math.max(0, over)) * d.perTenPercentOverQuota;
  const cap = d.interestCap + passivesOf(charmDefs(content, run.charms)).interestCap;
  const interest = Math.max(0, Math.min(cap, Math.floor(run.doppies / d.interestPer)));
  const boss = kind === 'boss' ? d.bossHuntBonus : 0;
  return {
    base: d.perHunt,
    overQuota,
    interest,
    boss,
    found,
    total: d.perHunt + overQuota + interest + boss + found,
  };
}

/** Hunt over: quota check, payout, used consumables and the rental gone (Tally). */
export function settleHunt(content: ContentBundle, run: RunState, result: HuntResult): RunState {
  if (run.phase !== 'hunt') throw new Error(`settleHunt in phase ${run.phase}`);
  const info = huntInfo(content, run.huntIndex);
  const passed = result.score >= info.quota;
  const consumables = run.consumables.map((c, i) =>
    result.consumablesUsed.includes(i) ? null : c,
  );
  const base = {
    ...run,
    consumables,
    rental: null,
    runShellBonus: run.runShellBonus + result.shellCapacityForRun,
  };
  if (!passed) {
    return {
      ...base,
      phase: 'defeat',
      history: [
        ...run.history,
        { huntIndex: run.huntIndex, score: result.score, quota: info.quota, passed, doppies: null },
      ],
    };
  }
  const tally = doppiesTally(content, run, result.score, info.quota, info.kind, result.doppies);
  const last = run.huntIndex + 1 >= totalHunts(content);
  return {
    ...base,
    phase: last ? 'victory' : 'tally',
    doppies: run.doppies + tally.total,
    history: [
      ...run.history,
      { huntIndex: run.huntIndex, score: result.score, quota: info.quota, passed, doppies: tally },
    ],
  };
}

// --- Padstal (GDD §13.5) ---------------------------------------------------------------------

function shopRng(run: RunState, rerolls: number): RandomStream {
  return createRng(deriveSeed(run.seed, `shop:${run.huntIndex}:${rerolls}`)).stream('shop');
}

/** Rolls the offers: charms (weighted by rarity, never one you own), a consumable, a rental. */
export function rollOffers(content: ContentBundle, run: RunState, rerolls: number): ShopOffer[] {
  const rng = shopRng(run, rerolls);
  const p = content.run.padstal;
  const extra = passivesOf(charmDefs(content, run.charms)).shopSlots;
  const offers: ShopOffer[] = [];
  const candidates = content.charms.charms.filter(
    (c) => run.pool.includes(c.id) && !run.charms.includes(c.id),
  );
  for (let i = 0; i < p.charmOffers + extra && candidates.length > 0; i++) {
    const k = rng.weightedIndex(candidates.map((c) => content.charms.offerWeights[c.rarity]));
    const c = candidates[k];
    if (c === undefined) break;
    candidates.splice(k, 1);
    offers.push({ kind: 'charm', id: c.id, price: content.charms.prices[c.rarity], bought: false });
  }
  const powerups = content.powerups.powerups;
  for (let i = 0; i < p.consumableOffers && powerups.length > 0; i++) {
    const pu = powerups[rng.int(0, powerups.length - 1)];
    if (pu !== undefined)
      offers.push({ kind: 'consumable', id: pu.id, price: pu.padstalPrice, bought: false });
  }
  const crates = content.weapons.weapons.filter((w) => w.kind === 'crate');
  for (let i = 0; i < p.weaponOffers && crates.length > 0; i++) {
    const w = crates[rng.int(0, crates.length - 1)];
    if (w !== undefined)
      offers.push({ kind: 'weapon', id: w.id, price: p.weaponRentalPrice, bought: false });
  }
  return offers;
}

export function openPadstal(content: ContentBundle, run: RunState): RunState {
  if (run.phase !== 'tally') throw new Error(`openPadstal in phase ${run.phase}`);
  return {
    ...run,
    phase: 'padstal',
    doppies: run.doppies + triggerDoppies(content, run, 'shopOpen'),
    padstal: { offers: rollOffers(content, run, 0), rerolls: 0 },
  };
}

export function rerollCost(content: ContentBundle, run: RunState): number {
  const p = content.run.padstal;
  const discount = passivesOf(charmDefs(content, run.charms)).rerollDiscount;
  return Math.max(0, p.rerollBase + p.rerollIncrement * (run.padstal?.rerolls ?? 0) - discount);
}

export type ShopResult =
  | { readonly ok: true; readonly run: RunState }
  | {
      readonly ok: false;
      readonly reason: 'phase' | 'doppies' | 'slots' | 'sold' | 'index';
      readonly run: RunState;
    };

const fail = (run: RunState, reason: Extract<ShopResult, { ok: false }>['reason']): ShopResult => ({
  ok: false,
  reason,
  run,
});

export function reroll(content: ContentBundle, run: RunState): ShopResult {
  if (run.phase !== 'padstal' || run.padstal === null) return fail(run, 'phase');
  const cost = rerollCost(content, run);
  if (run.doppies < cost) return fail(run, 'doppies');
  const rerolls = run.padstal.rerolls + 1;
  return {
    ok: true,
    run: {
      ...run,
      doppies: run.doppies - cost,
      padstal: { rerolls, offers: rollOffers(content, run, rerolls) },
    },
  };
}

export function buy(content: ContentBundle, run: RunState, offerIndex: number): ShopResult {
  if (run.phase !== 'padstal' || run.padstal === null) return fail(run, 'phase');
  const offer = run.padstal.offers[offerIndex];
  if (offer === undefined) return fail(run, 'index');
  if (offer.bought) return fail(run, 'sold');
  if (run.doppies < offer.price) return fail(run, 'doppies');
  let next: RunState;
  if (offer.kind === 'charm') {
    if (run.charms.length >= content.charms.slots) return fail(run, 'slots');
    next = { ...run, charms: [...run.charms, offer.id] };
  } else if (offer.kind === 'consumable') {
    const slot = run.consumables.indexOf(null);
    if (slot < 0) return fail(run, 'slots');
    next = { ...run, consumables: run.consumables.map((c, i) => (i === slot ? offer.id : c)) };
  } else {
    if (run.rental !== null) return fail(run, 'slots');
    next = { ...run, rental: offer.id };
  }
  const offers = run.padstal.offers.map((o, i) => (i === offerIndex ? { ...o, bought: true } : o));
  return {
    ok: true,
    run: { ...next, doppies: run.doppies - offer.price, padstal: { ...run.padstal, offers } },
  };
}

/** Half the charm's price, rounded down (GDD §13.5). */
export function sellPrice(content: ContentBundle, charmId: string): number {
  const c = content.charms.charms.find((x) => x.id === charmId);
  return c === undefined
    ? 0
    : Math.floor(content.charms.prices[c.rarity] * content.charms.sellRatio);
}

export function sell(content: ContentBundle, run: RunState, slot: number): ShopResult {
  if (run.phase !== 'padstal') return fail(run, 'phase');
  const id = run.charms[slot];
  if (id === undefined) return fail(run, 'index');
  return {
    ok: true,
    run: {
      ...run,
      charms: run.charms.filter((_, i) => i !== slot),
      doppies: run.doppies + sellPrice(content, id),
    },
  };
}

/** New slot i holds old slot order[i] (the Padstal's drag, GDD §5.3). */
export function reorderCharms(run: RunState, order: readonly number[]): ShopResult {
  const n = run.charms.length;
  const valid =
    order.length === n &&
    new Set(order).size === n &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  if (!valid) return fail(run, 'index');
  return {
    ok: true,
    run: { ...run, charms: order.map((i) => run.charms[i]).filter((x) => x !== undefined) },
  };
}

/** Leave the Padstal: on to the next hunt. */
export function leavePadstal(run: RunState): RunState {
  if (run.phase !== 'padstal') throw new Error(`leavePadstal in phase ${run.phase}`);
  return { ...run, phase: 'hunt', huntIndex: run.huntIndex + 1, padstal: null };
}

/**
 * M9 "double Doppies" (GDD §19, a rewarded ad on the run tally): the Doppies the last hunt paid
 * are paid once more. Only in the tally; a hunt that paid nothing (or the hunt that ended the
 * run) changes nothing. The game allows it once per hunt (SaveData.runAds, D-026).
 */
export function bonusDoppies(run: RunState): RunState {
  if (run.phase !== 'tally') return run;
  const extra = run.history.at(-1)?.doppies?.total ?? 0;
  return extra > 0 ? { ...run, doppies: run.doppies + extra } : run;
}

/** True once the run is over (Victory or Defeat). */
export const runOver = (run: RunState): boolean =>
  run.phase === 'victory' || run.phase === 'defeat';
