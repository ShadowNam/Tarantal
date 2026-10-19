// The per-bag scoring pipeline, exactly GDD §5.3 (Tech §3.7). Pure; the breakdown feeds the
// score pop-up ("10 ×2.5 → +25") and the tally screen.
//
//   points = base + Σ addPoints
//   mult   = 1 + behaviourAdd
//   for each modifier in order (charms in slot order, effects in listed order):
//       addMult → mult += x        mulMult → mult ×= x
//   mult  ×= weaponScoreMul × frenzyMul × stampedeMul      (system multipliers, always last)
//   award  = round(points × mult)

export interface BagContext {
  /** Plane base points, or the creature's baseOverride. */
  readonly base: number;
  /** scoring.json behaviourAdd for the bird's behaviour when bagged. */
  readonly behaviourAdd: number;
  readonly weaponScoreMul: number;
  readonly frenzyMul: number;
  /** 1 outside the Stampede. */
  readonly stampedeMul: number;
}

/** One scoring action from a charm effect. The caller passes them in slot order, then listed order. */
export interface Modifier {
  /** Where it came from (charm id), for the breakdown. */
  readonly source: string;
  readonly op: 'addPoints' | 'addMult' | 'mulMult';
  readonly value: number;
}

export type BreakdownKind =
  'base' | 'addPoints' | 'behaviour' | 'addMult' | 'mulMult' | 'weapon' | 'frenzy' | 'stampede';

export interface BreakdownStep {
  readonly kind: BreakdownKind;
  readonly source: string;
  readonly value: number;
  /** Running points and mult after this step. */
  readonly points: number;
  readonly mult: number;
}

export interface BagScore {
  readonly points: number;
  readonly mult: number;
  readonly award: number;
  readonly breakdown: readonly BreakdownStep[];
}

export function scoreBag(ctx: BagContext, modifiers: readonly Modifier[]): BagScore {
  const breakdown: BreakdownStep[] = [];
  let points = ctx.base;
  let mult = 1;
  const push = (kind: BreakdownKind, source: string, value: number): void => {
    breakdown.push({ kind, source, value, points, mult });
  };
  push('base', 'base', ctx.base);

  // Punte: order irrelevant (a sum), but keep listed order in the breakdown.
  for (const m of modifiers) {
    if (m.op !== 'addPoints') continue;
    points += m.value;
    push('addPoints', m.source, m.value);
  }

  // Maal: behaviour first, then modifiers in order — order MATTERS.
  mult = 1 + ctx.behaviourAdd;
  push('behaviour', 'behaviour', ctx.behaviourAdd);
  for (const m of modifiers) {
    if (m.op === 'addMult') {
      mult += m.value;
      push('addMult', m.source, m.value);
    } else if (m.op === 'mulMult') {
      mult *= m.value;
      push('mulMult', m.source, m.value);
    }
  }

  // System multipliers, always last.
  mult *= ctx.weaponScoreMul;
  if (ctx.weaponScoreMul !== 1) push('weapon', 'weapon', ctx.weaponScoreMul);
  mult *= ctx.frenzyMul;
  if (ctx.frenzyMul !== 1) push('frenzy', 'frenzy', ctx.frenzyMul);
  mult *= ctx.stampedeMul;
  if (ctx.stampedeMul !== 1) push('stampede', 'stampede', ctx.stampedeMul);

  return { points, mult, award: Math.round(points * mult), breakdown };
}

export type EventBonusMultiplier = 'frenzy' | 'stampede';

export interface EventBonusContext {
  readonly frenzyMul: number;
  readonly stampedeMul: number;
  /** scoring.json eventBonusMultipliers: which system multipliers apply to event bonuses. */
  readonly multipliers: readonly EventBonusMultiplier[];
  /** A charm's bonusMul for this bonus (M6); 1 when none. */
  readonly bonusMul?: number;
}

/**
 * Event bonuses (Twee Vlieë, Whole Flock, secrets, armour knock-offs) are flat amounts multiplied
 * only by the listed system multipliers — never by behaviour, weapon or per-bird charm effects.
 */
export function scoreEventBonus(amount: number, ctx: EventBonusContext): number {
  let mult = ctx.bonusMul ?? 1;
  if (ctx.multipliers.includes('frenzy')) mult *= ctx.frenzyMul;
  if (ctx.multipliers.includes('stampede')) mult *= ctx.stampedeMul;
  return Math.round(amount * mult);
}
