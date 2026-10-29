// v1.7d (D-059): Namibië's ostriches from content — every map has its pair (most with the
// nest); the same seed gives the same behaviour; they walk, peck, look round, swap on the nest
// and the male displays; a nearby shot sends them running and they come back; a shot ostrich or
// nest costs points (with the cooldown) and nothing is removed; a loud gun makes them run.
import { describe, expect, it } from 'vitest';
import { aimAt, ofType, quiet, run, settle, type Content } from '../../tools/simHarness';
import type { SimEvent } from './events';
import { createSim, type Sim } from './Sim';
import type { Command, ModeConfig, OstrichFamilyView, OstrichView } from './types';
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';

const NAM = 'namibie';
const day = (layout = 'tue', extra: Partial<ModeConfig> = {}): ModeConfig => ({
  id: 'classic',
  biome: NAM,
  layout,
  ...extra,
});

function sim(c: Content, mode: ModeConfig = day(), seed = 7): Sim {
  return createSim({ seed, content: c, mode, inputKind: 'pointer' });
}

const family = (s: Sim, i = 0): OstrichFamilyView => {
  const f = s.snapshot().ostriches[i];
  if (f === undefined) throw new Error('no ostriches');
  return f;
};

const sfOf = (c: Content, f: OstrichFamilyView): number => c.scoring.planes[f.plane].scrollFactor;

/** The camera centre that puts layer x in the middle of the screen. */
function centreOn(c: Content, f: OstrichFamilyView, x: number): number {
  const camera = (x - 960) / sfOf(c, f) + 960;
  return Math.round(Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, camera)) * 2) / 2;
}

function lookAt(s: Sim, c: Content, ticks: number): SimEvent[] {
  const f = family(s);
  const cam: Command[] = [
    { t: 'cameraTarget', cx: centreOn(c, f, f.nest?.x ?? f.birds[0]?.x ?? 0) },
  ];
  return run(s, ticks, cam);
}

function reloaded(s: Sim): void {
  if (s.snapshot().weapon.shells > 0) return;
  run(s, 1, [{ t: 'reload' }]);
  for (let i = 0; i < 600 && s.snapshot().weapon.reloading; i++) run(s, 1);
}

/** Fires at a standing or sitting ostrich's body. */
function shootBird(s: Sim, c: Content, b: OstrichView, f: OstrichFamilyView): SimEvent[] {
  const T = c.birds.ostriches;
  const box = b.pose === 'sit' ? T.hitboxes.sit.body : T.hitboxes.stand.body;
  reloaded(s);
  lookAt(s, c, 1);
  settle(s);
  const now = family(s).birds.find((x) => x.id === b.id) ?? b;
  return run(
    s,
    1,
    aimAt(sfOf(c, f), now.x + box.ox * f.scale * now.facing, f.ground + box.oy * f.scale),
  );
}

const trace = (s: Sim, ticks: number): string => {
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) {
    run(s, 1);
    if (i % 15 === 0)
      out.push(
        s
          .snapshot()
          .ostriches.map((f) => f.birds.map((b) => `${b.id}${b.pose}${Math.round(b.x)}`).join(','))
          .join('|'),
      );
  }
  return out.join(';');
};

describe('ostriches (v1.7d, D-059)', () => {
  it('every Namibië map has a pair with its nest; other biomes none', () => {
    const c = quiet(NAM);
    for (const layout of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      const s = sim(c, day(layout));
      const fams = s.snapshot().ostriches;
      expect(fams.length).toBeGreaterThanOrEqual(1);
      expect(fams.length).toBeLessThanOrEqual(2);
      const [first] = fams;
      expect(first?.nest).not.toBeNull();
      expect(first?.nest?.eggs).toBeGreaterThanOrEqual(8);
      expect(first?.nest?.eggs).toBeLessThanOrEqual(15);
      for (const f of fams) {
        expect(f.birds.map((b) => b.male)).toEqual([true, false]);
        expect(f.plane).toBe('mid');
      }
      // By day the female sits first, the male guards.
      expect(first?.birds.find((b) => !b.male)?.pose).toBe('sit');
      expect(ofType(s.drainEvents(), 'ostrichesSpawned')).toHaveLength(fams.length);
    }
    expect(sim(quiet(), { id: 'classic' }).snapshot().ostriches).toEqual([]);
  });

  it('the same seed gives the same behaviour; another seed differs', () => {
    const c = quiet(NAM);
    const a = trace(sim(c, day(), 11), 1800);
    expect(trace(sim(c, day(), 11), 1800)).toBe(a);
    expect(trace(sim(c, day(), 12), 1800)).not.toBe(a);
  });

  it('over a hunt they walk, peck, look round and swap on the nest, and the male displays', () => {
    const c = quiet(NAM);
    c.birds.ostriches.activities.display = 3;
    const s = sim(c, day('tue'), 3);
    const seen = new Set<string>();
    const calls: SimEvent[] = [];
    let maleSat = false;
    for (let i = 0; i < 85 * 60 && !s.isOver(); i++) {
      calls.push(...ofType(run(s, 1), 'ostrichCall'));
      for (const b of family(s).birds) {
        seen.add(b.pose);
        if (b.male && b.pose === 'sit') maleSat = true;
      }
      // Never both on the eggs at once, and the sitter sits on the nest.
      const f = family(s);
      expect(f.birds.filter((b) => b.pose === 'sit').length).toBeLessThanOrEqual(1);
      for (const b of f.birds) if (b.pose === 'sit') expect(b.x).toBe(f.nest?.x);
    }
    for (const p of ['sit', 'walk', 'peck', 'look', 'display']) expect(seen, p).toContain(p);
    expect(calls.some((e) => e.type === 'ostrichCall' && e.call === 'swap')).toBe(true);
    expect(calls.some((e) => e.type === 'ostrichCall' && e.call === 'display')).toBe(true);
    expect(maleSat).toBe(true);
  });

  it('a nearby shot makes them run a short way at full speed and come back to the nest', () => {
    const c = quiet(NAM);
    const s = sim(c, day('tue'), 5);
    lookAt(s, c, 30);
    const f = family(s);
    const right = Math.max(...f.birds.map((b) => b.x), f.nest?.x ?? 0);
    reloaded(s);
    settle(s);
    // Into the sand just right of the pair: close enough to scare them, hitting nothing.
    const ev = run(s, 1, aimAt(sfOf(c, f), right + 160 * f.scale, f.ground - 10));
    expect(ofType(ev, 'ostrichHit')).toHaveLength(0);
    const ran = ofType(ev, 'ostrichesRan');
    expect(ran).toHaveLength(1);
    expect(ran[0]?.cause).toBe('shot');
    expect(family(s).birds.every((b) => b.pose === 'run')).toBe(true);
    // Full speed: a stride of runPxPerSec × scale per second.
    const x0 = family(s).birds.map((b) => b.x);
    run(s, 6);
    const moved = family(s).birds.map((b, i) => Math.abs(b.x - (x0[i] ?? 0)));
    for (const m of moved)
      expect(m).toBeCloseTo((c.birds.ostriches.runPxPerSec * f.scale * 6) / 60, 0);
    // Back on the nest within a few seconds.
    let back = false;
    for (let i = 0; i < 12 * 60 && !back; i++) {
      run(s, 1);
      back = family(s).birds.some((b) => b.pose === 'sit');
    }
    expect(back).toBe(true);
  });

  it('a shot ostrich or nest costs the penalty (with the cooldown); nothing is removed', () => {
    const c = quiet(NAM);
    const T = c.birds.ostriches;
    const s = sim(c, day('tue'), 9);
    lookAt(s, c, 30);
    const f = family(s);
    const guard = f.birds.find((b) => !b.sitter);
    if (guard === undefined) throw new Error('no guard');
    const before = s.snapshot().score;
    const ev = shootBird(s, c, guard, f);
    const hits = ofType(ev, 'ostrichHit');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.points).toBe(-T.hit.penalty);
    expect(hits[0]?.nest).toBe(false);
    expect(s.snapshot().score).toBe(before - T.hit.penalty);
    expect(ofType(ev, 'ostrichesRan')[0]?.cause).toBe('hit');
    const hit = family(s).birds.find((b) => b.id === guard.id);
    expect(hit?.pose).toBe('hiss');
    // Inside the cooldown a second hit is free; the pair stays two birds and a nest.
    const sitter = family(s).birds.find((b) => b.sitter);
    if (sitter === undefined) throw new Error('no sitter');
    const n = family(s).nest;
    const again = run(
      s,
      1,
      aimAt(
        sfOf(c, f),
        (n?.x ?? 0) + T.hitboxes.nest.ox * f.scale,
        f.ground + T.hitboxes.nest.oy * f.scale,
      ),
    );
    for (const h of ofType(again, 'ostrichHit')) expect(h.points).toBe(0);
    expect(family(s).birds).toHaveLength(2);
    expect(family(s).nest).not.toBeNull();
    // After the cooldown, the nest costs the penalty too.
    run(s, Math.ceil(T.hit.cooldownSeconds * 60) + 240);
    reloaded(s);
    lookAt(s, c, 1);
    settle(s);
    const fam = family(s);
    const nestHit = ofType(
      run(
        s,
        1,
        aimAt(
          sfOf(c, fam),
          (fam.nest?.x ?? 0) + T.hitboxes.nest.ox * fam.scale,
          fam.ground + T.hitboxes.nest.oy * fam.scale,
        ),
      ),
      'ostrichHit',
    );
    expect(nestHit.length).toBe(1);
    expect(nestHit[0]?.points).toBe(-T.hit.penalty);
  });

  it('the Langloop makes them run', () => {
    const c = quiet(NAM);
    const s = sim(c, day('tue', { weapon: 'langloop' }), 4);
    // Far off to the side, into the empty sky.
    reloaded(s);
    settle(s);
    const ev = run(s, 1, [{ t: 'fire', dx: 0, sy: 150 }]);
    expect(ofType(ev, 'ostrichesRan').map((e) => e.cause)).toEqual(['loud']);
  });
});
