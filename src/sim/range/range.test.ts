// v1.3x (D-037) Skietbaan: the range mode through the real sim — endless, unscored, no Frenzy,
// unlimited reserve ammo, its spawn program, paper targets, reach, and determinism.
import { describe, expect, it } from 'vitest';
import { base, ofType, type Content } from '../../../tools/simHarness';
import { planeToDx } from '../camera';
import { msToTicks } from '../clock';
import { hashEvents, type SimEvent } from '../events';
import { createSim, type Sim } from '../Sim';
import { WEEKDAY_IDS } from '../../content/schemas';
import type { Command, ModeConfig, PlaneId, RangeConfig, RangeTarget } from '../types';
import { createRangeProgram } from './program';

const content = base as Content;
const setup = content.modes.modes.range;
const PLANE_IDS: readonly PlaneId[] = ['near', 'mid', 'far', 'ver'];
const TARGETS: readonly RangeTarget[] = ['paper', 'stand', 'flyover', 'flock'];

function rangeMode(range: RangeConfig, extra: Partial<ModeConfig> = {}): ModeConfig {
  return { id: 'range', biome: 'karoo-autumn', layout: 'mon', range, ...extra };
}

function rangeSim(
  range: RangeConfig,
  extra: Partial<ModeConfig> = {},
  seed = 7,
  inputKind: 'pointer' | 'touch' = 'pointer',
): Sim {
  return createSim({
    seed,
    content,
    mode: rangeMode(range, extra),
    inputKind,
    rangeProgram: createRangeProgram,
  });
}

function step(sim: Sim, ticks: number, first: readonly Command[] = []): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step(i === 0 ? first : []);
    out.push(...sim.drainEvents());
  }
  return out;
}

const sf = (plane: PlaneId): number => content.scoring.planes[plane].scrollFactor;

/** A fire command at a plane point for the sim's current camera. */
function fireAt(sim: Sim, plane: PlaneId, x: number, y: number): Command {
  return { t: 'fire', dx: planeToDx(sim.snapshot().cameraX, sf(plane), x), sy: y };
}

function paperOf(sim: Sim): { x: number; y: number; r: number; plane: PlaneId } {
  const p = sim.snapshot().range?.papers[0];
  if (p === undefined) throw new Error('no paper target');
  return p;
}

/** Fires and waits until the gun can fire again (reloading when the belt is empty). */
function shoot(sim: Sim, cmd: Command, wait = 150): SimEvent[] {
  const ev = step(sim, 1, [cmd]);
  const w = sim.snapshot().weapon;
  const more = w.shells === 0 && !w.reloading ? [{ t: 'reload' } as const] : [];
  return [...ev, ...step(sim, wait, more)];
}

describe('range mode', () => {
  it('needs its spawn program, and only mode range takes a range block', () => {
    expect(() =>
      createSim({
        seed: 1,
        content,
        mode: rangeMode({ plane: 'mid', target: 'paper' }),
        inputKind: 'pointer',
      }),
    ).toThrow(/spawn program/);
    expect(() =>
      createSim({
        seed: 1,
        content,
        mode: { id: 'classic', range: { plane: 'mid', target: 'paper' } },
        inputKind: 'pointer',
        rangeProgram: createRangeProgram,
      }),
    ).toThrow(/range/);
  });

  it('is endless: no clock, no end, no gadget, no world events, crates or secrets', () => {
    const sim = rangeSim({ plane: 'mid', target: 'stand' });
    const ev = step(sim, 60 * 200);
    expect(sim.isOver()).toBe(false);
    expect(ofType(ev, 'huntEnded')).toHaveLength(0);
    expect(ofType(ev, 'worldEvent')).toHaveLength(0);
    expect(ofType(ev, 'crateSpawned')).toHaveLength(0);
    expect(ofType(ev, 'stampedeStarted')).toHaveLength(0);
    const s = sim.snapshot();
    expect(s.gadget).toBeNull();
    expect(s.secrets).toEqual([]);
    expect(s.wind).toBeNull();
    // Only the range's own bird: no director fly-overs, pop-ups or flocks.
    expect(s.birds).toHaveLength(1);
    expect(s.flocks).toHaveLength(0);
  });

  it('scores nothing and has no Frenzy, but counts bags', () => {
    const sim = rangeSim({ plane: 'near', target: 'stand' });
    let all: SimEvent[] = [];
    for (let i = 0; i < 6; i++) {
      const b = sim.snapshot().birds[0];
      if (b === undefined) {
        all = all.concat(step(sim, 120));
        continue;
      }
      all = all.concat(shoot(sim, fireAt(sim, 'near', b.x, b.y + 10)));
    }
    expect(ofType(all, 'targetBagged').length).toBeGreaterThan(0);
    expect(ofType(all, 'scoreAwarded')).toHaveLength(0);
    expect(ofType(all, 'comboChanged')).toHaveLength(0);
    expect(ofType(all, 'bonusAwarded')).toHaveLength(0);
    expect(sim.snapshot().score).toBe(0);
    expect(sim.snapshot().streak).toBe(0);
    expect(sim.result().bagged).toBe(ofType(all, 'targetBagged').length);
  });

  it('reloads as in a hunt, from an endless reserve', () => {
    const sim = rangeSim({ plane: 'mid', target: 'paper' });
    const p = paperOf(sim);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 30; i++) ev = ev.concat(shoot(sim, fireAt(sim, 'mid', p.x, p.y)));
    expect(ofType(ev, 'shotFired')).toHaveLength(30);
    expect(ofType(ev, 'reloadStarted').length).toBeGreaterThanOrEqual(3);
    expect(ofType(ev, 'emptyClick')).toHaveLength(0);
  });
});

describe('paper targets', () => {
  it('stand at their spot on every plane, sized by the plane', () => {
    for (const plane of PLANE_IDS) {
      const sim = rangeSim({ plane, target: 'paper' });
      const s = sim.snapshot();
      const p = paperOf(sim);
      const spot = setup.spots[plane].paper[0];
      expect(spot).toBeDefined();
      expect(p.plane).toBe(plane);
      expect(planeToDx(s.cameraX, sf(plane), p.x)).toBeCloseTo(spot?.dx ?? NaN, 6);
      expect(p.y).toBe(spot?.y);
      expect(p.r).toBeCloseTo(setup.paperRadiusPx * content.scoring.planes[plane].scale, 9);
      expect(s.birds).toHaveLength(0);
    }
  });

  it('take pellets where they strike, measured on the plane, and report the aim point', () => {
    const sim = rangeSim({ plane: 'mid', target: 'paper' }, { weapon: 'dubbelloop' });
    const p = paperOf(sim);
    const ev = shoot(sim, fireAt(sim, 'mid', p.x, p.y));
    const aim = ofType(ev, 'rangeShot');
    expect(aim).toHaveLength(1);
    expect(aim[0]?.x).toBeCloseTo(p.x, 6);
    expect(aim[0]?.y).toBeCloseTo(p.y, 6);
    const hits = ofType(ev, 'paperHit');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(Math.hypot(h.x - p.x, h.y - p.y)).toBeLessThanOrEqual(p.r + 1e-9);
      expect(h.shotId).toBe(aim[0]?.shotId);
    }
    // Every pellet on the paper is a pelletImpact that names it.
    expect(ofType(ev, 'pelletImpact').filter((e) => e.paperId === 1)).toHaveLength(hits.length);
    expect(ofType(ev, 'miss')).toHaveLength(0);
  });

  it('miss a shot that goes wide', () => {
    const sim = rangeSim({ plane: 'mid', target: 'paper' }, { weapon: 'windbuks' });
    const p = paperOf(sim);
    const ev = shoot(sim, fireAt(sim, 'mid', p.x + p.r * 3, p.y));
    expect(ofType(ev, 'paperHit')).toHaveLength(0);
  });

  it('are free of props at the range camera on every biome and weekday light', () => {
    // A single pellet at each paper's centre must hit it (nothing stands in front).
    for (const biome of content.biomes) {
      for (const layout of WEEKDAY_IDS) {
        for (const plane of PLANE_IDS) {
          const sim = createSim({
            seed: 1,
            content,
            mode: {
              id: 'range',
              biome: biome.id,
              layout,
              // Spread-free guns: the windbuks, and the .22 (sight up) where only it reaches.
              weapon: plane === 'ver' ? 'twee_twee' : 'windbuks',
              range: { plane, target: 'paper' },
            },
            inputKind: 'pointer',
            rangeProgram: createRangeProgram,
          });
          const p = paperOf(sim);
          const hit = centreHit(sim, plane, p.x, p.y);
          expect(hit, `${biome.id} ${layout} ${plane}`).toBe(true);
        }
      }
    }
  });
});

/** True when a sway-free, spread-free pellet at (x, y) lands on the paper. */
function centreHit(sim: Sim, plane: PlaneId, x: number, y: number): boolean {
  sim.step([{ t: 'aimCancel' }]);
  sim.drainEvents();
  const w = sim.snapshot().weapon;
  if (w.sight === null) {
    const ev = step(sim, 1, [fireAt(sim, plane, x, y)]);
    return ofType(ev, 'paperHit').length === 1;
  }
  // A rifle: raise the sight and release when the sway is smallest (test the geometry only).
  const dx = planeToDx(sim.snapshot().cameraX, sf(plane), x);
  step(sim, 1, [{ t: 'aimStart', dx, sy: y }]);
  for (let i = 0; i < 600; i++) {
    const a = sim.snapshot().aim;
    if (a !== null && a.progress >= 1 && Math.hypot(a.swayDx, a.swayDy) < 0.5) break;
    step(sim, 1);
  }
  const ev = step(sim, 1, [{ t: 'aimRelease' }]);
  return ofType(ev, 'paperHit').length === 1;
}

describe('reach', () => {
  it('shotguns, the air rifle and the Kettie fall short of the Ver plane; the .22 reaches it', () => {
    for (const weapon of ['dubbelloop', 'pomp', 'windbuks', 'kettie']) {
      const sim = rangeSim({ plane: 'ver', target: 'paper' }, { weapon });
      const p = paperOf(sim);
      let ev: SimEvent[] = [];
      for (let i = 0; i < 6; i++) ev = ev.concat(shoot(sim, fireAt(sim, 'ver', p.x, p.y), 200));
      expect(ofType(ev, 'shotFired').length, weapon).toBe(6);
      expect(ofType(ev, 'paperHit'), weapon).toHaveLength(0);
    }
    const rifle = rangeSim(
      { plane: 'ver', target: 'paper' },
      { weapon: 'twee_twee', sight: 'scope_small' },
    );
    const p = paperOf(rifle);
    expect(centreHit(rifle, 'ver', p.x, p.y)).toBe(true);
  });
});

describe('crate guns on the range', () => {
  it('the Voorlaaier stays in hand: its 3 shots come back, the ramrod reload still runs', () => {
    const sim = rangeSim({ plane: 'near', target: 'paper', crate: 'voorlaaier' });
    expect(sim.snapshot().weapon.id).toBe('voorlaaier');
    // Handed over at the start, once.
    expect(ofType(sim.drainEvents(), 'weaponChanged')).toEqual([
      { type: 'weaponChanged', tick: 0, weapon: 'voorlaaier', kind: 'crate' },
    ]);
    const p = paperOf(sim);
    const reload = msToTicks(
      content.weapons.weapons.find((w) => w.id === 'voorlaaier')?.reloadMs ?? 0,
    );
    let fired = 0;
    for (let i = 0; i < 7; i++) {
      const ev = step(sim, reload + 2, [fireAt(sim, 'near', p.x, p.y)]);
      fired += ofType(ev, 'shotFired').length;
      expect(ofType(ev, 'weaponChanged')).toHaveLength(0);
    }
    expect(fired).toBe(7);
    expect(sim.snapshot().weapon.id).toBe('voorlaaier');
    // Faster than the ramrod: blocked.
    const ev = [
      ...step(sim, 1, [fireAt(sim, 'near', p.x, p.y)]),
      ...step(sim, 1, [fireAt(sim, 'near', p.x, p.y)]),
    ];
    expect(ofType(ev, 'shotFired')).toHaveLength(1);
  });

  it('the Mielie-Masjien never runs out of time', () => {
    const sim = rangeSim({ plane: 'mid', target: 'paper', crate: 'mielie_masjien' });
    expect(ofType(sim.drainEvents(), 'weaponChanged')).toHaveLength(1);
    const p = paperOf(sim);
    const dx = planeToDx(sim.snapshot().cameraX, sf('mid'), p.x);
    const ev = step(sim, 60 * 25, [{ t: 'fireHoldStart', dx, sy: p.y }]);
    expect(sim.snapshot().weapon.id).toBe('mielie_masjien');
    expect(ofType(ev, 'weaponChanged')).toHaveLength(0);
    expect(ofType(ev, 'shotFired').length).toBeGreaterThan(300);
  });

  it('rejects a primary as the crate gun', () => {
    expect(() => rangeSim({ plane: 'near', target: 'paper', crate: 'pomp' })).toThrow(/crate/);
  });
});

describe('determinism', () => {
  /** A busy session: shots at the target, pans, reloads, a rifle's aim on the .22. */
  function session(
    range: RangeConfig,
    weapon: string,
    seed: number,
    kind: 'pointer' | 'touch',
  ): string {
    const sim = rangeSim(range, { weapon }, seed, kind);
    const all: SimEvent[] = [...sim.drainEvents()];
    for (let t = 0; t < 60 * 40; t++) {
      const cmds: Command[] = [];
      const s = sim.snapshot();
      const target = s.range?.papers[0] ?? s.birds[0];
      if (t % 37 === 0 && target !== undefined)
        cmds.push(fireAt(sim, target.plane, target.x + ((t * 7) % 31) - 15, target.y));
      if (t % 211 === 0) cmds.push({ t: 'reload' });
      if (t % 500 === 250) cmds.push({ t: 'cameraTarget', cx: s.cameraX + 40 });
      sim.step(cmds);
      all.push(...sim.drainEvents());
    }
    return hashEvents(all);
  }

  it('the same seed, content and commands give the same events, for every target and plane', () => {
    for (const plane of PLANE_IDS) {
      for (const target of TARGETS) {
        const weapon = plane === 'ver' ? 'twee_twee' : 'dubbelloop';
        const a = session({ plane, target }, weapon, 11, 'touch');
        const b = session({ plane, target }, weapon, 11, 'touch');
        expect(a, `${plane} ${target}`).toBe(b);
      }
    }
    // Another seed is another session (the fly-over bob and the flock draw from 'range').
    expect(session({ plane: 'mid', target: 'flock' }, 'dubbelloop', 11, 'pointer')).not.toBe(
      session({ plane: 'mid', target: 'flock' }, 'dubbelloop', 12, 'pointer'),
    );
  });
});
