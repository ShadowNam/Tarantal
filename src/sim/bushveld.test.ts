// M8: Winter · Bushveld from content — the twist (flocks that run instead of flying), its secrets
// (baobab pod, the dassie near-miss, the three-hit boulder), the low-sun glare omen and Ou Grys
// peeking from cover. Each test starts from a quiet copy of the content and turns on only what it
// checks (tools/simHarness.ts).
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
import type { BirdView, FlockState, ModeConfig } from './types';

const BUSH = 'bushveld-winter';
const classic: ModeConfig = { id: 'classic', biome: BUSH };

function sim(c: Content, mode: ModeConfig = classic, seed = 3): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

/** Shoots the sky just above a flock member three times, each inside the escalation window. */
function spookThrice(s: Sim, c: Content): { states: FlockState[]; events: SimEvent[] } {
  const states: FlockState[] = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < 3; i++) {
    const b = s.snapshot().birds.find((x) => x.flockId !== null);
    if (b === undefined) break;
    const sf = c.scoring.planes[b.plane].scrollFactor;
    events.push(...run(s, 1, aimAt(sf, b.x, b.y - 140)), ...settle(s));
    states.push(s.snapshot().flocks[0]?.state ?? 'forage');
  }
  return { states, events };
}

describe('Bushveld twist: flocks run instead of taking wing (GDD §11, D-025)', () => {
  it('with flushAsRunChance 1 a third threat keeps the flock running; with 0 it flushes', () => {
    const runs = withMidFlock(quiet(BUSH), BUSH);
    const twist = biomeOf(runs, BUSH).twist;
    if (twist === undefined) throw new Error('bushveld twist');
    twist.flushAsRunChance = 1;
    const a = spookThrice(sim(runs), runs);
    expect(a.states).toEqual(['alert', 'run', 'run']);
    expect(ofType(a.events, 'flockStateChanged').some((e) => e.to === 'flush')).toBe(false);

    const flies = withMidFlock(quiet(BUSH), BUSH);
    const t2 = biomeOf(flies, BUSH).twist;
    if (t2 === undefined) throw new Error('bushveld twist');
    t2.flushAsRunChance = 0;
    expect(spookThrice(sim(flies), flies).states).toEqual(['alert', 'run', 'flush']);
  });

  it('a running-only flock still takes wing from the Vuvuzela (world flushes win)', () => {
    const c = withMidFlock(quiet(BUSH), BUSH);
    const twist = biomeOf(c, BUSH).twist;
    if (twist === undefined) throw new Error('bushveld twist');
    twist.flushAsRunChance = 1;
    const s = sim(c);
    const b = s.snapshot().birds.find((x) => x.flockId !== null);
    if (b === undefined) throw new Error('no flock');
    run(s, 1, [aimAt(c.scoring.planes.mid.scrollFactor, b.x, b.y)[0] ?? { t: 'gadget' }]);
    const ev = run(s, 1, [{ t: 'gadget' }]);
    expect(ofType(ev, 'flockStateChanged')).toMatchObject([{ to: 'flush' }]);
  });

  it('the share of running-only flocks follows the content chance (own twist stream)', () => {
    // 200 hunts: the first flock of each is running-only with p = 0.6.
    let runners = 0;
    const c = withMidFlock(quiet(BUSH), BUSH);
    for (let seed = 1; seed <= 200; seed++) {
      const s = sim(c, classic, seed);
      if (spookThrice(s, c).states[2] === 'run') runners++;
    }
    expect(runners / 200).toBeGreaterThan(0.5);
    expect(runners / 200).toBeLessThan(0.7);
  });
});

describe('Bushveld secrets (GDD §11.1)', () => {
  it('baobab pod: one hit → +25 and the flock below flushes', () => {
    const c = quiet(BUSH);
    const s = sim(c);
    const ev = shootPart(s, c, 'baobab', 'pod');
    expect(ofType(ev, 'secretTriggered')).toMatchObject([{ propId: 'baobab', partId: 'pod' }]);
    expect(ofType(ev, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 25 }]);
    expect(secretOf(s, 'baobab').done).toBe(true);
  });

  it('dassie: a shot near it (not at it) → every flock alerted and the spotter reveal', () => {
    const c = withMidFlock(quiet(BUSH), BUSH);
    const s = sim(c);
    const dassie = secretOf(s, 'dassie_koppie').parts[0];
    if (dassie === undefined) throw new Error('no dassie');
    const sf = c.scoring.planes.mid.scrollFactor;
    // Dead on: pellets pass the dassie; nothing happens.
    const onIt = run(s, 1, aimAt(sf, dassie.x, dassie.y));
    expect(ofType(onIt, 'secretTriggered')).toEqual([]);
    settle(s);
    // Far away: nothing.
    const far = run(s, 1, aimAt(sf, dassie.x + 400, dassie.y));
    expect(ofType(far, 'secretTriggered')).toEqual([]);
    settle(s);
    // Close beside it: the alarm whistle.
    const near = run(s, 1, aimAt(sf, dassie.x + 70, dassie.y));
    expect(ofType(near, 'secretTriggered')).toMatchObject([{ propId: 'dassie_koppie' }]);
    expect(ofType(near, 'powerupStarted')).toMatchObject([{ powerup: 'meerkat_spotter' }]);
    // The whistle is one threat to every flock (on top of the shot's own alert radius).
    expect(ofType(near, 'flockThreatened').some((e) => e.source === 'event')).toBe(true);
    expect(secretOf(s, 'dassie_koppie').done).toBe(true);
  });

  it('boulder crack: three hits over several shots → +75, birds burst out, +5 s', () => {
    const c = quiet(BUSH);
    const s = sim(c);
    const before = s.snapshot().durationTicks;
    const all: SimEvent[] = [];
    for (let i = 0; i < 3; i++)
      all.push(...shootPart(s, c, 'boulder_crack', 'crack'), ...settle(s));
    expect(ofType(all, 'secretPartHit').map((e) => e.partsLeft)).toEqual([2, 1]);
    expect(ofType(all, 'secretTriggered')).toMatchObject([{ propId: 'boulder_crack' }]);
    expect(ofType(all, 'bonusAwarded')).toMatchObject([{ bonus: 'secret', base: 75 }]);
    expect(ofType(all, 'flockSpawned')).toMatchObject([{ size: 6 }]);
    expect(s.snapshot().durationTicks).toBe(before + secondsToTicks(5));
    // A hit on the crack is not a miss and leaves the Frenzy streak alone (D-021).
    expect(ofType(all, 'miss')).toEqual([]);
  });
});

describe('Bushveld omen: low sun glare', () => {
  it('only with the omen: one side of the view, the width from content', () => {
    const c = quiet(BUSH);
    expect(sim(c).snapshot().glare).toBeNull();
    const sides = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const g = sim(c, { ...classic, omen: true }, seed).snapshot().glare;
      expect(g?.widthPx).toBe(640);
      if (g) sides.add(g.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
    // The Karoo has no glare.
    expect(sim(quiet(), { id: 'classic', omen: true }).snapshot().glare).toBeNull();
  });
});

describe('Ou Grys (GDD §7 Winter boss): peeks from behind the boulders', () => {
  it('hidden behind cover he cannot be hit; peeking he can; a hit sends him back; two bag him', () => {
    const c = quiet(BUSH);
    // The real event, scheduled at the start with fixed timings.
    biomeOf(c, BUSH).events = [
      {
        id: 'bossAppearance',
        creature: 'ou_grys',
        modes: ['classic', 'daily'],
        perHunt: [1, 1],
        window: [0.01, 0.01],
        perchProps: ['boulder_a', 'boulder_b', 'boulder_crack'],
        stayMs: [30000, 30000],
        roamPx: 60,
        peekMs: [1500, 1500],
        hideMs: [1000, 1000],
      },
    ];
    const s = sim(c);
    let grys: BirdView | undefined;
    const phases = new Set<string>();
    for (let i = 0; i < 400; i++) {
      run(s, 1);
      grys = s.snapshot().birds.find((b) => b.creature === 'ou_grys');
      if (grys) phases.add(grys.phase);
      if (grys?.phase === 'peek') break;
    }
    expect(phases.has('hidden')).toBe(true);
    if (grys?.phase !== 'peek') throw new Error('Ou Grys never peeked');
    expect(grys.hittable).toBe(true);
    const first = shootBird(s, c, grys);
    expect(ofType(first, 'targetHit')).toMatchObject([{ hitsLeft: 1 }]);
    const after = s.snapshot().birds.find((b) => b.creature === 'ou_grys');
    expect(after?.phase).toBe('hidden');
    expect(after?.hittable).toBe(false);
    // Shooting where he hides does nothing to him.
    if (after) expect(ofType(shootBird(s, c, after), 'targetHit')).toEqual([]);
    // He peeks again from another boulder; the second hit bags him.
    let again: BirdView | undefined;
    for (let i = 0; i < 400 && again?.phase !== 'peek'; i++) {
      run(s, 1);
      again = s.snapshot().birds.find((b) => b.creature === 'ou_grys');
    }
    if (again?.phase !== 'peek') throw new Error('Ou Grys never peeked again');
    expect(again.x).not.toBe(grys.x);
    expect(ofType(shootBird(s, c, again), 'targetBagged')).toMatchObject([{ creature: 'ou_grys' }]);
  });
});
