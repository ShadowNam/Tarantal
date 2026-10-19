import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { damageOf, type BirdCreature } from '../birds/Bird';
import { applyShotDamage, type Damageable } from './damage';

const creatures = loadContent().birds.creatures;
function creature(id: string): BirdCreature {
  const c = creatures.find((x) => x.id === id);
  if (c === undefined || c.kind === 'helper') throw new Error(id);
  return c;
}
function target(id: number, creatureId: string): Damageable {
  const c = creature(creatureId);
  return { id, creature: c, ...damageOf(c) };
}

describe('shot damage', () => {
  it('bags a normal bird with one qualifying shot', () => {
    const b = target(1, 'tarentaal');
    const r = applyShotDamage([b], new Map([[1, 1]]), 8);
    expect(r.outcomes).toEqual([{ kind: 'bagged', birdId: 1 }]);
  });

  it('Generaal: needs 3 pellets from a shotgun; first hit knocks the pot off, second bags', () => {
    const g = target(7, 'generaal');
    expect(g.armorLeft).toBe(1);
    // 2 pellets < min(3, 8): touched, but no hit.
    let r = applyShotDamage([g], new Map([[7, 2]]), 8);
    expect(r).toEqual({ outcomes: [], touched: true });
    r = applyShotDamage([g], new Map([[7, 3]]), 8);
    expect(r.outcomes).toEqual([{ kind: 'armor', birdId: 7, armorLeft: 0 }]);
    r = applyShotDamage([g], new Map([[7, 5]]), 8);
    expect(r.outcomes).toEqual([{ kind: 'bagged', birdId: 7 }]);
  });

  it('a single-projectile weapon always scores a full hit on a boss (min rule)', () => {
    const g = target(7, 'generaal');
    expect(applyShotDamage([g], new Map([[7, 1]]), 1).outcomes).toEqual([
      { kind: 'armor', birdId: 7, armorLeft: 0 },
    ]);
  });

  it('pellets never add up across shots', () => {
    const k = target(3, 'kuifkop_koning'); // pelletsToBag 3, hitsToBag 3
    for (let i = 0; i < 5; i++) applyShotDamage([k], new Map([[3, 2]]), 8);
    expect(k.hitsLeft).toBe(3);
  });

  it('hitsToBag accumulates across shots', () => {
    const k = target(3, 'kuifkop_koning');
    expect(applyShotDamage([k], new Map([[3, 3]]), 8).outcomes).toEqual([
      { kind: 'hit', birdId: 3, hitsLeft: 2 },
    ]);
    applyShotDamage([k], new Map([[3, 4]]), 8);
    expect(applyShotDamage([k], new Map([[3, 3]]), 8).outcomes).toEqual([
      { kind: 'bagged', birdId: 3 },
    ]);
  });

  it('non-targets go down to one pellet; untouched birds are left alone', () => {
    const h = target(1, 'hadeda');
    const t = target(2, 'tarentaal');
    const r = applyShotDamage([h, t], new Map([[1, 1]]), 8);
    expect(r.outcomes).toEqual([{ kind: 'bagged', birdId: 1 }]);
    expect(applyShotDamage([t], new Map(), 8)).toEqual({ outcomes: [], touched: false });
  });
});
