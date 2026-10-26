// v1.3 long range (GDD §10.6, §11.5, Tech §3.4, D-036): the Ver plane, rifle sights (hold to
// zoom, release to fire), the hip shot, cancel, sway and the breath hold, and their replays.
import { describe, expect, it } from 'vitest';
import { base, karooOf, newSim, ofType, quiet, run, type Content } from '../../tools/simHarness';
import { planeToDx } from './camera';
import { hashEvents, type SimEvent } from './events';
import { decodeInputLogText, encodeInputLogText, createRecorder } from './replay/inputLog';
import { runReplay } from './replay/verify';
import { createSim, type Sim } from './Sim';
import { resolveMap } from './maps';
import type { BirdView, Command, ModeConfig } from './types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';
import { breathAt, sightTiming, swayAt, raiseSight } from './weapons/sight';
import { createStream } from './rng';
import type { Sight } from '../content/schemas';

/** A stand-in rifle (the Twee-Twee arrives with its art in v1.3 PR B; the rules are here). */
const RIFLE = {
  id: 'test_rifle',
  kind: 'primary' as const,
  unlock: { type: 'start' as const },
  magazine: 5,
  reloadMs: 1200,
  perShellReload: false,
  fireCooldownMs: 400,
  pellets: 1,
  spreadPx: 0,
  alertRadiusPx: 150,
  windSensitivity: 0.5,
  projectile: null,
  scoreMul: { ver: 1.5 },
  shake: { px: 1, ms: 50 },
  reachesVer: true,
  aim: { sights: ['iron', 'peep', 'scope_small'], defaultSight: 'iron', hipSpreadPx: 40 },
};

/** Quiet Karoo, the rifle, and Verder opened onto the Ver plane with one Ver flock. */
function verContent(opts: { sway?: boolean } = {}): Content {
  const c = quiet();
  c.weapons.weapons.push(structuredClone(RIFLE));
  if (opts.sway === false) for (const s of c.weapons.sights) s.swayPx = 0;
  const karoo = karooOf(c);
  // Verder is the first bonus map.
  const verder = karoo.bonusMaps[0];
  if (verder === undefined) throw new Error('no verder');
  verder.ver = true;
  for (const k of karoo.pacing.keyframes) k.flocks = { ver: 1 };
  verder.pacing = { flocks: { ver: 1 } };
  return c;
}

function sightOf(c: { weapons: { sights: readonly Sight[] } }, id: string): Sight {
  const s = c.weapons.sights.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no sight ${id}`);
  return s;
}

const verMode = (weapon = 'test_rifle', sight?: string): ModeConfig => ({
  id: 'classic',
  layout: 'mon',
  bonus: 'verder',
  weapon,
  ...(sight === undefined ? {} : { sight }),
});

/** The screen point of a bird's body centre for a camera that centres it. */
function sightPicture(c: Content, b: BirdView): { cx: number; dx: number; sy: number } {
  const p = c.scoring.planes[b.plane];
  const creature = c.birds.creatures.find((x) => x.id === b.creature);
  const body = creature !== undefined && 'hitbox' in creature ? creature.hitbox.body : null;
  const bx = b.x + (body?.ox ?? 0) * p.scale * b.facing;
  const by = b.y + (body?.oy ?? 0) * p.scale;
  const cx =
    Math.round(
      Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (bx - 960) / p.scrollFactor + 960)) * 2,
    ) / 2;
  return { cx, dx: planeToDx(cx, p.scrollFactor, bx), sy: by };
}

function verBird(sim: Sim): BirdView {
  for (let i = 0; i < 600; i++) {
    const b = sim.snapshot().birds.find((x) => x.plane === 'ver' && x.hittable);
    if (b !== undefined) return b;
    run(sim, 1);
  }
  throw new Error('no Ver bird');
}

/** Raises the sight on a Ver bird, tracks it for `ticks`, releases; returns all events. */
function holdOn(sim: Sim, c: Content, ticks: number, release: Command = { t: 'aimRelease' }) {
  const first = sightPicture(c, verBird(sim));
  const out: SimEvent[] = [];
  sim.step([
    { t: 'cameraTarget', cx: first.cx },
    { t: 'aimStart', dx: first.dx, sy: first.sy },
  ]);
  out.push(...sim.drainEvents());
  for (let i = 0; i < ticks; i++) {
    const b = sim.snapshot().birds.find((x) => x.plane === 'ver' && x.hittable);
    const p = b === undefined ? null : sightPicture(c, b);
    sim.step(
      p === null
        ? []
        : [
            { t: 'cameraTarget', cx: p.cx },
            { t: 'aimMove', dx: p.dx, sy: p.sy },
          ],
    );
    out.push(...sim.drainEvents());
  }
  sim.step([release]);
  out.push(...sim.drainEvents());
  return out;
}

describe('the Ver plane (v1.3)', () => {
  it('appears only on maps that open it; every other map leaves its layer out', () => {
    const c = verContent();
    const karoo = karooOf(c);
    expect(
      resolveMap(karoo, undefined, undefined).biome.layers.some((l) => l.plane === 'ver'),
    ).toBe(false);
    expect(resolveMap(karoo, 'mon', undefined).ver).toBe(false);
    const map = resolveMap(karoo, 'mon', 'verder');
    expect(map.ver).toBe(true);
    expect(map.biome.layers.find((l) => l.plane === 'ver')?.scrollFactor).toBe(0.22);
    // The real content: no season biome's weekday map opens it (only Nog Verder and Die Verste
    // do); the Namibië area pack (v1.4 B, D-039) is built for long range and opens it every day.
    for (const b of base.biomes.filter((x) => x.area === undefined))
      for (const l of b.layouts)
        expect(resolveMap(b, l.id, undefined).biome.layers.some((x) => x.plane === 'ver')).toBe(
          false,
        );
  });

  it('spawns Ver flocks at scale 0.07 behind the far plane (D-049)', () => {
    const c = verContent();
    const sim = newSim(c, verMode());
    const b = verBird(sim);
    expect(b.plane).toBe('ver');
    expect(c.scoring.planes.ver).toMatchObject({ base: 50, scale: 0.07 });
    expect(c.scoring.planes.ver.scrollFactor).toBeLessThan(c.scoring.planes.far.scrollFactor);
    expect(sim.snapshot().flocks.some((f) => f.plane === 'ver')).toBe(true);
  });

  it('a rifle bags a Ver bird for 50 × the rifle Ver multiplier', () => {
    const c = verContent({ sway: false });
    const sim = newSim(c, verMode());
    const events = holdOn(sim, c, 12);
    const bag = ofType(events, 'targetBagged')[0];
    expect(bag?.plane).toBe('ver');
    const award = ofType(events, 'scoreAwarded')[0];
    // Foraging: points 50, mult 1 × weapon 1.5 (map pointsMul of Verder applies to the base).
    const verder = karooOf(c).bonusMaps[0];
    const mapMul =
      (verder?.pointsMul ?? 1) * (karooOf(c).layouts.find((l) => l.id === 'mon')?.pointsMul ?? 1);
    expect(award?.points).toBe(Math.round(50 * mapMul));
    expect(award?.mult).toBeCloseTo(1.5, 9);
    expect(sim.result().baggedByPlane.ver).toBe(1);
  });

  it('shotgun pellets and Kettie stones fall short of it', () => {
    for (const weapon of ['dubbelloop', 'pomp', 'windbuks', 'kettie']) {
      const c = verContent();
      const sim = newSim(c, verMode(weapon));
      const p = sightPicture(c, verBird(sim));
      const events = run(sim, 40, [
        { t: 'cameraTarget', cx: p.cx },
        { t: 'fire', dx: p.dx, sy: p.sy },
      ]);
      expect(ofType(events, 'shotFired')).toHaveLength(1);
      expect(ofType(events, 'targetBagged'), weapon).toHaveLength(0);
      expect(ofType(events, 'miss'), weapon).toHaveLength(1);
    }
  });
});

describe('rifle sights: hold to zoom, release to fire (v1.3)', () => {
  it('a release once the sight is up fires through it, at the aim point plus sway', () => {
    const c = verContent();
    const sim = newSim(c, verMode('test_rifle', 'scope_small'));
    const raise = sightTiming(sightOf(c, 'scope_small')).raiseTicks;
    expect(raise).toBe(18);
    const events = holdOn(sim, c, raise + 3);
    const started = ofType(events, 'aimStarted')[0];
    expect(started).toMatchObject({ sight: 'scope_small', zoom: 4 });
    expect(ofType(events, 'aimRaised')).toHaveLength(1);
    const shot = ofType(events, 'shotFired')[0];
    expect(shot?.aim).toBe('sight');
    expect(ofType(events, 'aimEnded').at(-1)?.reason).toBe('fired');
    expect(sim.snapshot().aim).toBeNull();
    expect(sim.snapshot().weapon.shells).toBe(4);
  });

  it('the snapshot shows the sight coming up, then up', () => {
    const c = verContent();
    const sim = newSim(c, verMode('test_rifle', 'peep'));
    sim.step([{ t: 'aimStart', dx: 0, sy: 540 }]);
    const a = sim.snapshot().aim;
    expect(a).toMatchObject({ sight: 'peep', zoom: 2, dx: 0, sy: 540, breath: 'raising' });
    expect(a?.progress).toBeGreaterThan(0);
    expect(a?.progress).toBeLessThan(1);
    run(sim, 12);
    expect(sim.snapshot().aim?.progress).toBe(1);
    expect(sim.snapshot().weapon.sight).toBe('peep');
  });

  it('an early release is a hip shot: no zoom wait, the hip spread instead', () => {
    const c = verContent();
    // Calm air: Verder's wind would carry the impact further downwind.
    const sim = newSim(c, { ...verMode(), omen: false });
    sim.step([{ t: 'aimStart', dx: 100, sy: 500 }]);
    sim.step([{ t: 'aimRelease' }]);
    const events = [...sim.drainEvents()];
    const shot = ofType(events, 'shotFired')[0];
    expect(shot?.aim).toBe('hip');
    expect(ofType(events, 'aimEnded')[0]?.reason).toBe('hip');
    const impact = ofType(events, 'pelletImpact')[0];
    const off = Math.hypot((impact?.dx ?? 0) - 100, (impact?.sy ?? 0) - 500);
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThanOrEqual(40);
  });

  it('a plain fire command with a rifle in hand is a hip shot (no shortcut past the sight)', () => {
    const c = verContent();
    const sim = newSim(c, { ...verMode(), omen: false });
    sim.step([{ t: 'fire', dx: 100, sy: 500 }]);
    const events = [...sim.drainEvents()];
    expect(ofType(events, 'shotFired')[0]?.aim).toBe('hip');
    const impact = ofType(events, 'pelletImpact')[0];
    const off = Math.hypot((impact?.dx ?? 0) - 100, (impact?.sy ?? 0) - 500);
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThanOrEqual(40);
    // A shotgun's plain fire is unchanged (no aim field).
    const s2 = newSim(c, verMode('dubbelloop'));
    s2.step([{ t: 'fire', dx: 100, sy: 500 }]);
    expect(ofType([...s2.drainEvents()], 'shotFired')[0]?.aim).toBeUndefined();
  });

  it('a press and release in the same tick is a hip shot too', () => {
    const c = verContent();
    const sim = newSim(c, verMode());
    sim.step([{ t: 'aimStart', dx: 0, sy: 500 }, { t: 'aimRelease' }]);
    expect(ofType([...sim.drainEvents()], 'shotFired')[0]?.aim).toBe('hip');
  });

  it('cancel (right-click / slide onto the ammo) lowers the sight without a shot', () => {
    const c = verContent();
    const sim = newSim(c, verMode());
    const events = holdOn(sim, c, 20, { t: 'aimCancel' });
    expect(ofType(events, 'shotFired')).toHaveLength(0);
    expect(ofType(events, 'aimEnded')[0]?.reason).toBe('cancel');
    expect(sim.snapshot().weapon.shells).toBe(5);
    // A release after a cancel does nothing.
    expect(ofType(run(sim, 1, [{ t: 'aimRelease' }]), 'shotFired')).toHaveLength(0);
  });

  it('a reload lowers the sight; a release during the bolt is dropped (no shot)', () => {
    const c = verContent();
    const sim = newSim(c, verMode());
    run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 500 }]);
    run(sim, 20, [{ t: 'aimRelease' }]);
    expect(sim.snapshot().weapon.shells).toBe(4);
    const r = run(sim, 2, [{ t: 'aimStart', dx: 0, sy: 500 }]);
    const reload = run(sim, 1, [{ t: 'reload' }]);
    expect(ofType([...r, ...reload], 'aimEnded')[0]?.reason).toBe('reload');
    expect(ofType(reload, 'reloadStarted')).toHaveLength(1);
    // Bolt: a release straight after a shot can't go off.
    const s2 = newSim(c, verMode());
    run(s2, 1, [{ t: 'aimStart', dx: 0, sy: 500 }]);
    run(s2, 1, [{ t: 'aimRelease' }]);
    run(s2, 1, [{ t: 'aimStart', dx: 0, sy: 500 }]);
    const blocked = run(s2, 1, [{ t: 'aimRelease' }]);
    expect(ofType(blocked, 'shotFired')).toHaveLength(0);
    expect(ofType(blocked, 'aimEnded')[0]?.reason).toBe('blocked');
  });

  it('only rifles raise a sight; a sight must fit the gun', () => {
    const c = verContent();
    const shotgun = newSim(c, verMode('dubbelloop'));
    expect(ofType(run(shotgun, 3, [{ t: 'aimStart', dx: 0, sy: 500 }]), 'aimStarted')).toHaveLength(
      0,
    );
    expect(shotgun.snapshot().weapon.sight).toBeNull();
    expect(() => newSim(c, verMode('dubbelloop', 'iron'))).toThrow(/takes no sight/);
    c.weapons.sights.push({ ...structuredClone(sightOf(c, 'iron')), id: 'other' });
    expect(() => newSim(c, verMode('test_rifle', 'other'))).toThrow(/does not fit/);
  });

  it('zoom steps: a fixed sight has one; a variable scope picks its step (recorded)', () => {
    const c = verContent();
    const scope = c.weapons.sights.find((s) => s.id === 'scope_small');
    if (scope === undefined) throw new Error('no scope');
    scope.zoom = [3, 6, 9];
    scope.swayPerStep = 1;
    const sim = newSim(c, verMode('test_rifle', 'scope_small'));
    const ev = run(sim, 1, [{ t: 'zoom', step: 2 }]);
    expect(ofType(ev, 'zoomChanged')[0]).toMatchObject({ step: 2, zoom: 9 });
    run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 500 }]);
    expect(sim.snapshot().aim?.zoom).toBe(9);
    // Steps clamp to the sight's list.
    const fixed = newSim(verContent(), verMode());
    expect(ofType(run(fixed, 1, [{ t: 'zoom', step: 3 }]), 'zoomChanged')).toHaveLength(0);
    expect(fixed.snapshot().weapon.zoomStep).toBe(0);
  });
});

describe('sway and the breath hold (v1.3)', () => {
  const sight = sightTiming(sightOf(base, 'scope_small'));

  it('settles after ~0.5 s for ~3 s, then grows (you cannot camp on a bird)', () => {
    expect(breathAt(10, sight).breath).toBe('raising');
    expect(breathAt(25, sight)).toEqual({ mul: 1, breath: 'steady' });
    expect(breathAt(30, sight).breath).toBe('held');
    const held = breathAt(60, sight);
    expect(held.mul).toBeCloseTo(sight.holdMul, 9);
    expect(breathAt(30 + sight.easeTicks + sight.holdTicks - 1, sight).mul).toBeCloseTo(
      sight.holdMul,
      9,
    );
    const late = breathAt(30 + sight.easeTicks + sight.holdTicks + sight.tireTicks + 60, sight);
    expect(late).toEqual({ mul: sight.tiredMul, breath: 'tired' });
    // The hold lasts about 3 s (180 ticks) and starts about 0.5 s in.
    expect(sight.holdAfterTicks).toBe(30);
    expect(sight.holdTicks).toBe(180);
  });

  it('sways in a figure-eight within the sight amplitude, far less while the breath is held', () => {
    const a = raiseSight(0, 500, 0, createStream(9), sight);
    let steadyMax = 0;
    let heldMax = 0;
    for (let t = sight.raiseTicks; t < 30; t++) {
      a.heldTicks = t;
      const s = swayAt(a, sight);
      steadyMax = Math.max(steadyMax, Math.hypot(s.dx, s.dy));
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(sight.swayPx + 1e-9);
      expect(Math.abs(s.dy)).toBeLessThanOrEqual(sight.swayPx * sight.swayHeight + 1e-9);
    }
    for (let t = 60; t < 200; t++) {
      a.heldTicks = t;
      const s = swayAt(a, sight);
      heldMax = Math.max(heldMax, Math.hypot(s.dx, s.dy));
    }
    expect(heldMax).toBeLessThanOrEqual(sight.swayPx * sight.holdMul * 1.2 + 1e-9);
    expect(heldMax).toBeLessThan(steadyMax);
  });

  it('comes from its own RNG stream: aiming changes nothing else in the hunt', () => {
    const c = verContent();
    const birdsOnly = (sim: Sim, script: (t: number) => Command[]): string => {
      const out: SimEvent[] = [];
      for (let t = 0; t < 900; t++) {
        sim.step(script(t));
        out.push(
          ...sim
            .drainEvents()
            .filter((e) => e.type === 'birdSpawned' || e.type === 'flockStateChanged'),
        );
      }
      return hashEvents(out);
    };
    const plain = birdsOnly(newSim(c, verMode()), () => []);
    // Raise and cancel the sight over and over (each raise draws from the sway stream).
    const aiming = birdsOnly(newSim(c, verMode()), (t) =>
      t % 40 === 0
        ? [{ t: 'aimStart', dx: 0, sy: 300 }]
        : t % 40 === 30
          ? [{ t: 'aimCancel' }]
          : [],
    );
    expect(aiming).toBe(plain);
  });

  it('is identical in a replay, and breath events mark the hold', () => {
    const c = verContent();
    const sim = newSim(c, verMode('test_rifle', 'scope_small'));
    const events = holdOn(sim, c, 100);
    expect(ofType(events, 'aimBreath').map((e) => e.breath)).toEqual(['held']);
    const shot = ofType(events, 'shotFired')[0];
    const again = newSim(c, verMode('test_rifle', 'scope_small'));
    const shot2 = ofType(holdOn(again, c, 100), 'shotFired')[0];
    expect(shot2).toEqual(shot);
  });
});

describe('replays of a zoomed hunt (InputLog v5)', () => {
  it('record the sight and the aim and zoom commands, and replay the same hunt', () => {
    const c = verContent();
    const mode = verMode('test_rifle', 'scope_small');
    const sim = createSim({ seed: 5, content: c, mode, inputKind: 'touch' });
    const rec = createRecorder({ seed: 5, contentHash: 'ab'.repeat(32), mode, inputKind: 'touch' });
    const all: SimEvent[] = [...sim.drainEvents()];
    let t = 0;
    while (!sim.isOver() && t < 1200) {
      const cmds: Command[] = [];
      const ver = sim.snapshot().birds.find((b) => b.plane === 'ver' && b.hittable);
      const p = ver === undefined ? null : sightPicture(c, ver);
      if (t % 60 === 1 && p !== null)
        cmds.push({ t: 'cameraTarget', cx: p.cx }, { t: 'aimStart', dx: p.dx, sy: p.sy });
      else if (t % 60 > 1 && t % 60 < 40 && p !== null && sim.snapshot().aim !== null)
        cmds.push({ t: 'aimMove', dx: p.dx, sy: p.sy });
      else if (t % 60 === 40) cmds.push({ t: 'aimRelease' });
      if (t === 300) cmds.push({ t: 'zoom', step: 0 });
      if (t === 500) cmds.push({ t: 'aimStart', dx: 10, sy: 400 }, { t: 'aimCancel' });
      rec.record(sim.tick, cmds);
      sim.step(cmds);
      all.push(...sim.drainEvents());
      t++;
    }
    while (!sim.isOver()) {
      sim.step([]);
      all.push(...sim.drainEvents());
    }
    expect(ofType(all, 'shotFired').length).toBeGreaterThanOrEqual(5);
    const log = decodeInputLogText(encodeInputLogText(rec.toLog()));
    expect(log.v).toBe(5);
    expect(log.mode.sight).toBe('scope_small');
    expect(log.commands.some(([, cmd]) => cmd.t === 'aimMove')).toBe(true);
    const replay = runReplay(log, c);
    expect(replay.eventHash).toBe(hashEvents(all));
    expect(replay.result.score).toBe(sim.result().score);
  });
});
