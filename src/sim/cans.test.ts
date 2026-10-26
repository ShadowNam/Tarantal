// v1.8 (D-050, GDD §11.3): Blikkies through the whole shot pipeline — a can is knocked off away
// from the hit side and juggled higher in the air, one kick per shot however many pellets hit it;
// cans pay event bonuses (× Frenzy × Stampede) and leave Frenzy alone; a landed can is done; a can
// shot alerts the flocks like any shot; the same seed and log give the same flight.
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  base,
  biomeOf,
  ofType,
  quiet,
  run,
  withMidFlock,
  type Content,
} from '../../tools/simHarness';
import { planeToDx } from './camera';
import type { PlaneId } from './types';
import { hashEvents, type SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { CanView, ModeConfig } from './types';

const MODE: ModeConfig = { id: 'classic', biome: 'karoo-autumn', layout: 'tue', omen: false };

/** Puts a test fence of 4 posts with 4 cans on Tuesday's Karoo map. */
function withFence(c: Content, plane: PlaneId = 'mid', u = 0.5): Content {
  const b = biomeOf(c, 'karoo-autumn');
  b.fenceY = { near: 990, mid: 772, far: 622, ver: 575 };
  const tue = b.layouts.find((l) => l.id === 'tue');
  if (tue === undefined) throw new Error('no tue');
  tue.fence = {
    plane,
    u,
    kind: 'wood',
    posts: [
      { dx: -150, h: 50 },
      { dx: -50, h: 54 },
      { dx: 50, h: 48 },
      { dx: 150, h: 52 },
    ],
    cans: [
      { post: 0, type: 'food' },
      { post: 1, type: 'paint' },
      { post: 2, type: 'bully' },
      { post: 3, type: 'cooldrink' },
    ],
  };
  return c;
}

function sim(
  c: Content,
  mode: ModeConfig = MODE,
  seed = 7,
  input: 'pointer' | 'touch' = 'pointer',
): Sim {
  return createSim({ seed, content: c, mode, inputKind: input });
}

const cans = (s: Sim): readonly CanView[] => s.snapshot().cans?.cans ?? [];
const can = (s: Sim, id: number): CanView => {
  const x = cans(s).find((k) => k.id === id);
  if (x === undefined) throw new Error(`no can ${String(id)}`);
  return x;
};

function reloaded(s: Sim): void {
  if (s.snapshot().weapon.shells > 0 && !s.snapshot().weapon.reloading) return;
  run(s, 1, [{ t: 'reload' }]);
  for (let i = 0; i < 600 && s.snapshot().weapon.reloading; i++) run(s, 1);
}

/** Fires at a can where it will be on the tick the shot resolves, `ox` px off its centre. */
function shootCan(s: Sim, c: Content, id: number, ox = 0): SimEvent[] {
  reloaded(s);
  const plane = s.snapshot().cans?.plane ?? 'mid';
  const k = can(s, id);
  const moving = k.state === 'air' || k.state === 'bounced';
  // The shot resolves before this tick's flight step: aim at the can as the snapshot shows it.
  const x = k.x + ox;
  const y = k.y;
  return run(s, 1, aimAt(c.scoring.planes[plane].scrollFactor, x, moving ? y : y));
}

/** Steps until the can starts to fall (the top of its arc); the events on the way. */
function toApex(s: Sim, id: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 240; i++) {
    const k = can(s, id);
    if (k.state !== 'air') return out;
    const before = k.y;
    out.push(...run(s, 1));
    if (can(s, id).y > before) return out;
  }
  return out;
}

/** Juggles a can low: hit each time it falls back to where it was knocked off (it stays in
 *  view), until it lands, leaves the view or `stop` says so. The events on the way. */
function juggleLow(
  s: Sim,
  c: Content,
  id: number,
  stop: (all: readonly SimEvent[]) => boolean = () => false,
): SimEvent[] {
  const y0 = can(s, id).y;
  const all: SimEvent[] = [...shootCan(s, c, id)];
  for (
    let i = 0;
    i < 4000 && (can(s, id).state === 'air' || can(s, id).state === 'bounced') && !stop(all);
    i++
  ) {
    const k = can(s, id);
    if (k.y >= y0 - 1 && s.snapshot().weapon.cooldownTicks === 0) {
      all.push(...shootCan(s, c, id));
      continue;
    }
    all.push(...run(s, 1));
  }
  return all;
}

/** Busy, bob-free mid fly-overs (no flocks), so a test can build a Frenzy streak. */
function busy(): Content {
  const c = structuredClone(base) as Content;
  c.birds.flyoverDefaults.bobPx = 0;
  c.birds.flyoverDefaults.groupSize = [1, 1];
  for (const b of c.biomes) {
    for (const k of b.pacing.keyframes) {
      k.flyoversPerMin = 120;
      k.popupsPerMin = 0;
      k.flocks = {};
    }
    b.pacing.stampede = { flyoversPerMin: 120, popupsPerMin: 0 };
  }
  return c;
}

/** No hittable bird within `px` of a can on screen (a can-only shot). */
function clearOfBirds(s: Sim, c: Content, id: number, px = 260): boolean {
  const snap = s.snapshot();
  const plane = snap.cans?.plane ?? 'near';
  const k = can(s, id);
  const kx = planeToDx(snap.cameraX, c.scoring.planes[plane].scrollFactor, k.x);
  return snap.birds.every((b) => {
    if (!b.hittable) return true;
    const dx = planeToDx(snap.cameraX, c.scoring.planes[b.plane].scrollFactor, b.x) - kx;
    const dy = b.y - k.y;
    return Math.sqrt(dx * dx + dy * dy) > px;
  });
}

describe('Blikkies: tin cans on the fence posts (D-050)', () => {
  it('stands a can on each post of the day’s fence, sized by its plane', () => {
    const c = withFence(quiet());
    const v = sim(c).snapshot().cans;
    expect(v?.plane).toBe('mid');
    expect(v?.posts.length).toBe(4);
    expect(v?.cans.map((k) => k.state)).toEqual(['rest', 'rest', 'rest', 'rest']);
    const mid = c.scoring.planes.mid.scale;
    const food = v?.cans[0];
    expect(food?.r).toBeCloseTo(c.birds.cans.types.food.r * mid, 9);
    // Each can sits on its post's top.
    for (const k of v?.cans ?? []) {
      const post = v?.posts.find((p) => Math.abs(p.x - k.x) < 1e-9);
      expect(post).toBeDefined();
      expect(k.y + k.r + k.half).toBeCloseTo(post?.top ?? 0, 9);
    }
    // No fence: no cans (another day; the Season Run and FTUE play no layout).
    expect(sim(c, { ...MODE, layout: 'mon' }).snapshot().cans).toBeUndefined();
  });

  it('a far can’s hit radius is floored like a far bird’s (D-049)', () => {
    const c = withFence(quiet(), 'far');
    const k = cans(sim(c))[0];
    expect(k?.hitR).toBe(c.scoring.planes.far.minHitRadiusPx);
    expect(k?.r).toBeLessThan(k?.hitR ?? 0);
  });

  it('in the air a can is easier to hit (× airHitMul), on its post as drawn', () => {
    const c = withFence(quiet());
    const s = sim(c);
    const id = cans(s)[0]?.id ?? 0;
    const rest = can(s, id).hitR;
    expect(rest).toBeCloseTo(c.birds.cans.types.food.r * c.scoring.planes.mid.scale, 9);
    shootCan(s, c, id);
    expect(can(s, id).hitR).toBeCloseTo(rest * c.birds.cans.airHitMul, 9);
  });

  it('knocked off away from the hit side: hit left of centre, it flies right', () => {
    const c = withFence(quiet());
    const a = sim(c);
    const id = cans(a)[1]?.id ?? 0;
    const left = ofType(shootCan(a, c, id, -4), 'canKnocked')[0];
    expect(left?.side).toBeLessThan(0);
    run(a, 10);
    expect(can(a, id).x).toBeGreaterThan(left?.x ?? 0);
    expect(can(a, id).y).toBeLessThan(left?.y ?? 0);
    const b = sim(c);
    const right = ofType(shootCan(b, c, id, 4), 'canKnocked')[0];
    expect(right?.side).toBeGreaterThan(0);
    run(b, 10);
    expect(can(b, id).x).toBeLessThan(right?.x ?? 0);
  });

  it('one kick per shot however many pellets hit it, and the dents where they struck', () => {
    const c = withFence(quiet());
    const s = sim(c);
    const id = cans(s)[0]?.id ?? 0;
    const ev = shootCan(s, c, id);
    const knocked = ofType(ev, 'canKnocked');
    const pellets = c.weapons.weapons.find((w) => w.id === s.snapshot().weapon.id)?.pellets ?? 1;
    expect(knocked.length).toBe(1);
    expect(knocked[0]?.pellets).toBe(pellets);
    expect(knocked[0]?.marks.length).toBe(pellets);
    expect(ofType(ev, 'canJuggled').length).toBe(0);
  });

  it('juggles higher and faster with the chain, scoring more each hit up to the cap', () => {
    const c = withFence(quiet());
    const s = sim(c);
    const id = cans(s)[1]?.id ?? 0;
    const knocked = ofType(shootCan(s, c, id), 'canKnocked')[0];
    expect(knocked?.points).toBe(Math.round(c.scoring.cans.knockOff * c.scoring.cans.planeMul.mid));
    const ups: number[] = [];
    const spins: number[] = [];
    const paid: number[] = [];
    for (let n = 1; n <= 4; n++) {
      toApex(s, id);
      if (can(s, id).state !== 'air') break;
      const ev = shootCan(s, c, id);
      const j = ofType(ev, 'canJuggled')[0];
      expect(j?.chain).toBe(n);
      paid.push(j?.points ?? 0);
      // The kick: its speed one tick later.
      const y0 = can(s, id).y;
      run(s, 1);
      ups.push(y0 - can(s, id).y);
      spins.push(Math.abs(can(s, id).spin));
    }
    expect(paid.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i]).toBeGreaterThan(paid[i - 1] ?? Infinity);
      expect(ups[i]).toBeGreaterThan(ups[i - 1] ?? Infinity);
      expect(spins[i]).toBeGreaterThan(spins[i - 1] ?? Infinity);
    }
    const cs = c.scoring.cans;
    expect(paid[0]).toBe(Math.round(cs.airHit * cs.planeMul.mid));
    expect(paid[1]).toBe(Math.round((cs.airHit + cs.airHitStep) * cs.planeMul.mid));
  });

  it('lands with one bounce, then lies there and scores nothing more', () => {
    const c = withFence(quiet());
    const s = sim(c);
    const id = cans(s)[2]?.id ?? 0;
    shootCan(s, c, id);
    const ev = run(s, 240);
    const landed = ofType(ev, 'canLanded').filter((e) => e.canId === id);
    expect(landed.map((e) => e.final)).toEqual([false, true]);
    expect(can(s, id).state).toBe('landed');
    const before = s.snapshot().score;
    const shot = shootCan(s, c, id);
    expect(ofType(shot, 'canKnocked').length + ofType(shot, 'canJuggled').length).toBe(0);
    expect(s.snapshot().score).toBe(before);
  });

  it('cans are event bonuses: a can-only shot is not a miss and leaves Frenzy alone', () => {
    const c = withFence(quiet());
    const s = sim(c);
    const id = cans(s)[0]?.id ?? 0;
    const ev = shootCan(s, c, id);
    expect(ofType(ev, 'miss').length).toBe(0);
    expect(ofType(ev, 'comboChanged').length).toBe(0);
    const bonus = ofType(ev, 'bonusAwarded');
    expect(bonus.map((b) => b.bonus)).toEqual(['canKnock']);
    expect(ofType(ev, 'targetBagged').length).toBe(0);
    expect(s.snapshot().score).toBe(bonus[0]?.award);
  });

  it('hit at the top of each arc it climbs out of the view: Weg! pays the finish bonus', () => {
    const c = withFence(quiet());
    const s = sim(c);
    const id = cans(s)[1]?.id ?? 0;
    const all: SimEvent[] = [...shootCan(s, c, id)];
    let lastY = can(s, id).y;
    for (let i = 0; i < 40 && can(s, id).state === 'air'; i++) {
      all.push(...toApex(s, id));
      if (can(s, id).state !== 'air') break;
      // Each kick from the top of the arc takes it higher than the last.
      expect(can(s, id).y).toBeLessThan(lastY);
      lastY = can(s, id).y;
      all.push(...shootCan(s, c, id));
    }
    for (let i = 0; i < 300 && can(s, id).state === 'air'; i++) all.push(...run(s, 1));
    const gone = ofType(all, 'canGone');
    expect(gone.length).toBe(1);
    expect(gone[0]?.points).toBe(Math.round(c.scoring.cans.weg * c.scoring.cans.planeMul.mid));
    expect(can(s, id).state).toBe('gone');
    expect(s.snapshot().cans?.bestChain).toBe(
      Math.max(...ofType(all, 'canJuggled').map((e) => e.chain)),
    );
  });

  it('a chain of 8 is the Blikkiesdans secret, once a hunt', () => {
    const c = withFence(quiet());
    // A long belt: the chain is the test, not the reload.
    for (const w of c.weapons.weapons) if (w.kind === 'primary') w.magazine = 99;
    const s = sim(c);
    const id = cans(s)[1]?.id ?? 0;
    const y0 = cans(s)[1]?.y ?? 0;
    const all: SimEvent[] = [...shootCan(s, c, id)];
    // Hit it each time it falls back to where it was knocked off: it stays in view.
    for (
      let i = 0;
      i < 2000 && (can(s, id).state === 'air' || can(s, id).state === 'bounced');
      i++
    ) {
      const k = can(s, id);
      if (k.y >= y0 - 1 && s.snapshot().weapon.cooldownTicks === 0) {
        all.push(...shootCan(s, c, id));
        continue;
      }
      all.push(...run(s, 1));
      if (ofType(all, 'canJuggled').length >= c.scoring.cans.secretChain + 1) break;
    }
    const chain = Math.max(...ofType(all, 'canJuggled').map((e) => e.chain));
    expect(chain).toBeGreaterThanOrEqual(c.scoring.cans.secretChain);
    const secret = ofType(all, 'secretTriggered').filter((e) => e.propId === 'blikkiesdans');
    expect(secret.length).toBe(1);
    expect(ofType(all, 'bonusAwarded').some((b) => b.bonus === 'secret')).toBe(true);
  });

  it('a can shot alerts a nearby flock like any shot', () => {
    const c = withFence(withMidFlock(quiet()));
    const s = sim(c);
    run(s, 60);
    const birds = s.snapshot().birds.filter((b) => b.plane === 'mid');
    expect(birds.length).toBeGreaterThan(0);
    const bx = birds[0]?.x ?? 0;
    // Move the fence beside the flock (the first can 60 px from it) and shoot that can.
    const sf = c.scoring.planes.mid.scrollFactor;
    const ratio = c.scoring.planes.mid.scale / c.scoring.tuningRefScale;
    const c2 = withFence(
      withMidFlock(quiet()),
      'mid',
      (bx + 60 + 150 * ratio) / (1920 + 3200 * sf),
    );
    const s2 = sim(c2);
    run(s2, 60);
    const id = cans(s2)[0]?.id ?? 0;
    const ev = shootCan(s2, c2, id);
    expect(ofType(ev, 'canKnocked').length).toBe(1);
    expect(ofType(ev, 'flockThreatened').length).toBeGreaterThan(0);
  });

  it('the same seed and shots give the same flight; the cans stream leaves the others alone', () => {
    const c = withFence(quiet());
    const play = (): string => {
      const s = sim(c);
      const id = cans(s)[0]?.id ?? 0;
      const ev = [...shootCan(s, c, id), ...run(s, 20)];
      ev.push(...shootCan(s, c, id), ...run(s, 300));
      return hashEvents(ev);
    };
    expect(play()).toBe(play());
    // Without a fence the map plays exactly as before: no can events, nothing else moved.
    const plain = sim(quiet());
    const ev = run(plain, 600);
    expect(ev.some((e) => e.type.startsWith('can'))).toBe(false);
  });

  it('touch assist rescues a near miss onto a can, as onto a bird', () => {
    const c = withFence(quiet());
    const s = sim(c, MODE, 7, 'touch');
    const k = cans(s)[0];
    if (k === undefined) throw new Error('no can');
    const miss = k.hitR + c.scoring.planes.mid.aimAssistPx - 2;
    const ev = run(s, 1, aimAt(c.scoring.planes.mid.scrollFactor, k.x + miss, k.y));
    expect(ofType(ev, 'canKnocked').length).toBe(1);
    const p = sim(c);
    const ev2 = run(p, 1, aimAt(c.scoring.planes.mid.scrollFactor, k.x + miss, k.y));
    expect(ofType(ev2, 'canKnocked').length).toBe(0);
  });
  it('a can-only shot at streak 3+ leaves the streak and the Frenzy multiplier as they were', () => {
    const c = withFence(busy(), 'near');
    const s = sim(c, MODE, 4);
    for (let shot = 0; shot < 3 && !s.isOver();) {
      const bird = s
        .snapshot()
        .birds.find((b) => b.hittable && b.kind === 'target' && b.plane === 'mid');
      if (bird === undefined) {
        run(s, 1);
        continue;
      }
      reloaded(s);
      const ev = run(s, 1, aimAt(c.scoring.planes.mid.scrollFactor, bird.x, bird.y));
      if (ofType(ev, 'targetBagged').length > 0) shot++;
      else if (s.snapshot().streak === 0) shot = 0;
      run(s, 10);
    }
    const streak = s.snapshot().streak;
    expect(streak).toBeGreaterThanOrEqual(3);
    const mul = s.snapshot().frenzyMul;
    expect(mul).toBeGreaterThan(1);
    const id = cans(s)[1]?.id ?? 0;
    for (let i = 0; i < 3000 && !clearOfBirds(s, c, id); i++) run(s, 1);
    reloaded(s);
    for (let i = 0; i < 3000 && !clearOfBirds(s, c, id); i++) run(s, 1);
    const ev = shootCan(s, c, id);
    expect(ofType(ev, 'canKnocked').length).toBe(1);
    expect(ofType(ev, 'targetBagged').length).toBe(0);
    expect(ofType(ev, 'miss').length).toBe(0);
    expect(ofType(ev, 'comboChanged').length).toBe(0);
    expect(s.snapshot().streak).toBe(streak);
    expect(s.snapshot().frenzyMul).toBe(mul);
    // And the can pays its plain value: no Frenzy on cans.
    const knock = ofType(ev, 'bonusAwarded').find((b) => b.bonus === 'canKnock');
    expect(knock?.award).toBe(knock?.base);
  });

  it('cans pay × Stampede in the last seconds', () => {
    const c = withFence(quiet(), 'near');
    const s = sim(c);
    for (let i = 0; i < 6000 && !s.snapshot().stampedeActive; i++) run(s, 1);
    expect(s.snapshot().stampedeActive).toBe(true);
    const id = cans(s)[0]?.id ?? 0;
    const ev = shootCan(s, c, id);
    const knock = ofType(ev, 'bonusAwarded').find((b) => b.bonus === 'canKnock');
    const plain = Math.round(c.scoring.cans.knockOff * c.scoring.cans.planeMul.near);
    expect(knock?.base).toBe(plain);
    expect(knock?.award).toBe(plain * c.scoring.stampede.mul);
  });

  it('the Blikkiesdans is found once a hunt, however many cans reach a chain of 8', () => {
    const c = withFence(quiet());
    for (const w of c.weapons.weapons) if (w.kind === 'primary') w.magazine = 99;
    const s = sim(c);
    const eight = (all: readonly SimEvent[]): boolean =>
      ofType(all, 'canJuggled').some((e) => e.chain >= c.scoring.cans.secretChain);
    const all: SimEvent[] = [];
    for (const k of cans(s).slice(0, 2)) {
      const ev = juggleLow(s, c, k.id, eight);
      expect(eight(ev)).toBe(true);
      all.push(...ev, ...run(s, 400));
    }
    const secret = ofType(all, 'secretTriggered').filter((e) => e.propId === 'blikkiesdans');
    expect(secret.length).toBe(1);
  });

  it('the wegChain-th air hit always clears the top of the view, even from low down', () => {
    const c = withFence(quiet(), 'near');
    for (const w of c.weapons.weapons) if (w.kind === 'primary') w.magazine = 99;
    const s = sim(c);
    const id = cans(s)[1]?.id ?? 0;
    const all = juggleLow(s, c, id);
    for (let i = 0; i < 600 && can(s, id).state === 'air'; i++) all.push(...run(s, 1));
    const chains = ofType(all, 'canJuggled').map((e) => e.chain);
    const weg = c.birds.cans.juggle.wegChain;
    expect(Math.max(...chains)).toBe(weg);
    expect(ofType(all, 'canGone')[0]?.chain).toBe(weg);
    expect(can(s, id).state).toBe('gone');
  });
});
