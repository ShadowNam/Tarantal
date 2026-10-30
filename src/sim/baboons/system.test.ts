// v1.8b (D-062, round 2): a mother costs the penalty only when motherPellets of one shot strike
// her (a gun with fewer pellets: all of them), like the balloons: a stray pellet of a spread aimed
// at a bird below the ridge costs nothing (it still sends the troop away).
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import type { SimEvent } from '../events';
import { createRng } from '../rng';
import { createBaboonSystem } from './system';

const content = loadContent();
const karoo = content.biomes.find((b) => b.id === 'karoo-autumn');

function setup() {
  if (karoo === undefined) throw new Error('no Karoo');
  const events: SimEvent[] = [];
  let penalty = 0;
  const sys = createBaboonSystem(
    karoo,
    content,
    { near: 1, mid: 0.42, far: 0.15, ver: 0.07 },
    createRng(5).stream('baboons'),
    {
      tick: () => 10,
      emit: (e) => {
        events.push(e);
      },
      awardBonus: () => 0,
      basePoints: () => 10,
      penalty: (p) => {
        penalty += p;
      },
      threatenNear: () => [],
      ranged: false,
    },
  );
  if (sys === null) throw new Error('no troop');
  const mother = sys.view().troops[0]?.members.find((m) => m.role === 'mother');
  if (mother === undefined) throw new Error('no mother');
  return { sys, events, mother, penalty: () => penalty };
}

describe('a mother costs points only from two pellets of one shot (D-062)', () => {
  const P = content.birds.baboons.hit;

  it('one stray pellet of an 8-pellet shot: no penalty, the troop still runs', () => {
    const s = setup();
    s.sys.shot(1, [s.mother.id], false, () => 1, 8);
    expect(s.penalty()).toBe(0);
    expect(s.events.some((e) => e.type === 'troopFled')).toBe(true);
  });

  it('two pellets of one shot cost the penalty', () => {
    const s = setup();
    s.sys.shot(1, [s.mother.id], false, () => P.motherPellets, 8);
    expect(s.penalty()).toBe(-P.penalty);
  });

  it("a one-pellet gun's hit costs the penalty", () => {
    const s = setup();
    s.sys.shot(1, [s.mother.id], false, () => 1, 1);
    expect(s.penalty()).toBe(-P.penalty);
  });
});
