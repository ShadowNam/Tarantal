// 1.9.3 (D-056, review M16): the art previews' ?makalaniPreview=juggle reaches a chain of 3 the
// way the screenshot spec shoots (Dubbelloop, one shot an arc as the nut starts to fall); it
// never pops the nut. And =pop pops any hit nut.
import { describe, expect, it } from 'vitest';
import { aimAt, biomeOf, ofType, quiet, run, type Content } from '../../tools/simHarness';
import { createSim } from '../sim/Sim';
import { withMakalaniPreview } from './devContent';

const OKA = 'okavango-spring';

function preview(mode: string): Content {
  const c = quiet(OKA);
  const mon = biomeOf(c, OKA).layouts.find((l) => l.id === 'mon');
  if (mon === undefined) throw new Error('no mon');
  mon.palms = [{ kind: 'single', plane: 'near', u: 0.5 }];
  return withMakalaniPreview(c, mode) as Content;
}

describe('makalani art-preview content (review M16)', () => {
  it('juggle: a chain of 3 with the Dubbelloop, one shot an arc, no pop', () => {
    const c = preview('juggle');
    const s = createSim({
      seed: 42,
      content: c,
      mode: { id: 'classic', biome: OKA, layout: 'mon', weapon: 'dubbelloop' },
      inputKind: 'pointer',
    });
    const sf = c.scoring.planes.near.scrollFactor;
    const nut = () => s.snapshot().nuts?.nuts[0];
    const first = nut();
    if (first === undefined) throw new Error('no nut');
    const all = [...run(s, 1, aimAt(sf, first.x, first.y))];
    let lastY = first.y;
    for (let i = 0; i < 2000 && (s.snapshot().nuts?.bestChain ?? 0) < 3; i++) {
      const n = nut();
      if (n === undefined || (n.state !== 'air' && n.state !== 'bounced')) break;
      const w = s.snapshot().weapon;
      if (w.shells === 0 && !w.reloading) all.push(...run(s, 1, [{ t: 'reload' }]));
      else if (n.y > lastY && w.cooldownTicks === 0 && !w.reloading && w.shells > 0)
        all.push(...run(s, 1, aimAt(sf, n.x, n.y)));
      else all.push(...run(s, 1));
      lastY = n.y;
    }
    expect(s.snapshot().nuts?.bestChain ?? 0).toBeGreaterThanOrEqual(3);
    expect(ofType(all, 'nutPopped').length).toBe(0);
  });

  it('pop: any hit pops the nut', () => {
    const c = preview('pop');
    const s = createSim({
      seed: 42,
      content: c,
      mode: { id: 'classic', biome: OKA, layout: 'mon', weapon: 'windbuks' },
      inputKind: 'pointer',
    });
    const n = s.snapshot().nuts?.nuts[0];
    if (n === undefined) throw new Error('no nut');
    const ev = run(s, 1, aimAt(c.scoring.planes.near.scrollFactor, n.x, n.y));
    expect(ofType(ev, 'nutPopped').length).toBe(1);
  });
});
