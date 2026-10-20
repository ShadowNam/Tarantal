import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { twoFliesBonus, wholeFlockBonus } from './bonuses';
import { frenzyMul, nextStreak } from './frenzy';
import { scoreBag, scoreEventBonus, type Modifier } from './pipeline';

const add = (value: number, source = 'charm'): Modifier => ({ source, op: 'addMult', value });
const mul = (value: number, source = 'charm'): Modifier => ({ source, op: 'mulMult', value });
const pts = (value: number, source = 'charm'): Modifier => ({ source, op: 'addPoints', value });

interface Row {
  readonly name: string;
  readonly base: number;
  readonly behaviour: number;
  readonly mods?: readonly Modifier[];
  readonly weapon?: number;
  readonly frenzy?: number;
  readonly stampede?: number;
  readonly points: number;
  readonly mult: number;
  readonly award: number;
}

// Golden table: hand-computed from GDD §5.3. Changing the pipeline order or rounding breaks it.
const TABLE: readonly Row[] = [
  { name: 'near forage', base: 5, behaviour: 0, points: 5, mult: 1, award: 5 },
  { name: 'mid forage', base: 10, behaviour: 0, points: 10, mult: 1, award: 10 },
  { name: 'far forage', base: 25, behaviour: 0, points: 25, mult: 1, award: 25 },
  { name: 'mid alert', base: 10, behaviour: 0, points: 10, mult: 1, award: 10 },
  { name: 'mid running', base: 10, behaviour: 0.5, points: 10, mult: 1.5, award: 15 },
  { name: 'mid flying (wing shot)', base: 10, behaviour: 1, points: 10, mult: 2, award: 20 },
  { name: 'far flying', base: 25, behaviour: 1, points: 25, mult: 2, award: 50 },
  {
    name: 'GDD §9: mid flushed bird, Frenzy 6, Stampede',
    base: 10,
    behaviour: 1,
    frenzy: 2,
    stampede: 2,
    points: 10,
    mult: 8,
    award: 80,
  },
  {
    name: 'Frenzy 3 mid forage',
    base: 10,
    behaviour: 0,
    frenzy: 1.5,
    points: 10,
    mult: 1.5,
    award: 15,
  },
  {
    name: 'Frenzy 10 far flying',
    base: 25,
    behaviour: 1,
    frenzy: 3,
    points: 25,
    mult: 6,
    award: 150,
  },
  {
    name: 'Stampede near forage',
    base: 5,
    behaviour: 0,
    stampede: 2,
    points: 5,
    mult: 2,
    award: 10,
  },
  {
    name: 'Windbuks far flying',
    base: 25,
    behaviour: 1,
    weapon: 1.5,
    points: 25,
    mult: 3,
    award: 75,
  },
  {
    name: 'Kettie mid running',
    base: 10,
    behaviour: 0.5,
    weapon: 2,
    points: 10,
    mult: 3,
    award: 30,
  },
  {
    name: 'Wit Tarentaal flying in the Stampede',
    base: 100,
    behaviour: 1,
    stampede: 2,
    points: 100,
    mult: 4,
    award: 400,
  },
  {
    name: 'Lavendel running, Frenzy 3 (rounds 168.75 up)',
    base: 75,
    behaviour: 0.5,
    frenzy: 1.5,
    points: 75,
    mult: 2.25,
    award: 169,
  },
  { name: 'near running rounds 7.5 up', base: 5, behaviour: 0.5, points: 5, mult: 1.5, award: 8 },
  {
    name: 'near running, Frenzy 3 rounds 11.25 down',
    base: 5,
    behaviour: 0.5,
    frenzy: 1.5,
    points: 5,
    mult: 2.25,
    award: 11,
  },
  {
    name: 'Generaal forage, Frenzy 6',
    base: 100,
    behaviour: 0,
    frenzy: 2,
    points: 100,
    mult: 2,
    award: 200,
  },
  {
    name: 'addPoints sum',
    base: 10,
    behaviour: 0,
    mods: [pts(5), pts(3)],
    points: 18,
    mult: 1,
    award: 18,
  },
  { name: 'addMult +2', base: 10, behaviour: 0, mods: [add(2)], points: 10, mult: 3, award: 30 },
  {
    name: 'charm order: +2 then ×3',
    base: 10,
    behaviour: 0,
    mods: [add(2, 'a'), mul(3, 'b')],
    points: 10,
    mult: 9,
    award: 90,
  },
  {
    name: 'charm order: ×3 then +2',
    base: 10,
    behaviour: 0,
    mods: [mul(3, 'b'), add(2, 'a')],
    points: 10,
    mult: 5,
    award: 50,
  },
  {
    name: 'addPoints applies before any mult',
    base: 10,
    behaviour: 1,
    mods: [mul(2), pts(5)],
    points: 15,
    mult: 4,
    award: 60,
  },
  {
    name: 'everything: far flying, +1 ×1.5, Kettie, Frenzy 6, Stampede',
    base: 25,
    behaviour: 1,
    mods: [add(1), mul(1.5)],
    weapon: 2,
    frenzy: 2,
    stampede: 2,
    points: 25,
    mult: 36,
    award: 900,
  },
];

describe('scoring pipeline golden table (GDD §5.3)', () => {
  it('has at least 20 cases', () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(20);
  });

  for (const row of TABLE) {
    it(row.name, () => {
      const r = scoreBag(
        {
          base: row.base,
          behaviourAdd: row.behaviour,
          weaponScoreMul: row.weapon ?? 1,
          frenzyMul: row.frenzy ?? 1,
          stampedeMul: row.stampede ?? 1,
        },
        row.mods ?? [],
      );
      expect({ points: r.points, mult: r.mult, award: r.award }).toEqual({
        points: row.points,
        mult: row.mult,
        award: row.award,
      });
    });
  }

  it('swapping two charms changes the award (slot order matters)', () => {
    const ctx = { base: 10, behaviourAdd: 1, weaponScoreMul: 1, frenzyMul: 1, stampedeMul: 1 };
    const before = scoreBag(ctx, [add(2), mul(3)]).award;
    const after = scoreBag(ctx, [mul(3), add(2)]).award;
    expect(before).toBe(120);
    expect(after).toBe(80);
  });

  it('records a breakdown that ends at the final points and mult', () => {
    const r = scoreBag(
      { base: 10, behaviourAdd: 1, weaponScoreMul: 1, frenzyMul: 2, stampedeMul: 2 },
      [pts(2, 'x')],
    );
    expect(r.breakdown.map((s) => s.kind)).toEqual([
      'base',
      'addPoints',
      'behaviour',
      'frenzy',
      'stampede',
    ]);
    const last = r.breakdown.at(-1);
    expect(last?.points).toBe(12);
    expect(last?.mult).toBe(8);
  });
});

describe('event bonuses', () => {
  const content = loadContent();
  const multipliers = content.scoring.eventBonusMultipliers;

  it('Twee Vlieë pays 2 = 15, 3 = 40, 4+ = 80 (tuned in M3, D-020)', () => {
    const table = content.scoring.twoFlies;
    expect([0, 1, 2, 3, 4, 7].map((n) => twoFliesBonus(n, table))).toEqual([0, 0, 15, 40, 80, 80]);
  });

  it('are multiplied by Frenzy × Stampede but never by the weapon', () => {
    expect(scoreEventBonus(50, { frenzyMul: 2, stampedeMul: 2, multipliers })).toBe(200);
    expect(scoreEventBonus(50, { frenzyMul: 1, stampedeMul: 1, multipliers })).toBe(50);
    expect(scoreEventBonus(150, { frenzyMul: 1.5, stampedeMul: 1, multipliers })).toBe(225);
  });

  it('apply a charm bonusMul on top', () => {
    expect(scoreEventBonus(50, { frenzyMul: 1, stampedeMul: 2, multipliers, bonusMul: 3 })).toBe(
      300,
    );
  });

  it('Whole Flock pays perBird × size only for a complete flock of ≥ minSize', () => {
    const rule = content.scoring.wholeFlock;
    expect(wholeFlockBonus(6, 6, rule)).toBe(180); // +30 per bird (tuned in M3, D-020)
    expect(wholeFlockBonus(6, 5, rule)).toBe(0);
    expect(wholeFlockBonus(4, 4, rule)).toBe(0);
  });
});

describe('Frenzy (GDD §9)', () => {
  const tiers = loadContent().scoring.frenzyTiers;

  it('3 → ×1.5, 6 → ×2, 10 → ×3', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 40].map((s) => frenzyMul(s, tiers))).toEqual([
      1, 1, 1, 1.5, 1.5, 2, 2, 3, 3,
    ]);
  });

  it('a bagging shot extends the streak, an empty-handed shot resets it', () => {
    expect(nextStreak(5, true)).toBe(6);
    expect(nextStreak(5, false)).toBe(0);
  });
});
