// v1.20 (D-085) "Jag, Brakkie!": the card in a whole hunt — a crate gives it only where Brakkie
// comes along, he catches foraging guineafowl (a bag of each: its normal score, then Bring! when
// he delivers it), the card's chip counts down while he hunts and holds while he carries, the
// Padstal sells it, a consumable waits in its slot where he isn't out, and it is deterministic.
import { describe, expect, it } from 'vitest';
import { aimAt, base, newSim, ofType, quiet, run, type Content } from '../../tools/simHarness';
import { createRun, rollOffers } from './run/run';
import type { SimEvent } from './events';
import type { Sim } from './Sim';
import type { ModeConfig } from './types';

const JAG = 'brakkie_jag';
const jagDef = base.powerups.powerups.find((p) => p.id === JAG);

/** Quiet Karoo content with Brakkie back, mid flocks foraging, and one early crate. */
function withDog(table: { id: string; weight: number }[] = [{ id: JAG, weight: 1 }]): Content {
  const c = quiet();
  c.brakkie.areas = structuredClone(base.brakkie.areas);
  const karoo = c.biomes.find((b) => b.id === 'karoo-autumn');
  if (karoo === undefined) throw new Error('no karoo');
  for (const k of karoo.pacing.keyframes) k.flocks = { mid: 2 };
  c.powerups.crates.perHunt = 1;
  c.powerups.crates.windows = [[0.02, 0.02]];
  c.powerups.crates.table = table;
  return c;
}

/** Steps until the crate lands, then shoots it (several tries; the crate is on the mid plane). */
function openCrate(sim: Sim, c: Content): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 1200 && sim.snapshot().crates[0]?.landed !== true; i++)
    out.push(...run(sim, 1));
  // A bird can stand in front of it: a few shots (the gun's cooldown between them).
  for (let k = 0; k < 6 && sim.snapshot().crates.length > 0; k++) {
    const crate = sim.snapshot().crates[0];
    if (crate === undefined) break;
    const sf = c.scoring.planes[crate.plane].scrollFactor;
    out.push(...run(sim, 30, aimAt(sf, crate.x, crate.y)));
  }
  return out;
}

/** The view on a guineafowl walking on the mid ground (as a player watching a flock would). */
function watch(sim: Sim, c: Content): { t: 'cameraTarget'; cx: number }[] {
  const sf = c.scoring.planes.mid.scrollFactor;
  const b = sim
    .snapshot()
    .birds.find((x) => x.plane === 'mid' && x.phase === 'walk' && x.creature === 'tarentaal');
  return b === undefined
    ? []
    : [{ t: 'cameraTarget', cx: Math.round(((b.x - 960) / sf + 960) * 2) / 2 }];
}

/** Keeps the view on foraging guineafowl for `ticks`. */
function follow(sim: Sim, c: Content, ticks: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks && !sim.isOver(); i++)
    out.push(...run(sim, 1, i % 30 === 0 ? watch(sim, c) : []));
  return out;
}

describe('the Jag, Brakkie! card in a hunt (v1.20, D-085)', () => {
  it('is a timed, Brakkie-only power-up with up to 3 catches, in the crates and the Padstal', () => {
    expect(jagDef?.needsBrakkie).toBe(true);
    expect(jagDef?.effect.brakkieJag?.maxCatches).toBe(3);
    expect(jagDef?.durationMs).toBe(10_000);
    expect(jagDef?.padstalPrice).toBeGreaterThan(0);
    expect(base.powerups.crates.table.some((e) => e.id === JAG)).toBe(true);
  });

  it('a crate gives it, he catches a foraging guineafowl, and the score rises by its bag + Bring!', () => {
    const c = withDog();
    const sim = newSim(c, { id: 'classic', layout: 'mon' }, 5);
    const ev = openCrate(sim, c);
    expect(ofType(ev, 'crateOpened')).toMatchObject([{ item: JAG }]);
    expect(ofType(ev, 'powerupStarted')).toMatchObject([{ powerup: JAG, source: 'crate' }]);
    expect(ofType(ev, 'brakkieJagStarted')).toHaveLength(1);
    const before = sim.snapshot().score;
    const later = follow(sim, c, 60 * 40);
    const caught = ofType(later, 'brakkieCaught');
    expect(caught.length).toBeGreaterThanOrEqual(1);
    expect(caught.length).toBeLessThanOrEqual(3);
    // Each catch is a bag of a foraging guineafowl (no shot) with its own score.
    const bags = ofType(later, 'targetBagged').filter((e) => e.byDog === true);
    expect(bags.map((b) => b.birdId)).toEqual(caught.map((x) => x.birdId));
    for (const b of bags) {
      expect(base.brakkie.jag.creatures).toContain(b.creature);
      expect(b.shotId).toBe(-1);
      expect(['near', 'mid']).toContain(b.plane);
      expect(b.behaviour).not.toBe('flying');
    }
    const awards = ofType(later, 'scoreAwarded').filter((e) =>
      caught.some((x) => x.birdId === e.birdId),
    );
    for (const x of caught) expect(awards.find((a) => a.birdId === x.birdId)?.award).toBe(x.points);
    // The rest of a caught bird's flock reacts as to a threat: alert, then run (then flush when
    // its window is open) — never straight to flush.
    for (const b of bags) {
      const at = caught.find((x) => x.birdId === b.birdId)?.tick ?? 0;
      const ch = ofType(later, 'flockStateChanged').filter(
        (e) => e.flockId === b.flockId && e.tick >= at && e.cause === 'threat',
      );
      const threats = ofType(later, 'flockThreatened').filter(
        (e) => e.flockId === b.flockId && e.source === 'dog',
      );
      expect(threats.length).toBeGreaterThanOrEqual(1);
      const order = ch.map((e) => e.to);
      if (order.length > 0 && order.includes('flush'))
        expect(order.indexOf('run')).toBeLessThan(order.indexOf('flush'));
      expect(order[0], JSON.stringify(ch)).toBe('alert');
    }
    // Delivered: Bring! (+15, × Frenzy × Stampede: 1 here).
    const brought = ofType(later, 'brakkieFetched');
    expect(brought.length).toBeGreaterThanOrEqual(1);
    // No shots fired after the crate: every point is his.
    expect(ofType(later, 'shotFired')).toHaveLength(0);
    const catchPts = caught.reduce((n, x) => n + x.points, 0);
    const bringPts = brought.reduce((n, x) => n + (x.points ?? 0), 0);
    expect(sim.snapshot().score - before).toBe(catchPts + bringPts);
    expect(bringPts).toBeGreaterThanOrEqual(base.brakkie.bring.points);
  });

  it('the chip counts down while he hunts and holds while he carries; it ends by max or time', () => {
    const c = withDog();
    const sim = newSim(c, { id: 'classic', layout: 'mon' }, 5);
    openCrate(sim, c);
    let heldWhileCarrying = false;
    let ended = false;
    for (let i = 0; i < 60 * 60 && !ended; i++) {
      const s0 = sim.snapshot();
      const left0 = s0.powerups.find((p) => p.id === JAG)?.ticksLeft ?? null;
      const ev = run(sim, 1, i % 30 === 0 ? watch(sim, c) : []);
      const s1 = sim.snapshot();
      const left1 = s1.powerups.find((p) => p.id === JAG)?.ticksLeft ?? null;
      if (s0.brakkie?.carrying === true && s1.brakkie?.carrying === true && left0 !== null)
        if (left1 === left0) heldWhileCarrying = true;
      if (ofType(ev, 'powerupEnded').some((e) => e.powerup === JAG)) ended = true;
    }
    expect(ended).toBe(true);
    expect(heldWhileCarrying).toBe(true);
    expect(sim.snapshot().brakkie?.jag).toBeNull();
  });

  it('never in a crate where Brakkie is not out: the crate rolls another power-up', () => {
    const c = withDog([
      { id: JAG, weight: 1 },
      { id: 'boeretroos', weight: 1 },
    ]);
    c.brakkie.areas = [];
    for (let seed = 1; seed <= 12; seed++) {
      const sim = newSim(c, { id: 'classic', layout: 'mon' }, seed);
      const spawned = ofType(run(sim, 60 * 4), 'crateSpawned');
      expect(spawned).toHaveLength(1);
      expect(spawned[0]?.item).toBe('boeretroos');
    }
  });

  it('a Padstal card waits in its slot in a hunt without him; is used in a plain hunt', () => {
    const season: ModeConfig = {
      id: 'seasonHunt',
      biome: 'karoo-autumn',
      weapon: 'dubbelloop',
      season: {
        kind: 'plain',
        boss: null,
        charms: [],
        consumables: [JAG, null],
        rental: null,
        runShellBonus: 0,
      },
    };
    const c = withDog();
    // A hunt he doesn't come to (here: no omen or plain hunts for him): the card stays.
    const away = withDog();
    away.brakkie.seasonKinds = ['omen'];
    const e1 = run(newSim(away, season), 1, [{ t: 'consumable', slot: 0 }]);
    expect(ofType(e1, 'consumableUsed')).toHaveLength(0);
    // A plain hunt: he is coming in from the bakkie; the card starts (its clock holds till he's in).
    const plain = newSim(c, season);
    const e2 = run(plain, 1, [{ t: 'consumable', slot: 0 }]);
    expect(ofType(e2, 'consumableUsed')).toMatchObject([{ item: JAG }]);
    expect(ofType(e2, 'brakkieJagStarted')).toHaveLength(1);
    const left0 = plain.snapshot().powerups.find((p) => p.id === JAG)?.ticksLeft;
    run(plain, 60);
    expect(plain.snapshot().brakkie?.present).toBe(false);
    expect(plain.snapshot().powerups.find((p) => p.id === JAG)?.ticksLeft).toBe(left0);
  });

  it('the Padstal offers it', () => {
    let seen = false;
    for (let seed = 1; seed <= 40 && !seen; seed++) {
      const r = createRun(base, { seed, weapon: 'dubbelloop', pool: [] });
      for (let k = 0; k < 3; k++) if (rollOffers(base, r, k).some((o) => o.id === JAG)) seen = true;
    }
    expect(seen).toBe(true);
  });

  it('is deterministic: the same seed and commands give the same events', () => {
    const go = (): string => {
      const c = withDog();
      const sim = newSim(c, { id: 'classic', layout: 'mon' }, 7);
      const ev = [...openCrate(sim, c), ...follow(sim, c, 60 * 20)];
      return JSON.stringify(ev);
    };
    expect(go()).toBe(go());
  });
});
