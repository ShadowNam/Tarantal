// D-064: Christmas in the sun's twist (kersfees) through the whole shot pipeline — 3–5 presents
// hidden at the day's props from the 'feesdag' stream; each opens once when shot (it stays open
// and takes no more pellets); "Presents found!" pays +25 once, and only when every present is
// open; the same seed and log give the same events; no other system's draws move.
import { describe, expect, it } from 'vitest';
import { aimAt, base, ofType, quiet, run, settle, type Content } from '../../tools/simHarness';
import { hashEvents, type SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { ModeConfig, SpookThingView } from './types';
import { coreWidth } from './world';

const CHRISTMAS: ModeConfig = {
  id: 'daily',
  biome: 'karoo-autumn',
  layout: 'fri',
  feesdag: 'christmas',
};
/** The Daily's wind (omen) drifts far shots; the scoring tests aim without it. */
const CALM: ModeConfig = { ...CHRISTMAS, omen: false };

function sim(c: Content, mode: ModeConfig = CALM, seed = 11): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const twist = (c: Content) => {
  const f = c.feesdae.specials.find((s) => s.id === 'christmas');
  if (f?.twist.rule !== 'kersfees') throw new Error('no christmas in feesdae.json');
  return f.twist;
};

const presents = (s: Sim): readonly SpookThingView[] =>
  (s.snapshot().feesdag?.things ?? []).filter((t) => t.kind === 'present');

function reloaded(s: Sim): void {
  if (s.snapshot().weapon.shells > 0) return;
  run(s, 1, [{ t: 'reload' }]);
  for (let i = 0; i < 600 && s.snapshot().weapon.reloading; i++) run(s, 1);
}

function shoot(s: Sim, c: Content, t: SpookThingView): SimEvent[] {
  return run(s, 1, aimAt(c.scoring.planes[t.plane].scrollFactor, t.x, t.y));
}

/** Shoots every shut present (a few tries each: a bird may walk in front). */
function openAll(s: Sim, c: Content): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < 40; i++) {
    const shut = presents(s).find((t) => !t.dark);
    if (shut === undefined) break;
    reloaded(s);
    settle(s);
    all.push(...shoot(s, c, shut));
  }
  return all;
}

describe('Christmas in the sun (D-064)', () => {
  it('hides 3–5 presents at props of the day, none of them flyers', () => {
    const c = quiet();
    for (const seed of [1, 2, 3, 11, 42]) {
      const s = sim(c, CALM, seed);
      const v = s.snapshot().feesdag;
      expect(v?.id).toBe('christmas');
      const [lo, hi] = twist(c).presents.count;
      expect(v?.presentsTotal).toBeGreaterThanOrEqual(lo);
      expect(v?.presentsTotal).toBeLessThanOrEqual(hi);
      expect(v?.presentsClosed).toBe(v?.presentsTotal);
      expect(v?.lanternsTotal).toBe(0);
      expect(presents(s).length).toBe(v?.presentsTotal);
      // Every present stands at a spot of a prop this map has (x within the mid layer's width).
      const sf = c.scoring.planes.mid.scrollFactor;
      for (const p of presents(s)) {
        expect(p.plane).toBe('mid');
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(coreWidth(sf));
      }
      // No flyers come on Christmas.
      expect(ofType(run(s, 60 * 40), 'spookFlew')).toEqual([]);
    }
  });

  it('the hunt starts with feesdagStarted carrying the presents (Halloween’s event unchanged)', () => {
    const s = sim(quiet());
    const ev = s.drainEvents();
    const st = ofType(ev, 'feesdagStarted');
    expect(st.map((e) => [e.feesdag, e.lanterns, e.presents])).toEqual([
      ['christmas', 0, s.snapshot().feesdag?.presentsTotal],
    ]);
  });

  it('each present opens once and stays open; "Presents found!" pays +25 once, at the last', () => {
    const c = quiet();
    const s = sim(c);
    const total = s.snapshot().feesdag?.presentsTotal ?? 0;
    let opened = 0;
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const shut = presents(s).find((t) => !t.dark);
      if (shut === undefined) break;
      reloaded(s);
      settle(s);
      const ev = shoot(s, c, shut);
      const o = ofType(ev, 'presentOpened');
      if (o.length === 0) continue;
      expect(o.map((e) => e.id)).toEqual([shut.id]);
      opened++;
      expect(o[0]?.presentsLeft).toBe(total - opened);
      expect(presents(s).find((t) => t.id === shut.id)?.dark).toBe(true);
      const f = ofType(ev, 'presentsFound');
      if (opened < total) expect(f).toEqual([]);
      else {
        expect(f.map((e) => e.points)).toEqual([25]);
        expect(ofType(ev, 'bonusAwarded').map((b) => [b.bonus, b.base])).toEqual([
          ['presentsFound', 25],
        ]);
      }
      found += f.length;
    }
    expect(opened).toBe(total);
    expect(found).toBe(1);
    expect(s.snapshot().feesdag?.presentsClosed).toBe(0);
    expect(s.result().feesdag?.presents).toBe(total);
    // An open present takes no more pellets and pays nothing more.
    const open = presents(s)[0];
    if (open === undefined) throw new Error('no present');
    reloaded(s);
    settle(s);
    const again = shoot(s, c, open);
    expect(ofType(again, 'presentOpened')).toEqual([]);
    expect(ofType(again, 'presentsFound')).toEqual([]);
  });

  it('opening only some of them never pays', () => {
    const c = quiet();
    const s = sim(c);
    const first = presents(s)[0];
    if (first === undefined) throw new Error('no present');
    for (let i = 0; i < 6 && first !== undefined; i++) {
      reloaded(s);
      settle(s);
      shoot(s, c, first);
    }
    expect(presents(s).find((t) => t.id === first.id)?.dark).toBe(true);
    expect(s.snapshot().feesdag?.presentsClosed).toBe(
      (s.snapshot().feesdag?.presentsTotal ?? 0) - 1,
    );
    const rest = run(s, 60);
    expect(ofType(rest, 'presentsFound')).toEqual([]);
  });

  it('a present is an event bonus target: the Frenzy multiplies Presents found! (GDD §5.3)', () => {
    const c = quiet();
    for (const tier of c.scoring.frenzyTiers) tier.atStreak = 0;
    const s = sim(c);
    const ev = openAll(s, c);
    const b = ofType(ev, 'bonusAwarded').find((x) => x.bonus === 'presentsFound');
    const top = Math.max(...c.scoring.frenzyTiers.map((t) => t.mul));
    expect(b?.award).toBe(Math.round(25 * top));
    expect(ofType(ev, 'presentsFound')[0]?.points).toBe(b?.award);
  });

  it('is deterministic: the same seed and log twice give the same event hash', () => {
    const play = (): string => {
      const s = sim(structuredClone(base) as Content, CHRISTMAS, 2026);
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
    const plain: ModeConfig = { id: 'daily', biome: 'karoo-autumn', layout: 'fri' };
    expect(birdsOf(CHRISTMAS)).toBe(birdsOf(plain));
  });

  it('every Daily biome holds the most presents the count asks for, on every weekday', () => {
    const c = quiet();
    const [, hi] = twist(c).presents.count;
    for (const biome of ['karoo-autumn', 'bushveld-winter', 'okavango-spring', 'kalahari-summer'])
      for (const layout of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
        let most = 0;
        for (let seed = 1; seed <= 12; seed++) {
          const s = sim(c, { ...CALM, biome, layout }, seed);
          most = Math.max(most, s.snapshot().feesdag?.presentsTotal ?? 0);
        }
        expect(most, `${biome} ${layout}`).toBe(hi);
      }
  });
});
