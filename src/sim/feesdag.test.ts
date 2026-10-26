// D-048: Halloween's Spookjag twist through the whole shot pipeline — a bat is +15, an owl −10
// (protected), every lantern out pays +25 once; the same seed and log give the same events; the
// 'feesdag' stream leaves every other system alone; a special needs the Daily and a known id.
import { describe, expect, it } from 'vitest';
import { aimAt, base, ofType, quiet, run, settle, type Content } from '../../tools/simHarness';
import { hashEvents, type SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { ModeConfig, SpookThingView } from './types';

const HALLOWEEN: ModeConfig = {
  id: 'daily',
  biome: 'karoo-autumn',
  layout: 'sat',
  feesdag: 'halloween',
};

/** The Daily's wind (omen) drifts far shots; the scoring tests aim without it. */
const CALM: ModeConfig = { ...HALLOWEEN, omen: false };

function sim(c: Content, mode: ModeConfig = CALM, seed = 11): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const twist = (c: Content) => {
  const f = c.feesdae.specials.find((s) => s.id === 'halloween');
  if (f === undefined) throw new Error('no halloween in feesdae.json');
  return f.twist;
};

const things = (s: Sim): readonly SpookThingView[] => s.snapshot().feesdag?.things ?? [];

function reloaded(s: Sim): void {
  if (s.snapshot().weapon.shells > 0) return;
  run(s, 1, [{ t: 'reload' }]);
  for (let i = 0; i < 600 && s.snapshot().weapon.reloading; i++) run(s, 1);
}

/** Steps until a thing of `kind` is in the middle of its plane (well inside the core width). */
function waitFor(s: Sim, c: Content, kind: SpookThingView['kind']): SpookThingView {
  for (let t = 0; t < 60 * 120; t++) {
    const hit = things(s).find((x) => {
      if (x.kind !== kind) return false;
      const sf = c.scoring.planes[x.plane].scrollFactor;
      return x.x > 400 && x.x < 1920 + 3200 * sf - 400;
    });
    if (hit !== undefined) return hit;
    run(s, 1);
  }
  throw new Error(`no ${kind} came`);
}

function shoot(s: Sim, c: Content, t: SpookThingView): SimEvent[] {
  return run(s, 1, aimAt(c.scoring.planes[t.plane].scrollFactor, t.x, t.y));
}

describe('Spookjag (Halloween, D-048)', () => {
  it('lights 3–5 lanterns on spots of the day and draws flyers from the feesdag stream', () => {
    const c = quiet();
    const s = sim(c);
    const v = s.snapshot().feesdag;
    expect(v?.id).toBe('halloween');
    const [lo, hi] = twist(c).lanterns.count;
    expect(v?.lanternsTotal).toBeGreaterThanOrEqual(lo);
    expect(v?.lanternsTotal).toBeLessThanOrEqual(hi);
    expect(v?.lanternsLit).toBe(v?.lanternsTotal);
    const ev = run(s, 60 * 90);
    const flew = ofType(ev, 'spookFlew');
    expect(flew.filter((e) => e.thing === 'bat').length).toBeGreaterThanOrEqual(
      twist(c).bats.perHunt[0],
    );
    expect(flew.filter((e) => e.thing === 'owl').length).toBeGreaterThanOrEqual(
      twist(c).owls.perHunt[0],
    );
  });

  it('a bat is +15 (flat) and leaves the sky', () => {
    const c = quiet();
    const s = sim(c);
    const bat = waitFor(s, c, 'bat');
    const before = s.snapshot().score;
    const ev = shoot(s, c, bat);
    const hit = ofType(ev, 'spookHit');
    expect(hit.map((h) => [h.thing, h.points])).toEqual([['bat', twist(c).bats.points]]);
    expect(twist(c).bats.points).toBe(15);
    expect(s.snapshot().score - before).toBe(15);
    expect(things(s).some((t) => t.id === bat.id)).toBe(false);
  });

  it('an owl is protected: −10 and a penalty in the tally', () => {
    const c = quiet();
    const s = sim(c);
    const owl = waitFor(s, c, 'owl');
    const before = s.snapshot().score;
    const ev = shoot(s, c, owl);
    expect(ofType(ev, 'spookHit').map((h) => [h.thing, h.points])).toEqual([['owl', -10]]);
    expect(s.snapshot().score - before).toBe(-10);
    expect(s.result().penalties).toBe(1);
    expect(s.result().feesdag?.owls).toBe(1);
  });

  it('every lantern out pays +25 once; a dark lantern takes no more shots', () => {
    const c = quiet();
    const s = sim(c);
    let paid = 0;
    let bonus = 0;
    for (let i = 0; i < 10; i++) {
      const lit = things(s).find((t) => t.kind === 'lantern' && !t.dark);
      if (lit === undefined) break;
      reloaded(s);
      settle(s);
      const ev = shoot(s, c, lit);
      const h = ofType(ev, 'spookHit');
      expect(h.map((x) => [x.thing, x.points])).toEqual([['lantern', 0]]);
      for (const o of ofType(ev, 'lanternsOut')) {
        paid++;
        bonus = o.points;
      }
      expect(things(s).find((t) => t.id === lit.id)?.dark).toBe(true);
    }
    expect(paid).toBe(1);
    expect(bonus).toBe(25);
    expect(s.snapshot().feesdag?.lanternsLit).toBe(0);
    // Shooting a dark lantern again does nothing (it has no hit shape any more).
    const dark = things(s).find((t) => t.kind === 'lantern');
    if (dark === undefined) throw new Error('no lantern');
    reloaded(s);
    settle(s);
    const again = shoot(s, c, dark);
    expect(ofType(again, 'spookHit')).toEqual([]);
    expect(ofType(again, 'lanternsOut')).toEqual([]);
    const r = s.result().feesdag;
    expect(r?.lanterns).toBe(r?.lanternsTotal);
  });

  it('is deterministic: the same seed and log twice give the same event hash', () => {
    const play = (): string => {
      const s = sim(structuredClone(base) as Content, HALLOWEEN, 2026);
      const ev: SimEvent[] = [];
      for (let t = 0; t < 60 * 90 && !s.isOver(); t++) {
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
    expect(play()).toBe(play());
  });

  it("leaves every other system's draws alone (the plain Daily's birds are the same)", () => {
    const birdsOf = (mode: ModeConfig): string => {
      const s = sim(structuredClone(base) as Content, mode, 5);
      const ev = run(s, 60 * 30);
      return hashEvents(ev.filter((e) => e.type === 'birdSpawned' || e.type === 'flockSpawned'));
    };
    const plain: ModeConfig = { id: 'daily', biome: 'karoo-autumn', layout: 'sat' };
    expect(birdsOf(HALLOWEEN)).toBe(birdsOf(plain));
  });

  it('needs the Daily and a known special', () => {
    const c = quiet();
    expect(() => sim(c, { ...HALLOWEEN, id: 'classic' })).toThrow(/mode daily/);
    expect(() => sim(c, { ...HALLOWEEN, feesdag: 'kersfees' })).toThrow(/feesdae/);
  });
});
