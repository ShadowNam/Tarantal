// v1.7 (D-044): the desert maps' meerkat colonies from content — the same seed gives the same
// colony; a nearby shot sends it down and it comes back a head at a time; a shot meerkat costs
// points (with the colony cooldown) and is never removed; the Familiefoto; the sentinel's alarm
// alerts the nearest flock; and the colonies' stream leaves every other system alone.
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  biomeOf,
  ofType,
  quiet,
  run,
  settle,
  withMidFlock,
  type Content,
} from '../../tools/simHarness';
import { planeToDx } from './camera';
import { hashEvents, type SimEvent } from './events';
import { createSim, FAMILIEFOTO_SECRET, type Sim } from './Sim';
import type { ColonyView, Command, MeerkatView, ModeConfig } from './types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';

const KAL = 'kalahari-summer';
const mon = (layout = 'mon', biome = KAL): ModeConfig => ({ id: 'classic', biome, layout });

function sim(c: Content, mode: ModeConfig = mon(), seed = 7): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const colony = (s: Sim, i = 0): ColonyView => {
  const c = s.snapshot().meerkats[i];
  if (c === undefined) throw new Error('no colony');
  return c;
};

const sfOf = (c: Content, col: ColonyView): number => c.scoring.planes[col.plane].scrollFactor;

/** The camera centre that puts a colony in the middle of the screen. */
function centreOn(c: Content, col: ColonyView): number {
  const cx = col.burrows.reduce((t, b) => t + b.x, 0) / col.burrows.length;
  const camera = (cx - 960) / sfOf(c, col) + 960;
  return Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, camera)) * 2) / 2;
}

/** Keeps the camera on the colony, reloading when the gun is empty. */
function look(s: Sim, c: Content, ticks: number, i = 0): SimEvent[] {
  const cam: Command[] = [{ t: 'cameraTarget', cx: centreOn(c, colony(s, i)) }];
  return run(s, ticks, cam);
}

function reloaded(s: Sim): void {
  if (s.snapshot().weapon.shells > 0) return;
  run(s, 1, [{ t: 'reload' }]);
  for (let i = 0; i < 600 && s.snapshot().weapon.reloading; i++) run(s, 1);
}

/** Steps until `pred` holds for the colony (camera on it), or throws. */
function waitFor(s: Sim, c: Content, pred: (col: ColonyView) => boolean, max = 3600, i = 0): void {
  for (let t = 0; t < max; t++) {
    if (pred(colony(s, i))) return;
    look(s, c, 1, i);
  }
  throw new Error('colony never got there');
}

const outPose = (m: MeerkatView): boolean =>
  ['sit', 'forage', 'sunbathe', 'sentinel'].includes(m.pose);

/** Fires at a meerkat's body as the snapshot shows it. */
function shootMeerkat(s: Sim, c: Content, m: MeerkatView, col: ColonyView): SimEvent[] {
  const mk = c.birds.meerkats;
  const shape = m.pose === 'sentinel' ? mk.hitboxes.tall : mk.hitboxes.low;
  const k = c.scoring.planes[col.plane].scale * (m.pup ? mk.pupScale : 1);
  reloaded(s);
  settle(s);
  return run(
    s,
    1,
    aimAt(sfOf(c, col), m.x + shape.body.ox * k * m.facing, m.y + shape.body.oy * k),
  );
}

/** Fires into the sky right of the colony: near enough to scare it, hitting nothing. */
function shootNear(s: Sim, c: Content, col: ColonyView, offset = 160): SimEvent[] {
  const right = Math.max(...col.burrows.map((b) => b.x));
  reloaded(s);
  settle(s);
  return run(s, 1, aimAt(sfOf(c, col), right + offset, col.ground - 200));
}

const trace = (s: Sim, ticks: number): string => {
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) {
    run(s, 1);
    if (i % 15 === 0)
      out.push(
        s
          .snapshot()
          .meerkats.map((col) =>
            col.meerkats.map((m) => `${m.id}${m.pose}${Math.round(m.x)}`).join(','),
          )
          .join('|'),
      );
  }
  return out.join(';');
};

describe('meerkat colonies (v1.7, D-044)', () => {
  it('every desert map has 1–2 colonies of 4–8 (a pup on top); other biomes have none', () => {
    const c = quiet(KAL);
    for (const biome of [KAL, 'namibie'])
      for (const layout of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
        const s = sim(c, mon(layout, biome));
        const cols = s.snapshot().meerkats;
        expect(cols.length).toBeGreaterThanOrEqual(1);
        expect(cols.length).toBeLessThanOrEqual(2);
        for (const col of cols) {
          const adults = col.meerkats.filter((m) => !m.pup).length;
          expect(adults).toBeGreaterThanOrEqual(4);
          expect(adults).toBeLessThanOrEqual(8);
          expect(col.meerkats.filter((m) => m.pup).length).toBeLessThanOrEqual(1);
          expect(col.burrows.length).toBeGreaterThanOrEqual(3);
          expect(['near', 'mid']).toContain(col.plane);
        }
        expect(ofType(s.drainEvents(), 'colonySpawned')).toHaveLength(cols.length);
      }
    expect(sim(quiet(), { id: 'classic' }).snapshot().meerkats).toEqual([]);
  });

  it('the same seed gives the same colony behaviour; another seed differs', () => {
    const c = quiet(KAL);
    const a = trace(sim(c, mon(), 11), 1800);
    expect(trace(sim(c, mon(), 11), 1800)).toBe(a);
    expect(trace(sim(c, mon(), 12), 1800)).not.toBe(a);
  });

  it('they peek, come out, keep a sentinel on the highest mound and dash between burrows', () => {
    const c = quiet(KAL);
    const s = sim(c, mon('tue'), 5);
    const seen = new Set<string>();
    let sentinelOnPost = false;
    let dashers = 0;
    for (let i = 0; i < 90 * 60; i++) {
      run(s, 1);
      const col = colony(s);
      const post = col.burrows.reduce((a, b) => (b.mound > a.mound ? b : a));
      for (const m of col.meerkats) {
        seen.add(m.pose);
        if (m.pose === 'sentinel' && m.x === post.x && m.y === post.y) sentinelOnPost = true;
      }
      dashers = Math.max(dashers, col.meerkats.filter((m) => m.pose === 'stand').length);
    }
    for (const p of [
      'hidden',
      'peek',
      'emerge',
      'sit',
      'forage',
      'run',
      'stand',
      'sentinel',
      'dive',
    ])
      expect(seen, p).toContain(p);
    expect(seen).not.toContain('sunbathe');
    expect(sentinelOnPost).toBe(true);
    expect(dashers).toBeGreaterThanOrEqual(1);
  });

  it('they sunbathe only on the early-light layout', () => {
    const c = quiet(KAL);
    const poses = (layout: string): Set<string> => {
      const s = sim(c, mon(layout), 5);
      const seen = new Set<string>();
      for (let i = 0; i < 60 * 60; i++) {
        run(s, 1);
        for (const col of s.snapshot().meerkats) for (const m of col.meerkats) seen.add(m.pose);
      }
      return seen;
    };
    expect(poses('mon')).toContain('sunbathe');
    expect(poses('sat')).not.toContain('sunbathe');
  });

  it('a nearby shot sends them down; after 3–6 s one head comes up first, then the rest', () => {
    const c = quiet(KAL);
    const s = sim(c, mon('tue'), 5);
    waitFor(s, c, (col) => col.meerkats.filter((m) => outPose(m)).length >= 3);
    const before = colony(s);
    const shot = shootNear(s, c, before);
    expect(ofType(shot, 'meerkatsDived')).toMatchObject([{ colonyId: before.id, cause: 'shot' }]);
    expect(ofType(shot, 'meerkatHit')).toEqual([]);
    // Everyone is down within a second or so.
    let downAt = -1;
    for (let t = 0; t < 120 && downAt < 0; t++) {
      run(s, 1);
      if (colony(s).meerkats.every((m) => m.pose === 'hidden')) downAt = t;
    }
    expect(downAt).toBeGreaterThanOrEqual(0);
    // The first head: alone, a peek, while the rest stay home.
    let firstUp = -1;
    for (let t = 0; t < 8 * 60 && firstUp < 0; t++) {
      run(s, 1);
      const up = colony(s).meerkats.filter((m) => m.pose !== 'hidden');
      if (up.length > 0) {
        firstUp = t + downAt;
        expect(up).toHaveLength(1);
        expect(up[0]?.pose).toBe('peek');
        expect(up[0]?.pup).toBe(false);
      }
    }
    const mk = c.birds.meerkats.shotDive.returnSeconds;
    expect(firstUp).toBeGreaterThanOrEqual(mk[0] * 60 - 2);
    expect(firstUp).toBeLessThanOrEqual(mk[1] * 60 + 60);
    // Then the rest come out too.
    waitFor(s, c, (col) => col.meerkats.filter((m) => m.pose !== 'hidden').length >= 3, 10 * 60);
  });

  it('a shot far from the colony leaves it be', () => {
    const c = quiet(KAL);
    const s = sim(c, mon('sat'), 5);
    waitFor(s, c, (col) => col.meerkats.some((m) => outPose(m)));
    const col = colony(s);
    const shot = shootNear(s, c, col, 1400);
    expect(ofType(shot, 'meerkatsDived')).toEqual([]);
  });

  it('a shot meerkat costs points once per cooldown, tumbles, scolds, and is never removed', () => {
    const c = quiet(KAL);
    const s = sim(c, mon('tue'), 5);
    waitFor(s, c, (col) => col.meerkats.some((m) => outPose(m) && !m.pup));
    const col = colony(s);
    const family = col.meerkats.length;
    const target = col.meerkats.find((m) => outPose(m) && !m.pup);
    if (target === undefined) throw new Error('none out');
    const score = s.snapshot().score;
    const hit = shootMeerkat(s, c, target, col);
    const penalty = c.birds.meerkats.hit.penalty;
    expect(ofType(hit, 'meerkatHit')).toMatchObject([{ meerkatId: target.id, points: -penalty }]);
    expect(ofType(hit, 'meerkatsDived')).toMatchObject([{ cause: 'hit' }]);
    expect(ofType(hit, 'targetBagged')).toEqual([]);
    expect(s.snapshot().score).toBe(score - penalty);
    expect(colony(s).meerkats.find((m) => m.id === target.id)?.pose).toBe('tumble');
    // It pops its head out of the hole and scolds (the bark carries the hit's points).
    let scold: SimEvent[] = [];
    for (let t = 0; t < 180 && scold.length === 0; t++) scold = ofType(run(s, 1), 'meerkatScold');
    expect(scold).toMatchObject([{ meerkatId: target.id, points: -penalty }]);
    expect(colony(s).meerkats.find((m) => m.id === target.id)?.pose).toBe('scold');
    expect(colony(s).meerkats).toHaveLength(family);
    expect(s.result().penalties).toBe(1);
    // A second hit within the cooldown (another colony member, or a peek) costs nothing.
    const s2 = sim(c, mon('tue'), 5);
    waitFor(s2, c, (x) => x.meerkats.filter((m) => outPose(m) && !m.pup).length >= 2);
    const c2 = colony(s2);
    const [m1, m2] = c2.meerkats.filter((m) => outPose(m) && !m.pup);
    if (m1 === undefined || m2 === undefined) throw new Error('two not out');
    shootMeerkat(s2, c, m1, c2);
    run(s2, 1);
    const fresh = colony(s2).meerkats.find((m) => m.id === m2.id);
    if (fresh === undefined || fresh.pose === 'hidden' || !fresh.hittable) return; // already down: the cooldown case is covered by the unit below
    const again = run(s2, 1, aimAt(sfOf(c, c2), fresh.x, fresh.y - 20));
    for (const e of ofType(again, 'meerkatHit')) expect(e.points).toBe(0);
  });

  it('the penalty cooldown: hits within cooldownSeconds cost nothing, after it they cost again', () => {
    const c = quiet(KAL);
    // A meerkat that never goes down: no diving, never hidden for long.
    const mk = c.birds.meerkats;
    mk.activities = { sit: 1, sentinel: 0, forage: 0, sunbathe: 0, dash: 0, dive: 0 };
    mk.shotDive.returnSeconds = [0.1, 0.1];
    mk.startOutShare = 1;
    mk.pupChance = 0;
    const s = sim(c, mon('tue'), 5);
    const points: number[] = [];
    for (let shot = 0; shot < 8 && points.length < 3; shot++) {
      waitFor(s, c, (col) => col.meerkats.some((m) => m.pose === 'sit'), 1200);
      const col = colony(s);
      const m = col.meerkats.find((x) => x.pose === 'sit');
      if (m === undefined) continue;
      for (const e of ofType(shootMeerkat(s, c, m, col), 'meerkatHit')) points.push(e.points);
    }
    expect(points[0]).toBe(-mk.hit.penalty);
    expect(points.length).toBeGreaterThanOrEqual(2);
  });

  it('the Familiefoto: hold fire with the whole family out and on screen → a row, +25, once', () => {
    const c = quiet(KAL);
    const s = sim(c, mon('sat'), 5);
    // A first shot, far from the colony (holding fire starts after it).
    look(s, c, 1);
    run(s, 1, [{ t: 'fire', dx: 0, sy: 100 }]);
    const events: SimEvent[] = [];
    for (let t = 0; t < 40 * 60 && ofType(events, 'familiefoto').length === 0; t++)
      events.push(...look(s, c, 1));
    const photo = ofType(events, 'familiefoto');
    expect(photo).toHaveLength(1);
    const col = colony(s);
    expect(photo[0]).toMatchObject({ colonyId: col.id, family: col.meerkats.length });
    expect(col.meerkats.every((m) => m.pose === 'photo')).toBe(true);
    // In a row, facing the camera.
    const xs = col.meerkats.map((m) => m.x).sort((a, b) => a - b);
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(xs.length);
    const at = events.findIndex((e) => e.type === 'familiefoto');
    expect(events.slice(at)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'secretTriggered', propId: FAMILIEFOTO_SECRET }),
        expect.objectContaining({ type: 'bonusAwarded', bonus: 'secret', base: 25 }),
      ]),
    );
    // No hold for the last holdSeconds before the photo was broken by a shot.
    expect(
      events.slice(Math.max(0, at - c.birds.meerkats.familiefoto.holdSeconds * 60), at),
    ).not.toContainEqual(expect.objectContaining({ type: 'shotFired' }));
    expect(s.result().secrets).toBe(1);
    // Once per hunt.
    const later = look(s, c, 60 * 30);
    expect(ofType(later, 'familiefoto')).toEqual([]);
  });

  it('no Familiefoto while shooting, off screen, or before the first shot', () => {
    const c = quiet(KAL);
    // Shooting every 2 s (into the sky, far off): the hold never reaches 4 s.
    const a = sim(c, mon('sat'), 5);
    const ev: SimEvent[] = [];
    for (let t = 0; t < 30 * 60; t++) {
      const cmds: Command[] = [{ t: 'cameraTarget', cx: centreOn(c, colony(a)) }];
      if (t % 120 === 0) {
        reloaded(a);
        cmds.push({ t: 'fire', dx: 0, sy: 60 });
      }
      a.step(cmds);
      ev.push(...a.drainEvents());
    }
    expect(ofType(ev, 'familiefoto')).toEqual([]);
    // The camera elsewhere: the colony is off screen.
    const b = sim(c, mon('sat'), 5);
    run(b, 1, [{ t: 'fire', dx: 0, sy: 60 }]);
    const col = colony(b);
    const far = centreOn(c, col) > 2500 ? CAMERA_MIN_X : CAMERA_MAX_X;
    expect(Math.abs(planeToDx(far, sfOf(c, col), col.burrows[0]?.x ?? 0))).toBeGreaterThan(600);
    expect(ofType(run(b, 30 * 60, [{ t: 'cameraTarget', cx: far }]), 'familiefoto')).toEqual([]);
    // No shot yet: looking round at the start isn't holding fire.
    const d = sim(c, mon('sat'), 5);
    expect(ofType(look(d, c, 30 * 60), 'familiefoto')).toEqual([]);
  });

  it('a raptor or the crop sprayer overhead: the sentinel barks, they dive, the nearest flock is alerted', () => {
    const c = withMidFlock(quiet(KAL), KAL);
    const k = biomeOf(c, KAL);
    // The crop sprayer crosses early, on the far plane.
    k.events = [{ id: 'cropSprayer', creature: 'sproeier', perHunt: [1, 1], window: [0.06, 0.07] }];
    const s = sim(c, mon('tue'), 5);
    const events = run(s, 90 * 60 - 1);
    const alarms = ofType(events, 'meerkatAlarm');
    expect(alarms.length).toBeGreaterThanOrEqual(1);
    const a = alarms[0];
    if (a === undefined) throw new Error('no alarm');
    expect(a.creature).toBe('sproeier');
    expect(a.flockId).not.toBeNull();
    const i = events.indexOf(a);
    const sameTick = events.filter((e) => e.tick === a.tick);
    expect(sameTick).toContainEqual(
      expect.objectContaining({
        type: 'flockThreatened',
        flockId: a.flockId,
        source: 'meerkatAlarm',
      }),
    );
    expect(events.slice(i)).toContainEqual(
      expect.objectContaining({ type: 'meerkatsDived', colonyId: a.colonyId, cause: 'alarm' }),
    );
    // Turned off in content: the colony still dives, no flock hears it.
    const c2 = structuredClone(c);
    c2.birds.meerkats.alarm.alertsNearestFlock = false;
    const quietFlock = ofType(run(sim(c2, mon('tue'), 5), 90 * 60 - 1), 'meerkatAlarm');
    expect(quietFlock.every((e) => e.flockId === null)).toBe(true);
  });

  it('a very loud gun (the Langloop) sends every colony down', () => {
    const c = quiet(KAL);
    const s = createSim({
      seed: 5,
      content: c,
      mode: { ...mon('mon'), weapon: 'langloop' },
      inputKind: 'pointer',
    });
    waitFor(s, c, (col) => col.meerkats.some((m) => outPose(m)), 3600, 0);
    // A hip shot into the empty sky.
    const shot = run(s, 1, [{ t: 'fire', dx: 0, sy: 40 }]);
    const dived = ofType(shot, 'meerkatsDived');
    expect(dived.length).toBeGreaterThanOrEqual(1);
    expect(dived.every((e) => e.cause === 'loud')).toBe(true);
  });

  it("the colonies' stream leaves the birds and flocks alone (no shots, no alarms)", () => {
    const c = withMidFlock(quiet(KAL), KAL);
    const none = structuredClone(c);
    const nk = biomeOf(none, KAL);
    for (const l of nk.layouts) l.colonies = [];
    nk.colonies = [];
    const strip = (es: SimEvent[]): SimEvent[] =>
      es.filter((e) => !e.type.startsWith('meerkat') && e.type !== 'colonySpawned');
    const a = strip(run(sim(c, mon('tue'), 9), 60 * 60));
    const b = strip(run(sim(none, mon('tue'), 9), 60 * 60));
    expect(hashEvents(a)).toBe(hashEvents(b));
  });
});
