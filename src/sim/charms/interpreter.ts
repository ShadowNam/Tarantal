// Charm effect interpreter (Tech §3.8). Charms are data: each effect is `on` (trigger) + `if`
// (conditions, all must hold) + `do` (actions). This module is pure: it turns triggers into
// scoring modifiers (in slot order, then listed order — GDD §5.3) and into actions the Sim
// applies. Passive effects are folded once into CharmPassives.
import type { Charm } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import type { Modifier } from '../scoring/pipeline';
import type { BagBehaviour, PlaneId } from '../types';
import type { CharmScript } from './registry';

type Effect = Charm['effects'][number];
export type CharmTrigger = Effect['on'];
export type CharmActions = Effect['do'];
type Conditions = NonNullable<Effect['if']>;

export type CharmBonusId = 'wholeFlock' | 'twoFlies' | 'secretChain';

/** Stats a charm holds while equipped. Value semantics (Tech §3.8): `…Mul` multiplies, stat
 *  numbers add. */
export interface CharmPassives {
  readonly shellCapacity: number;
  readonly reloadSpeedMul: number;
  readonly alertRadiusMul: number;
  /** Alert radius of a shot that hit nothing (Stil Loop: 0). */
  readonly missAlertMul: number;
  readonly windDriftMul: number;
  readonly bonusMul: Readonly<Record<CharmBonusId, number>>;
  /** creature id → penalty points instead of its own. */
  readonly penaltyOverride: ReadonlyMap<string, number>;
  /** creature id → how many times as often its biome events happen. */
  readonly spawnRateMul: ReadonlyMap<string, number>;
  readonly revealSecrets: boolean;
  readonly enableStampede: boolean;
  readonly frenzyMissBehaviour: 'reset' | 'dropTier';
  readonly weaponBlastEvery: { readonly every: number; readonly weapon: string } | null;
  readonly interestCap: number;
  readonly shopSlots: number;
  readonly rerollDiscount: number;
  /** A charm that replaces the gadget (Fluitjie): the left-most one wins. */
  readonly gadget: {
    readonly charm: string;
    readonly replaces: string;
    readonly cooldownMs: number;
  } | null;
}

export function passivesOf(charms: readonly Charm[]): CharmPassives {
  let shellCapacity = 0;
  let reloadSpeedMul = 1;
  let alertRadiusMul = 1;
  let missAlertMul = 1;
  let windDriftMul = 1;
  const bonusMul: Record<CharmBonusId, number> = { wholeFlock: 1, twoFlies: 1, secretChain: 1 };
  const penaltyOverride = new Map<string, number>();
  const spawnRateMul = new Map<string, number>();
  let revealSecrets = false;
  let enableStampede = false;
  let frenzyMissBehaviour: 'reset' | 'dropTier' = 'reset';
  let weaponBlastEvery: CharmPassives['weaponBlastEvery'] = null;
  let interestCap = 0;
  let shopSlots = 0;
  let rerollDiscount = 0;
  let gadget: CharmPassives['gadget'] = null;
  for (const c of charms) {
    if (c.gadget !== undefined && gadget === null) gadget = { charm: c.id, ...c.gadget };
    for (const e of c.effects) {
      if (e.on !== 'passive') continue;
      const d = e.do;
      if (d.shellCapacity !== undefined) shellCapacity += d.shellCapacity;
      if (d.reloadSpeedMul !== undefined) reloadSpeedMul *= d.reloadSpeedMul;
      if (d.alertRadiusMul !== undefined) {
        if (typeof d.alertRadiusMul === 'number') alertRadiusMul *= d.alertRadiusMul;
        else missAlertMul *= d.alertRadiusMul.mul;
      }
      if (d.windDriftMul !== undefined) windDriftMul *= d.windDriftMul;
      if (d.bonusMul !== undefined) bonusMul[d.bonusMul.bonus] *= d.bonusMul.mul;
      if (d.penaltyOverride !== undefined)
        penaltyOverride.set(d.penaltyOverride.creature, d.penaltyOverride.points);
      if (d.spawnRateMul !== undefined) {
        const { creature, mul } = d.spawnRateMul;
        spawnRateMul.set(creature, (spawnRateMul.get(creature) ?? 1) * mul);
      }
      if (d.revealSecrets === true) revealSecrets = true;
      if (d.enableStampede === true) enableStampede = true;
      if (d.frenzyMissBehaviour === 'dropTier') frenzyMissBehaviour = 'dropTier';
      if (d.weaponBlastEvery !== undefined && weaponBlastEvery === null)
        weaponBlastEvery = d.weaponBlastEvery;
      if (d.interestCap !== undefined) interestCap += d.interestCap;
      if (d.shopSlots !== undefined) shopSlots += d.shopSlots;
      if (d.rerollDiscount !== undefined) rerollDiscount += d.rerollDiscount;
    }
  }
  return {
    shellCapacity,
    reloadSpeedMul,
    alertRadiusMul,
    missAlertMul,
    windDriftMul,
    bonusMul,
    penaltyOverride,
    spawnRateMul,
    revealSecrets,
    enableStampede,
    frenzyMissBehaviour,
    weaponBlastEvery,
    interestCap,
    shopSlots,
    rerollDiscount,
    gadget,
  };
}

/** What a trigger knows about the moment (Tech §3.8 conditions). Bird fields only on bags. */
export interface TriggerContext {
  readonly plane?: PlaneId;
  readonly behaviour?: BagBehaviour;
  readonly creature?: string;
  readonly boss?: boolean;
  /** Active weapon id (primary or crate weapon, or the Haelstorm blast's weapon). */
  readonly weapon?: string;
  /** Frenzy streak after the shot, and how many tiers it has reached (0 = none). */
  readonly streak: number;
  readonly frenzyTier: number;
  /** The first bag of its shot (streakEvery counts once per shot). */
  readonly firstBagOfShot?: boolean;
  /** 1-based position of the shell in the belt; null for crate weapons and unlimited ammo. */
  readonly shellIndex?: number | null;
  /** The shot emptied the belt. */
  readonly lastShell?: boolean;
  readonly omenActive: boolean;
  readonly omen: string | null;
  readonly biome: string;
  readonly kwevoelCalling: boolean;
}

export function conditionsHold(c: Conditions | undefined, ctx: TriggerContext): boolean {
  if (c === undefined) return true;
  if (c.plane !== undefined && (ctx.plane === undefined || !c.plane.includes(ctx.plane)))
    return false;
  if (
    c.behaviour !== undefined &&
    (ctx.behaviour === undefined || !c.behaviour.includes(ctx.behaviour))
  )
    return false;
  if (c.weapon !== undefined && (ctx.weapon === undefined || !c.weapon.includes(ctx.weapon)))
    return false;
  if (
    c.creature !== undefined &&
    (ctx.creature === undefined || !c.creature.includes(ctx.creature))
  )
    return false;
  if (c.boss !== undefined && (ctx.boss ?? false) !== c.boss) return false;
  if (c.frenzyAtLeast !== undefined && ctx.frenzyTier < c.frenzyAtLeast) return false;
  if (
    c.streakEvery !== undefined &&
    !(ctx.firstBagOfShot === true && ctx.streak > 0 && ctx.streak % c.streakEvery === 0)
  )
    return false;
  if (c.shellIndex !== undefined) {
    const idx = ctx.shellIndex ?? null;
    if (idx === null) return false;
    if (c.shellIndex === 'first' && idx !== 1) return false;
    if (c.shellIndex === 'last' && ctx.lastShell !== true) return false;
    if (typeof c.shellIndex === 'number' && idx !== c.shellIndex) return false;
  }
  if (c.omenActive !== undefined && ctx.omenActive !== c.omenActive) return false;
  if (c.omen !== undefined && (ctx.omen === null || !ctx.omenActive || !c.omen.includes(ctx.omen)))
    return false;
  if (c.biome !== undefined && !c.biome.includes(ctx.biome)) return false;
  if (c.kwevoelCalling !== undefined && ctx.kwevoelCalling !== c.kwevoelCalling) return false;
  return true;
}

/** A charm effect that fired with actions for the Sim (everything but per-bag scoring). */
export interface FiredEffect {
  readonly charm: string;
  readonly slot: number;
  readonly trigger: CharmTrigger;
  readonly actions: CharmActions;
}

export interface BagOutcome {
  readonly modifiers: readonly Modifier[];
  readonly fired: readonly FiredEffect[];
}

export interface CharmEngine {
  readonly passives: CharmPassives;
  /** Charm ids in slot order (left → right). */
  order(): readonly string[];
  /** addMultForHunt built up so far, per slot. */
  huntMults(): readonly number[];
  /** Applies a permutation of slot indexes (new slot i holds old slot order[i]). */
  reorder(order: readonly number[]): boolean;
  /** Per-bag scoring modifiers in slot order (GDD §5.3), plus the bag's other actions. */
  bag(ctx: TriggerContext): BagOutcome;
  /** Any other trigger. addMultForHunt is kept here; the rest is returned for the Sim. */
  trigger(on: CharmTrigger, ctx: TriggerContext): readonly FiredEffect[];
  /** tick:every:<n> and timeLeft:<s> triggers due on this tick. */
  tickTriggers(tick: number, ticksLeft: number, ctx: TriggerContext): readonly FiredEffect[];
}

interface Slot {
  readonly charm: Charm;
  huntMult: number;
}

export function createCharmEngine(
  charms: readonly Charm[],
  scripts: Readonly<Record<string, CharmScript>> = {},
): CharmEngine {
  let slots: Slot[] = charms.map((charm) => ({ charm, huntMult: 0 }));
  const passives = passivesOf(charms);
  const timings = new Map<Effect, Timing>();
  for (const c of charms) {
    for (const e of c.effects) {
      const t = timingOf(e.on);
      if (t !== null) timings.set(e, t);
    }
  }

  /** Listed effects for this trigger whose conditions hold, then the script's. */
  function actionsFor(slot: Slot, on: CharmTrigger, ctx: TriggerContext): CharmActions[] {
    const out: CharmActions[] = [];
    for (const e of slot.charm.effects) {
      if (e.on === on && conditionsHold(e.if, ctx)) out.push(e.do);
    }
    const script = slot.charm.script === undefined ? undefined : scripts[slot.charm.script];
    if (script !== undefined) out.push(...script.effects(on, ctx));
    return out;
  }

  function fire(
    slot: Slot,
    index: number,
    on: CharmTrigger,
    list: readonly CharmActions[],
    out: FiredEffect[],
  ): void {
    for (const actions of list) {
      if (actions.addMultForHunt !== undefined) slot.huntMult += actions.addMultForHunt;
      out.push({ charm: slot.charm.id, slot: index, trigger: on, actions });
    }
  }

  return {
    passives,
    order: () => slots.map((s) => s.charm.id),
    huntMults: () => slots.map((s) => s.huntMult),
    reorder(order) {
      if (order.length !== slots.length) return false;
      const seen = new Set<number>();
      for (const i of order) {
        if (!Number.isInteger(i) || i < 0 || i >= slots.length || seen.has(i)) return false;
        seen.add(i);
      }
      const old = slots;
      slots = order.map((i) => old[i]).filter((s): s is Slot => s !== undefined);
      return true;
    },
    bag(ctx) {
      const modifiers: Modifier[] = [];
      const fired: FiredEffect[] = [];
      slots.forEach((slot, index) => {
        const source = slot.charm.id;
        // A charm's built-up Mult applies at its own slot, so order matters for it too.
        if (slot.huntMult !== 0) modifiers.push({ source, op: 'addMult', value: slot.huntMult });
        for (const a of actionsFor(slot, 'bag', ctx)) {
          if (a.addPoints !== undefined)
            modifiers.push({ source, op: 'addPoints', value: a.addPoints });
          if (a.addMult !== undefined) modifiers.push({ source, op: 'addMult', value: a.addMult });
          if (a.mulMult !== undefined) modifiers.push({ source, op: 'mulMult', value: a.mulMult });
          const rest = withoutScoring(a);
          if (rest !== null) fire(slot, index, 'bag', [rest], fired);
        }
      });
      return { modifiers, fired };
    },
    trigger(on, ctx) {
      const out: FiredEffect[] = [];
      slots.forEach((slot, index) => {
        fire(slot, index, on, actionsFor(slot, on, ctx), out);
      });
      return out;
    },
    tickTriggers(tick, ticksLeft, ctx) {
      const out: FiredEffect[] = [];
      slots.forEach((slot, index) => {
        for (const e of slot.charm.effects) {
          const t = timings.get(e);
          if (t === undefined || !isDue(t, tick, ticksLeft) || !conditionsHold(e.if, ctx)) continue;
          fire(slot, index, e.on, [e.do], out);
        }
      });
      return out;
    },
  };
}

const SCORING_KEYS: ReadonlySet<string> = new Set(['addPoints', 'addMult', 'mulMult']);

/** A bag effect's non-scoring actions (ammo, run), or null when it only scores. */
function withoutScoring(a: CharmActions): CharmActions | null {
  const rest = Object.fromEntries(Object.entries(a).filter(([k]) => !SCORING_KEYS.has(k)));
  return Object.keys(rest).length > 0 ? rest : null;
}

/** When a timed trigger fires, worked out once at load (no time conversion per tick). */
type Timing = { readonly every: number } | { readonly atTicksLeft: number };

function timingOf(on: CharmTrigger): Timing | null {
  if (on.startsWith('tick:every:')) return { every: Number(on.slice('tick:every:'.length)) };
  if (on.startsWith('timeLeft:'))
    return { atTicksLeft: secondsToTicks(Number(on.slice('timeLeft:'.length))) };
  return null;
}

function isDue(t: Timing, tick: number, ticksLeft: number): boolean {
  if ('every' in t) return tick > 0 && tick % t.every === 0;
  return ticksLeft === t.atTicksLeft;
}
