// v1.8b (D-062, round 4): a mother costs the penalty only when the shot was aimed at her (its aim
// point inside her hit shapes, for every gun): a stray pellet or stone that strikes her (a spread,
// the Kettie's drop, the wind) costs nothing and only sends the troop away.
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

/** The mother's body and head shapes, as the hit test gets them. */
function shapesOf(sys: ReturnType<typeof setup>['sys'], id: number) {
  const out: { x: number; y: number; rx: number; ry: number }[] = [];
  sys.extras((_layer, e) => {
    if (e.kind === 'baboon' && e.baboonId === id && e.shape.type === 'ellipse')
      out.push({ x: e.x, y: e.y, rx: e.shape.rx, ry: e.shape.ry });
  });
  const [body, head] = out;
  if (body === undefined || head === undefined) throw new Error('no shapes');
  return { body, head };
}

describe('a mother costs points only from a shot aimed at her (D-062)', () => {
  const P = content.birds.baboons.hit;

  it('a shot aimed at her body centre that strikes her costs the penalty', () => {
    const s = setup();
    const { body } = shapesOf(s.sys, s.mother.id);
    s.sys.shot(1, [s.mother.id], false, () => ({ x: body.x, y: body.y }));
    expect(s.penalty()).toBe(-P.penalty);
  });

  it('aimed at her head counts too', () => {
    const s = setup();
    const { head } = shapesOf(s.sys, s.mother.id);
    s.sys.shot(1, [s.mother.id], false, () => ({ x: head.x, y: head.y }));
    expect(s.penalty()).toBe(-P.penalty);
  });

  it('a stone aimed at a bird beside her that strikes her costs nothing; the troop still runs', () => {
    const s = setup();
    const { body } = shapesOf(s.sys, s.mother.id);
    // The bird sits just past her body's edge; the stone drifted onto her.
    const beside = { x: body.x + body.rx + 4, y: body.y };
    s.sys.shot(1, [s.mother.id], false, () => beside);
    expect(s.penalty()).toBe(0);
    const hit = s.events.find((e) => e.type === 'baboonHit');
    expect(hit?.type === 'baboonHit' && hit.points).toBe(0);
    expect(s.events.some((e) => e.type === 'troopFled')).toBe(true);
  });

  it('a stray pellet of a spread aimed at a bird below the ridge costs nothing', () => {
    const s = setup();
    const { body } = shapesOf(s.sys, s.mother.id);
    s.sys.shot(1, [s.mother.id], false, () => ({ x: body.x, y: body.y + body.ry + 40 }));
    expect(s.penalty()).toBe(0);
  });
});
