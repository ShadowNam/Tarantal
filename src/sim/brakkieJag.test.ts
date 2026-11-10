// v1.20 (D-085) "Jag, Brakkie!": the card in a whole hunt — a crate gives it only where Brakkie
// comes along, he catches foraging guineafowl (a bag of each: its normal score, then Bring! when
// he delivers it), the card's chip counts down while he hunts and holds while he carries, the
// Padstal sells it, a consumable waits in its slot where he isn't out, and it is deterministic.
import { describe, expect, it } from 'vitest';
import { aimAt, base, newSim, ofType, quiet, run, type Content } from '../../tools/simHarness';
import { planeToDx } from './camera';
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

/** Pheasants and doves in foraging flocks too (in the shipped content they only fly over): the
 *  birds the card must leave alone, on the ground beside the guineafowl. */
function groundOthers(c: Content): void {
  for (const cr of c.birds.creatures)
    if ((cr.id === 'fisant' || cr.id === 'tortelduif') && cr.kind === 'target')
      cr.behaviours = [...cr.behaviours, 'flock'];
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

/** The view on a guineafowl (`any`: any bird) walking on the mid ground (as a player watching a
 *  flock would). */
function watch(sim: Sim, c: Content, any = false): { t: 'cameraTarget'; cx: number }[] {
  const sf = c.scoring.planes.mid.scrollFactor;
  const b = sim
    .snapshot()
    .birds.find(
      (x) => x.plane === 'mid' && x.phase === 'walk' && (any || x.creature === 'tarentaal'),
    );
  return b === undefined
    ? []
    : [{ t: 'cameraTarget', cx: Math.round(((b.x - 960) / sf + 960) * 2) / 2 }];
}

/** Keeps the view on foraging guineafowl for `ticks`. */
function follow(sim: Sim, c: Content, ticks: number, any = false): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks && !sim.isOver(); i++)
    out.push(...run(sim, 1, i % 30 === 0 ? watch(sim, c, any) : []));
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
    // Each catch's award, computed apart from the sim: the plane's base (+ its behaviour), × the
    // Frenzy of the last combo change before it (no Stampede this early, no map multiplier).
    const awards = ofType(later, 'scoreAwarded');
    for (const b of bags) {
      const combo = ofType([...ev, ...later], 'comboChanged').filter((e) => e.tick <= b.tick);
      const fMul = combo.at(-1)?.frenzyMul ?? 1;
      const want = Math.round(
        base.scoring.planes[b.plane].base * (1 + base.scoring.behaviourAdd[b.behaviour]) * fMul,
      );
      expect(awards.find((a) => a.birdId === b.birdId)?.award, `bird ${b.birdId}`).toBe(want);
      expect(caught.find((x) => x.birdId === b.birdId)?.points).toBe(want);
    }
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

  it('the real target rule: only guineafowl walking in a foraging flock, never other birds', () => {
    // Guineafowl, pheasants and doves foraging side by side, the Karoo's own events (the kwêvoël,
    // the hadeda, the balloon…), Brakkie's card from the crate; the view follows the walking birds.
    const c = withDog();
    const karoo = c.biomes.find((b) => b.id === 'karoo-autumn');
    const real = base.biomes.find((b) => b.id === 'karoo-autumn');
    if (karoo === undefined || real === undefined) throw new Error('no karoo');
    karoo.events = structuredClone(real.events);
    groundOthers(c);
    karoo.spawnTable = [
      { creature: 'tarentaal', weight: 1 },
      { creature: 'fisant', weight: 1 },
      { creature: 'tortelduif', weight: 1 },
    ];
    for (const k of karoo.pacing.keyframes) k.flocks = { mid: 3, near: 1 };
    let chases = 0;
    const reach = { near: 0, mid: 0 };
    let othersInReach = 0;
    for (const seed of [3, 5, 8]) {
      const sim = newSim(c, { id: 'classic', layout: 'mon' }, seed);
      openCrate(sim, c);
      let last: number | null = null;
      for (let i = 0; i < 60 * 40 && !sim.isOver(); i++) {
        const snap = sim.snapshot();
        const d = snap.brakkie;
        const target = d?.jagBird ?? null;
        if (target !== null && target !== last) {
          // The moment he picks it: a guineafowl, walking, in a foraging flock.
          const b = snap.birds.find((x) => x.id === target);
          expect(b, 'the chosen bird exists').toBeDefined();
          expect(base.brakkie.jag.creatures).toContain(b?.creature);
          expect(b?.phase).toBe('walk');
          const f = snap.flocks.find((x) => x.id === b?.flockId);
          expect(f?.state).toBe('forage');
          // In reach: the near plane within the view (nearMaxDxPx), the mid ground maxDxPx.
          if (b !== undefined) {
            const plane = b.plane === 'near' ? 'near' : 'mid';
            const dx = Math.abs(planeToDx(snap.cameraX, c.scoring.planes[plane].scrollFactor, b.x));
            const max = plane === 'near' ? c.brakkie.jag.nearMaxDxPx : c.brakkie.jag.maxDxPx;
            expect(dx, `${plane} reach`).toBeLessThanOrEqual(max);
            reach[plane]++;
          }
          chases++;
        }
        last = target;
        if (d?.jag != null)
          othersInReach += snap.birds.filter(
            (x) =>
              x.plane === 'mid' &&
              x.phase === 'walk' &&
              !base.brakkie.jag.creatures.includes(x.creature),
          ).length;
        const w = snap.birds.find((x) => x.plane === 'mid' && x.phase === 'walk');
        const sf = c.scoring.planes.mid.scrollFactor;
        run(
          sim,
          1,
          w === undefined || i % 30 !== 0
            ? []
            : [{ t: 'cameraTarget', cx: Math.round(((w.x - 960) / sf + 960) * 2) / 2 }],
        );
      }
    }
    expect(chases, 'he chased guineafowl').toBeGreaterThan(0);
    expect(othersInReach, 'pheasants and doves walking there to choose').toBeGreaterThan(0);
  });

  it('no guineafowl foraging (only pheasants and doves): he never pounces', () => {
    const c = withDog();
    const karoo = c.biomes.find((b) => b.id === 'karoo-autumn');
    if (karoo === undefined) throw new Error('no karoo');
    groundOthers(c);
    karoo.spawnTable = [
      { creature: 'fisant', weight: 1 },
      { creature: 'tortelduif', weight: 1 },
    ];
    const sim = newSim(c, { id: 'classic', layout: 'mon' }, 5);
    const ev = [...openCrate(sim, c), ...follow(sim, c, 60 * 30, true)];
    expect(ofType(ev, 'brakkieJagStarted')).toHaveLength(1);
    expect(ofType(ev, 'brakkiePounced')).toHaveLength(0);
  });

  it('flocks kept alarmed (shots over them): he never picks a bird from a flock not foraging', () => {
    const c = withDog();
    const sim = newSim(c, { id: 'classic', layout: 'mon' }, 5);
    openCrate(sim, c);
    let picks = 0;
    let alarmedTicks = 0;
    let last: number | null = null;
    for (let i = 0; i < 60 * 20 && !sim.isOver(); i++) {
      const snap = sim.snapshot();
      const d = snap.brakkie;
      if (d?.jag != null && snap.flocks.some((f) => f.alive > 0 && f.state !== 'forage'))
        alarmedTicks++;
      const target = d?.jagBird ?? null;
      if (target !== null && target !== last) {
        picks++;
        const b = snap.birds.find((x) => x.id === target);
        const f = snap.flocks.find((x) => x.id === b?.flockId);
        expect(f?.state, 'picked from a foraging flock only').toBe('forage');
        expect(b?.phase, 'a bird on the ground, never one flying').toBe('walk');
      }
      last = target;
      run(sim, 1, []);
      // A shot over a flock every second keeps it alert, running or in the air.
      if (i % 60 === 0)
        for (const f of sim.snapshot().flocks) {
          const m = sim.snapshot().birds.find((x) => x.flockId === f.id);
          if (m === undefined || f.state === 'flush') continue;
          run(sim, 1, aimAt(c.scoring.planes[m.plane].scrollFactor, m.x, m.y - 260));
        }
    }
    expect(alarmedTicks, 'flocks were alarmed while the card ran').toBeGreaterThan(60);
    expect(picks + alarmedTicks).toBeGreaterThan(0);
  });

  it('the near plane reach stays in view (nearMaxDxPx < the mid ground reach)', () => {
    expect(base.brakkie.jag.nearMaxDxPx).toBeLessThanOrEqual(960);
    expect(base.brakkie.jag.nearMaxDxPx).toBeLessThan(base.brakkie.jag.maxDxPx);
  });

  it('a Jag crate re-rolls (its icon too) when he bolts before it is opened', () => {
    const c = withDog([
      { id: JAG, weight: 1 },
      { id: 'boeretroos', weight: 1 },
    ]);
    // Find a seed whose crate drops holding the card.
    for (let seed = 1; seed <= 30; seed++) {
      const sim = newSim(c, { id: 'classic', layout: 'mon' }, seed);
      const pre: SimEvent[] = [];
      for (let i = 0; i < 600 && sim.snapshot().crates.length === 0; i++) pre.push(...run(sim, 1));
      if (sim.snapshot().crates[0]?.item !== JAG) continue;
      // He comes out; a shot aimed at him: he yelps and bolts (he can't take the card now).
      for (
        let i = 0;
        i < 1200 &&
        !(sim.snapshot().brakkie?.phase === 'rest' && sim.snapshot().brakkie?.hittable === true);
        i++
      )
        run(sim, 1);
      if (sim.snapshot().crates.length === 0) continue;
      const d = sim.snapshot().brakkie;
      if (d == null) throw new Error('no dog');
      const box = base.brakkie.hitboxes.stand.body;
      const sf = c.scoring.planes.near.scrollFactor;
      const hit = run(sim, 2, aimAt(sf, d.x + box.ox * d.scale * d.facing, d.y + box.oy * d.scale));
      expect(ofType(hit, 'brakkieHit')).toHaveLength(1);
      // The crate rolls again at once: its view (the icon) shows the new item.
      expect(sim.snapshot().crates[0]?.item).toBe('boeretroos');
      expect(ofType(hit, 'crateRerolled')).toMatchObject([{ item: 'boeretroos' }]);
      const opened = openCrate(sim, c);
      expect(ofType(opened, 'crateOpened')).toMatchObject([{ item: 'boeretroos' }]);
      expect(ofType(opened, 'brakkieJagStarted')).toHaveLength(0);
      return;
    }
    throw new Error('no seed dropped a Jag crate');
  });
});
