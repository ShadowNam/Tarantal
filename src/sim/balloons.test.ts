// v1.7d (D-059): hot-air balloons over Namibië — the calm early-light days always bring them; they
// drift slowly with the wind, high over the birds' lanes; a hit costs the penalty (with its
// cooldown), the balloon is never brought down.
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  base,
  biomeOf,
  ofType,
  quiet,
  run,
  settle,
  type Content,
} from '../../tools/simHarness';
import type { SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { BirdView, ModeConfig } from './types';

const day = (layout: string): ModeConfig => ({ id: 'classic', biome: 'namibie', layout });
const sim = (c: Content, layout: string, seed = 7): Sim =>
  createSim({ seed, content: c, mode: day(layout), inputKind: 'pointer' });
/** A quiet Namibië that keeps only its balloon events. */
function calm(): Content {
  const c = quiet('namibie');
  const orig = biomeOf(base as Content, 'namibie').events.filter((e) => e.id === 'balloons');
  biomeOf(c, 'namibie').events = structuredClone(orig);
  return c;
}

const balloons = (s: Sim): BirdView[] =>
  s.snapshot().birds.filter((b) => b.creature === 'lugballon');

/** Runs until a balloon is up (or the hunt ends); returns the events seen. */
function untilBalloon(s: Sim): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < 90 * 60 && balloons(s).length === 0 && !s.isOver(); i++)
    ev.push(...run(s, 1));
  return ev;
}

describe('hot-air balloons (v1.7d, D-059)', () => {
  it('the calm early-light days bring 1–3 balloons, high above the birds’ lanes', () => {
    const c = calm();
    const T = c.birds.creatures.find((x) => x.id === 'lugballon');
    if (T?.kind !== 'nonTarget' || T.drift === undefined) throw new Error('no balloon');
    for (const layout of ['mon', 'sun']) {
      const s = sim(c, layout);
      const ev = untilBalloon(s);
      expect(ofType(ev, 'worldEvent').some((e) => e.event === 'balloons')).toBe(true);
      const up = balloons(s);
      expect(up.length).toBeGreaterThanOrEqual(1);
      expect(up.length).toBeLessThanOrEqual(T.drift.group[1]);
      for (const b of up) {
        expect(b.plane).toBe('far');
        expect(b.y).toBeLessThanOrEqual(T.drift.skyY[1] + T.drift.bobPx);
        // The basket's bottom stays above the far birds' sky lane's middle.
        const lane = c.biomes.find((x) => x.id === 'namibie')?.lanes.far?.skyY ?? [0, 0];
        expect(b.y + (T.hitbox.head?.oy ?? 0) * 0.15).toBeLessThan((lane[0] + lane[1]) / 2);
      }
    }
  });

  it('drifts slowly the same way, as one group', () => {
    const c = calm();
    const s = sim(c, 'mon', 3);
    untilBalloon(s);
    const a = balloons(s);
    run(s, 120);
    const b = balloons(s);
    const dirs = new Set(a.map((x) => Math.sign((b.find((y) => y.id === x.id)?.x ?? x.x) - x.x)));
    expect(dirs.size).toBe(1);
    for (const x of a) {
      const moved = Math.abs((b.find((y) => y.id === x.id)?.x ?? x.x) - x.x);
      expect(moved).toBeGreaterThan(5);
      // Far slower than a fly-over (2 s at well under 60 px/s).
      expect(moved).toBeLessThan(120);
    }
  });

  it('a hit costs the penalty with its cooldown; the balloon drifts on', () => {
    const c = calm();
    const s = sim(c, 'mon', 5);
    untilBalloon(s);
    const sf = c.scoring.planes.far.scrollFactor;
    // Follow it until it is well inside the pan, then shoot its envelope.
    for (let i = 0; i < 1200; i++) {
      const bl = balloons(s)[0];
      if (bl === undefined) throw new Error('balloon gone');
      if (bl.x > 900 && bl.x < 2000) break;
      run(s, 1);
    }
    const bl = balloons(s)[0];
    if (bl === undefined) throw new Error('balloon gone');
    // Camera on it first (aimAt also fires).
    run(s, 1, aimAt(sf, bl.x, bl.y).slice(0, 1));
    settle(s);
    const before = s.snapshot().score;
    const now = balloons(s).find((x) => x.id === bl.id) ?? bl;
    const ev = run(s, 1, aimAt(sf, now.x, now.y));
    const hits = ofType(ev, 'balloonHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.points).toBe(-25);
    expect(s.snapshot().score).toBe(before - 25);
    expect(ofType(ev, 'birdDespawned').filter((e) => e.birdId === bl.id)).toHaveLength(0);
    // Inside the cooldown: free. The balloon is still up.
    const again = balloons(s).find((x) => x.id === bl.id);
    if (again === undefined) throw new Error('balloon came down');
    const ev2 = run(s, 1, aimAt(sf, again.x, again.y));
    for (const h of ofType(ev2, 'balloonHit')) expect(h.points).toBe(0);
    run(s, 60);
    expect(balloons(s).some((x) => x.id === bl.id)).toBe(true);
  });
});
