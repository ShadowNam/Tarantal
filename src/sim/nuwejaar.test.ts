// D-065: New Year's twist (nuwejaar), the countdown, through the whole shot pipeline — in the
// hunt's last countdown.lastSeconds every award (bags and event bonuses, never a penalty) is
// × countdown.mult, after the Stampede's ×2 (they stack: ×4); one tick earlier nothing is
// doubled; bonus time moves the countdown with the end; the same seed and log give the same
// events; no system's draws move (the plain Daily's hunt is the same apart from the awards).
import { describe, expect, it } from 'vitest';
import { base, ofType, run, shootBird, type Content } from '../../tools/simHarness';
import { secondsToTicks } from './clock';
import { hashEvents, type SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { ModeConfig } from './types';

const NEW_YEAR: ModeConfig = {
  id: 'daily',
  biome: 'karoo-autumn',
  layout: 'fri',
  feesdag: 'newyear',
  omen: false,
};
const PLAIN: ModeConfig = { id: 'daily', biome: 'karoo-autumn', layout: 'fri', omen: false };

/** The real content, a 24 s Daily (the countdown is its last 10 s), no pellet spread. */
function short(): Content {
  const c = structuredClone(base) as Content;
  c.modes.modes.daily.huntSeconds = 24;
  for (const w of c.weapons.weapons) w.spreadPx = 0;
  return c;
}

function sim(c: Content, mode: ModeConfig = NEW_YEAR, seed = 11): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const twist = (c: Content) => {
  const f = c.feesdae.specials.find((s) => s.id === 'newyear');
  if (f?.twist.rule !== 'nuwejaar') throw new Error('no newyear in feesdae.json');
  return f.twist;
};

/** A scripted shooter: every 14 ticks at the bird nearest the view's centre (reloads when dry). */
function play(s: Sim, c: Content): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < 60 * 40 && !s.isOver(); i++) {
    const snap = s.snapshot();
    if (snap.weapon.shells === 0 && !snap.weapon.reloading) {
      ev.push(...run(s, 1, [{ t: 'reload' }]));
      continue;
    }
    const bird = snap.birds.find((b) => b.hittable && b.creature.startsWith('tarentaal'));
    if (i % 14 === 0 && bird !== undefined && !snap.weapon.reloading)
      ev.push(...shootBird(s, c, bird));
    else ev.push(...run(s, 1));
  }
  return ev;
}

/** Steps to tick `t` (the next step runs at it), then shoots guineafowl until one bags at it. */
function bagAt(c: Content, t: number): Extract<SimEvent, { type: 'scoreAwarded' }> | null {
  for (let seed = 1; seed <= 40; seed++) {
    const s = sim(c, NEW_YEAR, seed);
    run(s, t);
    const snap = s.snapshot();
    for (const bird of snap.birds.filter((b) => b.hittable && b.creature.startsWith('tarentaal'))) {
      if (s.snapshot().tick !== t) break;
      const got = ofType(shootBird(s, c, bird), 'scoreAwarded');
      if (got.length > 0) return got[0] ?? null;
    }
  }
  return null;
}

describe('New Year countdown (D-065)', () => {
  it('puts nothing up to shoot; the countdown starts at the last 10 s (countdownStarted)', () => {
    const c = short();
    const s = sim(c);
    const v = s.snapshot().feesdag;
    expect(v?.id).toBe('newyear');
    expect(v?.things).toEqual([]);
    const at = s.snapshot().durationTicks - secondsToTicks(twist(c).countdown.lastSeconds);
    expect(v?.countdown).toEqual({ atTick: at, active: false, mult: 2 });
    const ev = run(s, at + 5);
    const st = ofType(ev, 'countdownStarted');
    expect(st.map((e) => [e.tick, e.mult, e.endTick])).toEqual([
      [at, 2, s.snapshot().durationTicks],
    ]);
    expect(s.snapshot().feesdag?.countdown?.active).toBe(true);
    expect(ofType(ev, 'feesdagStarted').map((e) => e.feesdag)).toEqual(['newyear']);
    expect(ofType(ev, 'spookFlew')).toEqual([]);
  });

  it('a bag at the countdown’s first tick is ×2, stacked on the Stampede (×4); one tick earlier is not', () => {
    const c = short();
    const at = sim(c).snapshot().feesdag?.countdown?.atTick ?? 0;
    const inside = bagAt(c, at);
    const before = bagAt(c, at - 1);
    expect(inside?.tick).toBe(at);
    expect(before?.tick).toBe(at - 1);
    const kinds = (e: typeof inside) => e?.breakdown.map((b) => b.kind) ?? [];
    // The Stampede (last 15 s) runs for both; only the inside one has the countdown step, last
    // of the system multipliers.
    expect(kinds(before)).toContain('stampede');
    expect(kinds(before)).not.toContain('countdown');
    expect(kinds(inside)).toContain('stampede');
    const k = kinds(inside);
    expect(k.indexOf('countdown')).toBe(k.indexOf('stampede') + 1);
    const step = inside?.breakdown.find((b) => b.kind === 'countdown');
    expect(step?.value).toBe(2);
    expect(inside?.award).toBe(Math.round((inside?.points ?? 0) * (inside?.mult ?? 0)));
  });

  it('every award in the countdown is ×2 against the plain Daily on the same seed and log, none before', () => {
    const c = short();
    const ny = sim(c, NEW_YEAR, 7);
    const at = ny.snapshot().feesdag?.countdown?.atTick ?? 0;
    const a = play(ny, c);
    const b = play(sim(c, PLAIN, 7), c);
    const bagsA = ofType(a, 'scoreAwarded');
    const bagsB = ofType(b, 'scoreAwarded');
    expect(bagsA.map((e) => [e.tick, e.birdId])).toEqual(bagsB.map((e) => [e.tick, e.birdId]));
    expect(bagsA.some((e) => e.tick >= at)).toBe(true);
    expect(bagsA.some((e) => e.tick < at)).toBe(true);
    bagsA.forEach((e, i) => {
      const p = bagsB[i];
      expect(e.mult).toBeCloseTo((p?.mult ?? 0) * (e.tick >= at ? 2 : 1), 9);
    });
    const bonA = ofType(a, 'bonusAwarded');
    const bonB = ofType(b, 'bonusAwarded');
    expect(bonA.map((e) => e.bonus)).toEqual(bonB.map((e) => e.bonus));
    bonA.forEach((e, i) => {
      const p = bonB[i];
      if (e.tick < at) expect(e.award).toBe(p?.award);
      else expect(Math.abs(e.award - 2 * (p?.award ?? 0))).toBeLessThanOrEqual(1);
    });
    // Penalties are never doubled.
    expect(ofType(a, 'penaltyApplied').map((e) => e.points)).toEqual(
      ofType(b, 'penaltyApplied').map((e) => e.points),
    );
    // And the birds came the same: no draws moved.
    const spawns = (ev: SimEvent[]) =>
      hashEvents(ev.filter((e) => e.type === 'birdSpawned' || e.type === 'flockSpawned'));
    expect(spawns(a)).toBe(spawns(b));
  });

  it('is deterministic: the same seed and log twice give the same event hash', () => {
    const once = (): string => {
      const s = sim(structuredClone(base) as Content, { ...NEW_YEAR, omen: true }, 2027);
      const ev: SimEvent[] = [];
      for (let t = 0; t < 60 * 95 && !s.isOver(); t++) {
        const cmds =
          t % 45 === 0
            ? [
                { t: 'cameraTarget' as const, cx: 960 + ((t * 37) % 3200) },
                { t: 'fire' as const, dx: ((t * 13) % 800) - 400, sy: 200 + ((t * 7) % 500) },
              ]
            : t % 45 === 30
              ? [{ t: 'reload' as const }]
              : [];
        s.step(cmds);
        ev.push(...s.drainEvents());
      }
      return hashEvents(ev);
    };
    expect(once()).toBe(once());
  });

  it('other days have no countdown (Halloween, Christmas, the plain Daily)', () => {
    const c = short();
    for (const feesdag of ['halloween', 'christmas', undefined]) {
      const s = sim(c, { ...PLAIN, ...(feesdag === undefined ? {} : { feesdag }) });
      expect(s.snapshot().feesdag?.countdown).toBeUndefined();
      expect(ofType(run(s, 60 * 25), 'countdownStarted')).toEqual([]);
    }
  });
});
