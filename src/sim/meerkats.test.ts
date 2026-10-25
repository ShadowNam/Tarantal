// v1.7 (D-044): the desert maps' meerkat colonies from content — the same seed gives the same
// colony; a nearby shot sends it down and it comes back a head at a time; a shot meerkat costs
// points (with the colony cooldown) and is never removed; the Familiefoto; the sentinel's alarm
// alerts the nearest flock; and the colonies' stream leaves every other system alone.
import { describe, expect, it } from 'vitest';
import {
  aimAt,
  base,
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
import { secondsToTicks } from './clock';
import type { ColonyView, Command, CrateView, MeerkatView, ModeConfig } from './types';
import { CAMERA_MAX_X, CAMERA_MIN_X, coreWidth } from './world';

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

  it('out of the burrow they keep about 0.7 body widths apart (sitting, foraging, standing, the sentinel)', () => {
    const c = quiet(KAL);
    const mk = c.birds.meerkats;
    mk.activities = { sit: 1, sentinel: 1, forage: 2, sunbathe: 0, dash: 1, dive: 0 };
    mk.startOutShare = 1;
    mk.pupChance = 0;
    // A small yard, so they would crowd without the rule.
    mk.forageRadiusPx = 40;
    const s = sim(c, mon('tue'), 5);
    const k = c.scoring.planes[colony(s).plane].scale;
    const min = mk.bodyWidthPx * mk.spacingBodyMul * k;
    let checked = 0;
    for (let i = 0; i < 60 * 60; i++) {
      run(s, 1);
      const settled = colony(s)
        .meerkats.filter((m) => !m.pup && ['sit', 'forage', 'stand', 'sentinel'].includes(m.pose))
        .map((m) => m.x)
        .sort((a, b) => a - b);
      for (let j = 1; j < settled.length; j++) {
        expect((settled[j] ?? 0) - (settled[j - 1] ?? 0)).toBeGreaterThanOrEqual(min - 0.01);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('no two adults overlap past the spacing rule, over a hunt on every desert map and seed', () => {
    const settledPoses = ['sit', 'forage', 'sunbathe', 'stand', 'sentinel'];
    let checked = 0;
    const bad: string[] = [];
    for (const biome of [KAL, 'namibie']) {
      const c = structuredClone(base) as Content;
      const mk = c.birds.meerkats;
      for (const seed of [1, 2, 3, 4]) {
        const s = sim(c, mon('mon', biome), seed);
        for (let t = 0; t < 60 * 60; t++) {
          run(s, 1);
          for (const col of s.snapshot().meerkats) {
            if (col.phase === 'lineUp' || col.phase === 'photo') continue;
            const min = mk.bodyWidthPx * mk.spacingBodyMul * c.scoring.planes[col.plane].scale;
            const xs = col.meerkats
              .filter((m) => !m.pup && settledPoses.includes(m.pose))
              .map((m) => m.x)
              .sort((a, b) => a - b);
            for (let j = 1; j < xs.length; j++) {
              checked++;
              const gap = (xs[j] ?? 0) - (xs[j - 1] ?? 0);
              if (gap < min - 0.01) bad.push(`${biome} seed ${seed} t ${t}: ${gap.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(5000);
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
    // (The near colony may stand close in front on screen and dive too.)
    expect(ofType(shot, 'meerkatsDived')).toContainEqual(
      expect.objectContaining({ colonyId: before.id, cause: 'shot' }),
    );
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
    // (Another colony close by on screen may dive at the shot too.)
    expect(ofType(hit, 'meerkatsDived')).toContainEqual(
      expect.objectContaining({ colonyId: col.id, cause: 'hit' }),
    );
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
  });

  it('the penalty cooldown: a second hit inside it costs 0, a hit after it costs again', () => {
    const c = quiet(KAL);
    const mk = c.birds.meerkats;
    mk.activities = { sit: 1, sentinel: 0, forage: 0, sunbathe: 0, dash: 0, dive: 0 };
    mk.startOutShare = 1;
    mk.pupChance = 0;
    // They sit far from their holes and run home at dash speed, so after the first hit another
    // one is still above ground for the second barrel.
    mk.forageRadiusPx = 500;
    mk.diveRunMul = 1;
    // Back up soon after, for the hit after the cooldown.
    mk.shotDive.returnSeconds = [0.2, 0.2];
    mk.hiddenSeconds = [0.2, 0.3];
    const s = sim(c, mon('sat'), 5);
    const penalty = mk.hit.penalty;
    const cooldown = secondsToTicks(mk.hit.cooldownSeconds);
    /** Fires at a meerkat's body as it stands now, and returns the shot's meerkat hits. */
    const fireAt = (
      m: MeerkatView,
      col: ColonyView,
    ): Extract<SimEvent, { type: 'meerkatHit' }>[] => {
      const box = m.pose === 'sentinel' || m.pose === 'stand' ? mk.hitboxes.tall : mk.hitboxes.low;
      const k = c.scoring.planes[col.plane].scale;
      const at = aimAt(sfOf(c, col), m.x + box.body.ox * k * m.facing, m.y + box.body.oy * k);
      return ofType(run(s, 1, at), 'meerkatHit');
    };
    const ready = (): boolean =>
      s.snapshot().weapon.cooldownTicks === 0 && s.snapshot().weapon.shells > 0;

    waitFor(s, c, (col) => col.meerkats.filter((m) => m.pose === 'sit').length >= 2, 1200);
    reloaded(s);
    settle(s);
    const col1 = colony(s);
    const first = col1.meerkats.find((m) => m.pose === 'sit');
    if (first === undefined) throw new Error('none sitting');
    const t1 = s.tick;
    const hit1 = fireAt(first, col1);
    expect(hit1).toMatchObject([{ meerkatId: first.id, points: -penalty }]);

    // The second barrel, as soon as the gun allows, at another meerkat still above ground.
    let hit2: Extract<SimEvent, { type: 'meerkatHit' }>[] = [];
    while (hit2.length === 0 && s.tick - t1 < cooldown - 1) {
      const col = colony(s);
      const other = col.meerkats.find((m) => m.id !== first.id && m.hittable && m.pose !== 'peek');
      if (!ready() || other === undefined) run(s, 1);
      else hit2 = fireAt(other, col);
    }
    expect(s.tick - t1).toBeLessThan(cooldown);
    expect(hit2).toHaveLength(1);
    expect(hit2[0]?.points).toBe(0);

    // Past the cooldown, a hit costs again.
    run(s, cooldown);
    let hit3: Extract<SimEvent, { type: 'meerkatHit' }>[] = [];
    for (let tries = 0; tries < 20 && hit3.length === 0; tries++) {
      reloaded(s);
      waitFor(s, c, (col) => col.meerkats.some((m) => m.pose === 'sit'), 1800);
      settle(s);
      const col = colony(s);
      const m = col.meerkats.find((x) => x.pose === 'sit');
      if (m !== undefined) hit3 = fireAt(m, col);
    }
    expect(hit3[0]?.points).toBe(-penalty);
    expect(s.result().penalties).toBe(2);
  });

  it('a crate in front of a meerkat takes the shot: the crate opens and nothing is charged', () => {
    const c = quiet(KAL);
    c.powerups.crates.perHunt = 1;
    c.powerups.crates.windows = [[0.05, 0.06]];
    // Where the crate lands (the colonies draw nothing from the crates' stream).
    const probe = sim(c, mon('sat'), 5);
    let crate: CrateView | undefined;
    for (let t = 0; t < 30 * 60 && crate === undefined; t++) {
      run(probe, 1);
      crate = probe.snapshot().crates.find((x) => x.landed);
    }
    if (crate === undefined) throw new Error('no crate landed');
    const at = crate;
    // A colony whose first burrow is right under the crate, a meerkat sitting at it, its body on
    // the crate's centre.
    const mk = c.birds.meerkats;
    mk.activities = { sit: 1, sentinel: 0, forage: 0, sunbathe: 0, dash: 0, dive: 0 };
    mk.startOutShare = 1;
    mk.pupChance = 0;
    mk.forageRadiusPx = 0;
    const sat = biomeOf(c, KAL).layouts.find((l) => l.id === 'sat');
    const def = sat?.colonies?.[0];
    if (sat === undefined || def === undefined) throw new Error('no Saturday colony');
    const k = c.scoring.planes.mid.scale;
    sat.colonies = [
      {
        ...def,
        u: (at.x - (def.burrows[0]?.dx ?? 0)) / coreWidth(c.scoring.planes.mid.scrollFactor),
        y: at.y - mk.hitboxes.low.body.oy * k,
      },
    ];
    const s = sim(c, mon('sat'), 5);
    for (let t = 0; t < 30 * 60 && s.snapshot().crates.find((x) => x.landed) === undefined; t++)
      run(s, 1);
    const landed = s.snapshot().crates.find((x) => x.landed);
    expect(landed).toMatchObject({ x: at.x, y: at.y });
    // A meerkat sits right behind it.
    const sitter = colony(s).meerkats.find((m) => m.hittable && Math.abs(m.x - at.x) < 2);
    expect(sitter).toBeDefined();
    const shot = run(s, 1, aimAt(c.scoring.planes.mid.scrollFactor, at.x, at.y));
    expect(ofType(shot, 'crateOpened')).toHaveLength(1);
    expect(ofType(shot, 'meerkatHit')).toEqual([]);
    expect(s.snapshot().score).toBe(0);
  });

  it('a shot pup tumbles, scolds and comes back; its colony can still give the Familiefoto', () => {
    const c = quiet(KAL);
    const mk = c.birds.meerkats;
    mk.pupChance = 1;
    mk.startOutShare = 1;
    // The pup trails well behind its mother here, so it can sit clear of the adults.
    mk.pupGapPx = 160;
    mk.activities = { sit: 1, sentinel: 0, forage: 0, sunbathe: 0, dash: 1, dive: 0 };
    const s = sim(c, mon('sat'), 5);
    // A moment when the pup sits clear of the adults, so the shot finds the pup.
    const clear = (col: ColonyView): MeerkatView | undefined =>
      col.meerkats.find(
        (m) =>
          m.pup &&
          m.pose === 'sit' &&
          col.meerkats.every((o) => o.id === m.id || Math.abs(o.x - m.x) > 40),
      );
    waitFor(s, c, (col) => clear(col) !== undefined, 60 * 60);
    const col = colony(s);
    const pup = clear(col);
    if (pup === undefined) throw new Error('no pup out');
    const hit = shootMeerkat(s, c, pup, col);
    expect(ofType(hit, 'meerkatHit')).toMatchObject([{ meerkatId: pup.id }]);
    let scold: SimEvent[] = [];
    for (let t = 0; t < 240 && scold.length === 0; t++)
      scold = ofType(look(s, c, 1), 'meerkatScold');
    expect(scold).toMatchObject([{ meerkatId: pup.id }]);
    // Not stuck: it leaves the tumble and the scold, and is out with its family again.
    const events: SimEvent[] = [];
    for (let t = 0; t < 30 * 60; t++) {
      events.push(...look(s, c, 1));
      if (colony(s).meerkats.find((m) => m.id === pup.id)?.pose === 'sit') break;
    }
    expect(colony(s).meerkats.find((m) => m.id === pup.id)?.pose).toBe('sit');
    events.push(...look(s, c, 40 * 60));
    expect(ofType(events, 'familiefoto')).toHaveLength(1);
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
    // Two flocks on the mid plane (Tuesday has three feeding spots across the pan), so the
    // nearest one is a real choice.
    for (const kf of k.pacing.keyframes) kf.flocks = { mid: 2 };
    // (Without the spawn spacing the second flock finds room on Tuesday's feeding spots.)
    c.birds.flockDefaults.spawnSpacingPx = 0;
    // The crop sprayer crosses on the far plane once both flocks are out.
    k.events = [{ id: 'cropSprayer', creature: 'sproeier', perHunt: [1, 1], window: [0.3, 0.31] }];
    const s = sim(c, mon('tue'), 5);
    const events: SimEvent[] = [];
    /** Each flock's distance from the alarmed colony in pan fractions, as the sim measures it. */
    let distances: { id: number; d: number }[] = [];
    for (let t = 0; t < 90 * 60 - 1; t++) {
      const step = run(s, 1);
      events.push(...step);
      const alarm = ofType(step, 'meerkatAlarm')[0];
      if (alarm !== undefined && distances.length === 0) {
        const st = s.snapshot();
        const col = st.meerkats.find((x) => x.id === alarm.colonyId);
        if (col === undefined) throw new Error('no colony');
        const cu =
          col.burrows.reduce((t2, b) => t2 + b.x, 0) / col.burrows.length / coreWidth(sfOf(c, col));
        distances = st.flocks.map((f) => {
          const ms = st.birds.filter((b) => b.flockId === f.id);
          const x = ms.reduce((t2, b) => t2 + b.x, 0) / Math.max(1, ms.length);
          return {
            id: f.id,
            d: Math.abs(x / coreWidth(c.scoring.planes[f.plane].scrollFactor) - cu),
          };
        });
      }
    }
    const alarms = ofType(events, 'meerkatAlarm');
    expect(alarms.length).toBeGreaterThanOrEqual(1);
    const a = alarms[0];
    if (a === undefined) throw new Error('no alarm');
    expect(a.creature).toBe('sproeier');
    // Two flocks, clearly at different distances: the nearer one heard it.
    expect(distances.length).toBeGreaterThanOrEqual(2);
    const sorted = [...distances].sort((x, y) => x.d - y.d);
    expect((sorted[1]?.d ?? 0) - (sorted[0]?.d ?? 0)).toBeGreaterThan(0.02);
    expect(a.flockId).toBe(sorted[0]?.id);
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
