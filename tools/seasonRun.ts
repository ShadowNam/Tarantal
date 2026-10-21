// Balance bot v2 (GDD §13.8, build plan M6): plays whole Season Runs headless — hunts with a
// player bot, then the Padstal with a charm policy:
//   none     buys nothing (skill alone)
//   synergy  a scripted archetype-focused picker: values each charm for how this bot plays,
//            commits to the archetype of its first charm, orders +Mult before ×Mult, buys a
//            consumable and a rental when it has doppies to spare, and uses them in the hunt.
import type { Charm, ContentBundle } from '../src/content/schemas';
import {
  buy,
  createRun,
  huntSetup,
  leavePadstal,
  openPadstal,
  reorderCharms,
  reroll,
  rerollCost,
  runOver,
  sell,
  sellPrice,
  settleHunt,
  type RunState,
} from '../src/sim/run/run';
import { createSim } from '../src/sim/Sim';
import type { Command, HuntResult, InputKind, SimState } from '../src/sim/types';
import { createBot, type BotKind } from './bots';

export type CharmPolicy = 'none' | 'synergy';
export const CHARM_POLICIES: readonly CharmPolicy[] = ['none', 'synergy'];

export interface RunOptions {
  readonly content: ContentBundle;
  readonly seed: number;
  readonly bot: BotKind;
  readonly policy: CharmPolicy;
  readonly pool: readonly string[];
  readonly inputKind?: InputKind;
  readonly weapon?: string;
  /** Stop after this many hunts (e.g. 6 = Herfs + Winter). */
  readonly maxHunts?: number;
  /** Called with the run after every Padstal (save point), e.g. to test resume. */
  readonly onSave?: (run: RunState) => RunState;
}

export interface HuntRow {
  readonly huntIndex: number;
  /** The biome the hunt played on (M8: each season's own). */
  readonly biome: string;
  readonly score: number;
  readonly quota: number;
  readonly passed: boolean;
  readonly charms: readonly string[];
  readonly doppies: number;
}

export interface RunOutcome {
  readonly run: RunState;
  readonly hunts: readonly HuntRow[];
}

/**
 * How much this bot gains from each charm (the competent bot escalates flocks to FLUSH, so it
 * bags many flying birds; it never uses a charge-less gadget, so Fluitjie is worth little).
 * Archetype focus is added on top in pickValue().
 */
const CHARM_VALUE: Readonly<Record<string, number>> = {
  vlerkskoot: 9,
  rooi_patrone: 7,
  kettingreaksie: 7,
  laaste_patroon: 6,
  stampede_kenner: 8,
  geheime_resep: 8,
  hele_swerm: 6,
  grondwerk: 5,
  generaal_se_pot: 5,
  ekstra_bandolier: 5,
  snelhand: 4,
  boeretroos_fles: 5,
  bles_die_plaashond: 4,
  oupa_se_bril: 2,
  windleser: 3,
  haelstorm: 4,
  konsertina: 3,
  kwevoel_se_seen: 3,
  oupa_se_kaart: 3,
  spaarblik: 3,
  padstal_vriend: 2,
  stil_loop: 2,
  hadeda_fluit: 1,
  fluitjie: 1,
};
/** Worth buying at all. */
const MIN_VALUE = 3;

function charmOf(content: ContentBundle, id: string): Charm | undefined {
  return content.charms.charms.find((c) => c.id === id);
}

/** The archetype the policy committed to: that of its first (non-economy) charm. */
function focusOf(content: ContentBundle, run: RunState): string | undefined {
  for (const id of run.charms) {
    const a = charmOf(content, id)?.archetype;
    if (a !== undefined && a !== 'economy') return a;
  }
  return undefined;
}

/**
 * Archetype-focused (GDD §13.8): the first charm is the best one on offer; after that only
 * charms of the same archetype (and economy charms, which serve any build) are worth buying.
 */
function pickValue(content: ContentBundle, run: RunState, id: string): number {
  const c = charmOf(content, id);
  if (c === undefined) return 0;
  const focus = focusOf(content, run);
  if (focus !== undefined && c.archetype !== focus && c.archetype !== 'economy') return 0;
  return (CHARM_VALUE[id] ?? 0) + (focus !== undefined && c.archetype === focus ? 2 : 0);
}

/** 0 = flat points, 1 = +Mult, 2 = ×Mult, 3 = everything else: + before × (GDD §5.3). */
function orderKey(content: ContentBundle, id: string): number {
  const c = charmOf(content, id);
  if (c === undefined) return 3;
  const acts = c.effects.map((e) => e.do);
  if (acts.some((a) => a.addPoints !== undefined)) return 0;
  if (acts.some((a) => a.addMult !== undefined || a.addMultForHunt !== undefined)) return 1;
  if (acts.some((a) => a.mulMult !== undefined)) return 2;
  return 3;
}

/** The synergy policy at one Padstal. */
export function shopSynergy(content: ContentBundle, start: RunState): RunState {
  let run = start;
  const slots = content.charms.slots;
  for (let pass = 0; pass < 4; pass++) {
    const offers = run.padstal?.offers ?? [];
    // Best affordable charm offer.
    const charmOffers = offers
      .map((o, i) => ({ o, i, v: pickValue(content, run, o.id) }))
      .filter((x) => x.o.kind === 'charm' && !x.o.bought && x.v >= MIN_VALUE)
      .sort((a, b) => b.v - a.v || a.i - b.i);
    let bought = false;
    for (const x of charmOffers) {
      if (run.charms.length >= slots) {
        // Swap out the weakest charm when the offer is clearly better.
        const weakest = run.charms
          .map((id, slot) => ({ slot, v: pickValue(content, run, id), id }))
          .sort((a, b) => a.v - b.v)[0];
        if (weakest === undefined || x.v < weakest.v + 3) continue;
        if (run.doppies + sellPrice(content, weakest.id) < x.o.price) continue;
        run = sell(content, run, weakest.slot).run;
      }
      const r = buy(content, run, x.i);
      if (r.ok) {
        run = r.run;
        bought = true;
        break;
      }
    }
    if (bought) continue;
    // Nothing worth it: reroll if rich enough to still buy afterwards.
    const cost = rerollCost(content, run);
    if (run.charms.length < slots && run.doppies >= cost + 6 && pass < 2) {
      const r = reroll(content, run);
      if (r.ok) {
        run = r.run;
        continue;
      }
    }
    break;
  }
  // Spare doppies: a consumable, then a rental (keeps 4 back for interest).
  for (const kind of ['consumable', 'weapon'] as const) {
    const offers = run.padstal?.offers ?? [];
    const i = offers.findIndex((o) => o.kind === kind && !o.bought);
    const o = offers[i];
    if (o !== undefined && run.doppies - o.price >= 4) {
      const r = buy(content, run, i);
      if (r.ok) run = r.run;
    }
  }
  const order = run.charms
    .map((id, i) => ({ i, k: orderKey(content, id) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.i);
  return reorderCharms(run, order).run;
}

/** Wraps the player bot: uses consumables and the rental the way the synergy policy intends. */
function seasonBot(
  inner: ReturnType<typeof createBot>,
  policy: CharmPolicy,
): { next(s: SimState): Command[] } {
  return {
    next(s) {
      const out = inner.next(s);
      const season = s.season;
      if (policy === 'none' || season === null) return out;
      // Power-ups: one early, one for the last third. The rental: when a flock is flushing.
      const third = s.durationTicks / 3;
      season.consumables.forEach((id, slot) => {
        if (id === null) return;
        if ((slot === 0 && s.tick === 300) || (slot === 1 && s.tick === Math.floor(2 * third))) {
          out.push({ t: 'consumable', slot });
        }
      });
      if (
        season.rental !== null &&
        s.weapon.kind === 'primary' &&
        (s.flocks.some((f) => f.state === 'flush' || f.state === 'run') || s.ticksLeft < 900)
      ) {
        out.push({ t: 'consumable', slot: season.consumables.length });
      }
      return out;
    },
  };
}

export function playSeasonHunt(
  content: ContentBundle,
  run: RunState,
  bot: BotKind,
  policy: CharmPolicy,
  inputKind: InputKind,
): HuntResult {
  const { seed, mode } = huntSetup(content, run);
  const sim = createSim({ seed, content, mode, inputKind });
  const player = seasonBot(createBot(bot, seed, content, inputKind), policy);
  while (!sim.isOver()) {
    sim.step(player.next(sim.snapshot()));
    sim.drainEvents();
  }
  return sim.result();
}

export function playRun(o: RunOptions): RunOutcome {
  const { content } = o;
  const inputKind = o.inputKind ?? 'pointer';
  let run = createRun(content, { seed: o.seed, weapon: o.weapon ?? 'dubbelloop', pool: o.pool });
  const hunts: HuntRow[] = [];
  const max = o.maxHunts ?? Infinity;
  while (!runOver(run) && hunts.length < max) {
    const charms = [...run.charms];
    const result = playSeasonHunt(content, run, o.bot, o.policy, inputKind);
    run = settleHunt(content, run, result);
    const rec = run.history.at(-1);
    hunts.push({
      huntIndex: rec?.huntIndex ?? -1,
      biome: result.biome,
      score: result.score,
      quota: rec?.quota ?? 0,
      passed: rec?.passed ?? false,
      charms,
      doppies: run.doppies,
    });
    if (run.phase !== 'tally' || hunts.length >= max) break;
    run = openPadstal(content, run);
    if (o.policy === 'synergy') run = shopSynergy(content, run);
    run = leavePadstal(run);
    if (o.onSave) run = o.onSave(run);
  }
  return { run, hunts };
}
