// M8: Lente · Okavango from content — water that splashes (alerts flocks even from a silent gun),
// sun-showers that muffle shots, its secrets (hippo, mokoro flag, lily frog), the fish eagle,
// kuifkop hopping out of the reeds and Kuifkop Koning (3 hits, hops). Quiet content per test.
import { describe, expect, it } from 'vitest';
import {
  biomeOf,
  quiet,
  run,
  ofType,
  aimAt,
  secretOf,
  shootPart,
  shootBird,
  settle,
  withMidFlock,
  type Content,
} from '../../tools/simHarness';
import { secondsToTicks } from './clock';
import type { SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { BirdView, ModeConfig } from './types';

const OKA = 'okavango-spring';
const classic = (weapon = 'dubbelloop', omen?: boolean): ModeConfig => ({
  id: 'classic',
  biome: OKA,
  weapon,
  ...(omen === undefined ? {} : { omen }),
});

function sim(c: Content, mode: ModeConfig = classic(), seed = 3): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const midSf = (c: Content): number => c.scoring.planes.mid.scrollFactor;

describe('Okavango twist: water splashes (GDD §11)', () => {
  it('a silent Windbuks miss in water alerts a flock near it; on dry ground it does not', () => {
    const c = withMidFlock(quiet(OKA), OKA);
    // Put the water right under the flock so the splash is in range.
    const s0 = sim(c, classic('windbuks'));
    const b = s0.snapshot().birds.find((x) => x.flockId !== null);
    if (b === undefined) throw new Error('no flock');
    const zone = biomeOf(c, OKA).twist?.splash?.zones[0];
    if (zone === undefined) throw new Error('no zone');
    zone.u = b.x / (1920 + 3200 * midSf(c));
    const wet = sim(c, classic('windbuks'));
    const evWet = run(wet, 1, aimAt(midSf(c), b.x, zone.y));
    expect(ofType(evWet, 'splash')).toHaveLength(1);
    expect(ofType(evWet, 'flockThreatened')).toMatchObject([{ source: 'splash' }]);
    // Same flock, a silent shot into the dry sky above it: nothing.
    const dry = sim(c, classic('windbuks'));
    const evDry = run(dry, 1, aimAt(midSf(c), b.x, b.y - 200));
    expect(ofType(evDry, 'splash')).toEqual([]);
    expect(ofType(evDry, 'flockThreatened')).toEqual([]);
  });

  it('a splash never threatens a flock twice in one shot (the shot already alerted it)', () => {
    const c = withMidFlock(quiet(OKA), OKA);
    const s0 = sim(c);
    const b = s0.snapshot().birds.find((x) => x.flockId !== null);
    if (b === undefined) throw new Error('no flock');
    const zone = biomeOf(c, OKA).twist?.splash?.zones[0];
    if (zone === undefined) throw new Error('no zone');
    zone.u = b.x / (1920 + 3200 * midSf(c));
    const s = sim(c);
    const ev = run(s, 1, aimAt(midSf(c), b.x, zone.y));
    expect(ofType(ev, 'splash')).toHaveLength(1);
    expect(ofType(ev, 'flockThreatened')).toHaveLength(1);
    expect(s.snapshot().flocks[0]?.state).toBe('alert');
  });
});

describe('Okavango omen: sun-showers', () => {
  it('rain comes and goes only with the omen, and muffles a shot while it falls', () => {
    const c = withMidFlock(quiet(OKA), OKA);
    expect(sim(c).snapshot().rain).toBe(false);
    const s = sim(c, classic('dubbelloop', true));
    const changes: SimEvent[] = [];
    let rainingAt = -1;
    for (let i = 0; i < secondsToTicks(40) && rainingAt < 0; i++) {
      changes.push(...run(s, 1));
      if (s.snapshot().rain) rainingAt = s.snapshot().tick;
    }
    expect(rainingAt).toBeGreaterThan(0);
    changes.push(...run(s, 1));
    expect(ofType(changes, 'weatherChanged')).toMatchObject([{ rain: true }]);
    // A miss 200 px from the flock (inside 260, outside 260 × 0.6) alerts it only when dry.
    const missAt = (st: Sim): number => {
      // ~206 px beyond the right-most member: inside 260, outside 260 × 0.6 = 156.
      const members = st.snapshot().birds.filter((x) => x.flockId !== null);
      const b = members.reduce((m, x) => (x.x > m.x ? x : m));
      return ofType(run(st, 1, aimAt(midSf(c), b.x + 180, b.y - 100)), 'flockThreatened').length;
    };
    expect(missAt(s)).toBe(0);
    expect(missAt(sim(c))).toBe(1);
  });
});

describe('Okavango secrets (GDD §11.1)', () => {
  it('hippo: shoot the water beside it → +50, the wave flushes flocks on the bank', () => {
    const c = quiet(OKA);
    const s = sim(c);
    const ev = shootPart(s, c, 'hippo', 'water');
    expect(ofType(ev, 'secretTriggered')).toMatchObject([{ propId: 'hippo' }]);
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 50 }]);
  });

  it('mokoro flag: +5 s once', () => {
    const c = quiet(OKA);
    const s = sim(c);
    const before = s.snapshot().durationTicks;
    shootPart(s, c, 'mokoro_pole', 'flag');
    expect(s.snapshot().durationTicks).toBe(before + secondsToTicks(5));
    expect(secretOf(s, 'mokoro_pole').done).toBe(true);
  });

  it("lily frog: shoot the frog's lily → +25", () => {
    const c = quiet(OKA);
    const s = sim(c);
    const ev = shootPart(s, c, 'lily_frog', 'lily');
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 25 }]);
  });
});

describe('fish eagle (GDD §7): a protected fly-over, −50', () => {
  it('flies over the Okavango and costs 50 when shot', () => {
    const c = quiet(OKA);
    biomeOf(c, OKA).events = [
      { id: 'fishEagle', creature: 'visarend', perHunt: [1, 1], window: [0.01, 0.01] },
    ];
    const s = sim(c);
    let eagle: BirdView | undefined;
    for (let i = 0; i < 1200 && eagle === undefined; i++) {
      run(s, 1);
      eagle = s
        .snapshot()
        .birds.find((b) => b.creature === 'visarend' && Math.abs(b.x - 1900) < 600);
    }
    if (eagle === undefined) throw new Error('no eagle in reach');
    const ev = shootBird(s, c, eagle);
    expect(ofType(ev, 'penaltyApplied')).toMatchObject([{ creature: 'visarend', points: -50 }]);
  });
});

/** Steps until the creature is in the given phase; returns it. */
function waitPhase(s: Sim, creature: string, phase: string, max = 600): BirdView {
  for (let i = 0; i < max; i++) {
    run(s, 1);
    const b = s.snapshot().birds.find((x) => x.creature === creature);
    if (b?.phase === phase) return b;
  }
  throw new Error(`${creature} never reached ${phase}`);
}

describe('kuifkop (GDD §7 tricky target): hops out of the reeds', () => {
  const hopEvent = {
    id: 'kuifkopHop' as const,
    creature: 'kuifkop',
    perHunt: [1, 1] as [number, number],
    window: [0.01, 0.01] as [number, number],
    perchProps: ['reeds_a', 'reeds_b', 'reeds_c', 'reeds_d'],
    stayMs: [20000, 20000] as [number, number],
    peekMs: [1000, 1000] as [number, number],
    hideMs: [800, 800] as [number, number],
    hopMs: [600, 600] as [number, number],
    hopPx: 90,
  };

  it('hidden in the reeds it cannot be hit; it peeks, then hops in plain view to another reed', () => {
    const c = quiet(OKA);
    biomeOf(c, OKA).events = [hopEvent];
    const s = sim(c);
    const hidden = waitPhase(s, 'kuifkop', 'hidden');
    expect(hidden.hittable).toBe(false);
    const peek = waitPhase(s, 'kuifkop', 'peek');
    expect(peek.hittable).toBe(true);
    const hop = waitPhase(s, 'kuifkop', 'hop');
    expect(hop.hittable).toBe(true);
    // Mid-hop it is above the line between the reeds (an arc).
    run(s, 15);
    const mid = s.snapshot().birds.find((b) => b.creature === 'kuifkop');
    expect(mid?.y ?? 0).toBeLessThan(peek.y - 20);
    const landed = waitPhase(s, 'kuifkop', 'hidden');
    expect(landed.x).not.toBe(peek.x);
  });

  it('a peeking kuifkop bagged scores its base 40 (ground); one shot mid-hop scores as a runner', () => {
    const c = quiet(OKA);
    biomeOf(c, OKA).events = [hopEvent];
    const s = sim(c);
    const peek = waitPhase(s, 'kuifkop', 'peek');
    const ev = shootBird(s, c, peek);
    expect(ofType(ev, 'targetBagged')).toMatchObject([
      { creature: 'kuifkop', behaviour: 'forage' },
    ]);
    expect(ofType(ev, 'scoreAwarded')[0]?.points).toBe(40);
    const s2 = sim(c);
    const hop = waitPhase(s2, 'kuifkop', 'hop');
    const ev2 = shootBird(s2, c, hop);
    expect(ofType(ev2, 'targetBagged')).toMatchObject([{ behaviour: 'run' }]);
  });
});

describe('Kuifkop Koning (GDD §7 Spring boss): three hits, hops between the reeds', () => {
  it('takes three hits; each hit sends him into the reeds', () => {
    const c = quiet(OKA);
    const boss = biomeOf(c, OKA);
    boss.events = [
      {
        id: 'bossAppearance',
        creature: 'kuifkop_koning',
        modes: ['classic', 'daily'],
        perHunt: [1, 1],
        window: [0.01, 0.01],
        perchProps: ['reeds_a', 'reeds_b', 'reeds_c', 'reeds_d'],
        stayMs: [40000, 40000],
        roamPx: 60,
        peekMs: [1200, 1200],
        hideMs: [800, 800],
        hopMs: [600, 600],
        hopPx: 110,
      },
    ];
    const s = sim(c);
    const all: SimEvent[] = [];
    for (let hit = 0; hit < 3; hit++) {
      const k = waitPhase(s, 'kuifkop_koning', 'peek', 900);
      all.push(...shootBird(s, c, k), ...settle(s));
      if (hit < 2) {
        expect(s.snapshot().birds.find((b) => b.creature === 'kuifkop_koning')?.phase).toBe(
          'hidden',
        );
      }
    }
    expect(ofType(all, 'targetHit').map((e) => e.hitsLeft)).toEqual([2, 1]);
    expect(ofType(all, 'targetBagged')).toMatchObject([{ creature: 'kuifkop_koning' }]);
  });
});
