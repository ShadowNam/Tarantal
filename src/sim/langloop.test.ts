// v1.4 (D-038) Die Langloop: the variable scope's zoom commands (quantised, recorded), the very
// loud shot that alerts every flock, the bolt and the magazine change, and its replays.
import { describe, expect, it } from 'vitest';
import { base, karooOf, newSim, ofType, quiet, run, type Content } from '../../tools/simHarness';
import { sanitiseCommand } from './commands';
import { hashEvents, type SimEvent } from './events';
import { createRecorder, decodeInputLogText, encodeInputLogText } from './replay/inputLog';
import { runReplay } from './replay/verify';
import { createSim } from './Sim';
import type { Command, ModeConfig } from './types';
import { TICKS_PER_SECOND } from './clock';

const langloop = base.weapons.weapons.find((w) => w.id === 'langloop');
const scopeVar = base.weapons.sights.find((s) => s.id === 'scope_var');

const dieVerste = (weapon = 'langloop'): ModeConfig => ({
  id: 'classic',
  layout: 'mon',
  bonus: 'dieVerste',
  weapon,
  ...(weapon === 'langloop' ? { sight: 'scope_var' } : {}),
});

/** Quiet Karoo with flocks on near, mid and far, on a plain map (no Ver). */
function threeFlocks(): Content {
  const c = quiet();
  const karoo = karooOf(c);
  for (const k of karoo.pacing.keyframes) k.flocks = { near: 1, mid: 1, far: 1 };
  return c;
}

const plain = (weapon: string, sight?: string): ModeConfig => ({
  id: 'classic',
  layout: 'mon',
  weapon,
  ...(sight === undefined ? {} : { sight }),
});

describe('Die Langloop content (D-038)', () => {
  it('3 rounds, 1.5 s magazine change, 0.8 s bolt, very loud, reaches Ver ×2, scope 3–9×', () => {
    expect(langloop).toMatchObject({
      magazine: 3,
      reloadMs: 1500,
      perShellReload: false,
      fireCooldownMs: 800,
      alertsAllFlocks: true,
      reachesVer: true,
      unlock: { type: 'challenge', id: 'unlock_die_verste' },
    });
    expect(langloop?.kind === 'primary' && langloop.scoreMul.ver).toBe(2);
    expect(scopeVar?.zoom).toEqual([3, 6, 9]);
    expect(scopeVar?.picture).toBe('scope_range');
  });
});

describe('variable scope zoom commands (Tech §3.3)', () => {
  it('quantise to an integer step and clamp to the scope (out-of-range steps change nothing)', () => {
    expect(sanitiseCommand({ t: 'zoom', step: 1.8 })).toEqual({ t: 'zoom', step: 1 });
    expect(sanitiseCommand({ t: 'zoom', step: Number.NaN })).toBeNull();
    const sim = newSim(quiet(), dieVerste());
    expect(sim.snapshot().weapon).toMatchObject({ sight: 'scope_var', zoomStep: 0 });
    const ev = run(sim, 1, [{ t: 'zoom', step: 1 }]);
    expect(ofType(ev, 'zoomChanged')).toEqual([{ type: 'zoomChanged', tick: 0, step: 1, zoom: 6 }]);
    run(sim, 1, [{ t: 'zoom', step: 7 }]);
    expect(sim.snapshot().weapon.zoomStep).toBe(2);
    // A negative step is not a step at all: the command is dropped.
    expect(sanitiseCommand({ t: 'zoom', step: -4 })).toBeNull();
    run(sim, 1, [{ t: 'zoom', step: 0 }]);
    expect(sim.snapshot().weapon.zoomStep).toBe(0);
    // The same step again sends no event.
    expect(ofType(run(sim, 1, [{ t: 'zoom', step: 0 }]), 'zoomChanged')).toHaveLength(0);
  });

  it('a step while the sight is up changes the zoom at once; the aim point stays', () => {
    const sim = newSim(quiet(), dieVerste());
    run(sim, 1, [{ t: 'aimStart', dx: -120, sy: 480 }]);
    expect(sim.snapshot().aim).toMatchObject({ zoom: 3, dx: -120, sy: 480 });
    run(sim, 1, [{ t: 'zoom', step: 2 }]);
    expect(sim.snapshot().aim).toMatchObject({ zoom: 9, dx: -120, sy: 480 });
    run(sim, 1, [{ t: 'zoom', step: 1 }]);
    expect(sim.snapshot().aim?.zoom).toBe(6);
    // The next raise starts at the last step.
    run(sim, 1, [{ t: 'aimCancel' }]);
    run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 500 }]);
    expect(sim.snapshot().aim?.zoom).toBe(6);
  });
});

/** Flock ids of the birds on screen and off (flyovers and pop-ups have none). */
const flockIds = (sim: ReturnType<typeof newSim>): number[] =>
  sim
    .snapshot()
    .birds.map((b) => b.flockId)
    .filter((id): id is number => id !== null);

describe('a very loud shot (alertsAllFlocks)', () => {
  /** Flocks threatened by one shot into empty sky (no flock near the shot). */
  function threatenedBy(weapon: string, sight?: string): number[] {
    const sim = newSim(threeFlocks(), plain(weapon, sight), 9);
    run(sim, 240);
    const flocks = new Set(flockIds(sim));
    expect(flocks.size).toBeGreaterThanOrEqual(2);
    const cmds: Command[] =
      sight === undefined ? [{ t: 'fire', dx: 0, sy: 40 }] : [{ t: 'aimStart', dx: 0, sy: 40 }];
    const ev = [...run(sim, 1, cmds)];
    if (sight !== undefined) ev.push(...run(sim, 40), ...run(sim, 1, [{ t: 'aimRelease' }]));
    expect(ofType(ev, 'shotFired')).toHaveLength(1);
    return [...new Set(ofType(ev, 'flockThreatened').map((e) => e.flockId))].sort();
  }

  it('alerts every flock wherever it is; the .22 alerts none of them from the empty sky', () => {
    const sim = newSim(threeFlocks(), plain('langloop', 'scope_var'), 9);
    run(sim, 240);
    const all = [...new Set(flockIds(sim))].sort();
    expect(threatenedBy('langloop', 'scope_var')).toEqual(all);
    expect(threatenedBy('twee_twee', 'iron')).toEqual([]);
  });

  it('threatens each flock once per shot', () => {
    const sim = newSim(threeFlocks(), plain('langloop', 'scope_var'), 9);
    run(sim, 240);
    run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 40 }]);
    run(sim, 40);
    const ev = run(sim, 1, [{ t: 'aimRelease' }]);
    const ids = ofType(ev, 'flockThreatened').map((e) => e.flockId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('bolt and magazine timing', () => {
  it('a 0.8 s bolt between shots; three rounds, then a 1.5 s magazine change', () => {
    const sim = newSim(quiet(), plain('langloop', 'scope_var'));
    const bolt = Math.round(0.8 * TICKS_PER_SECOND);
    const reload = Math.round(1.5 * TICKS_PER_SECOND);
    const fireAt: number[] = [];
    for (let t = 0; t < 400 && fireAt.length < 3; t++) {
      // A hip shot (press and release in one tick) as soon as the bolt allows.
      const ev = run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 40 }, { t: 'aimRelease' }]);
      if (ofType(ev, 'shotFired').length > 0) fireAt.push(t);
    }
    expect(fireAt).toHaveLength(3);
    const [a = 0, b = 0, c = 0] = fireAt;
    expect([b - a, c - b]).toEqual([bolt, bolt]);
    expect(sim.snapshot().weapon.shells).toBe(0);
    const started = run(sim, 1, [{ t: 'reload' }]);
    expect(ofType(started, 'reloadStarted')).toHaveLength(1);
    const during = run(sim, reload - 2);
    expect(ofType(during, 'reloadFinished')).toHaveLength(0);
    const done = run(sim, 2);
    expect(ofType(done, 'reloadFinished')[0]?.shells).toBe(3);
  });
});

describe('a zoomed Langloop hunt on Die Verste replays identically', () => {
  it('records the zoom steps and replays the same events and score', () => {
    const mode = dieVerste();
    const sim = createSim({ seed: 38, content: base, mode, inputKind: 'pointer' });
    const rec = createRecorder({
      seed: 38,
      contentHash: 'cd'.repeat(32),
      mode,
      inputKind: 'pointer',
    });
    const all: SimEvent[] = [...sim.drainEvents()];
    let t = 0;
    while (!sim.isOver() && t < 2400) {
      const cmds: Command[] = [];
      const phase = t % 90;
      if (phase === 1) cmds.push({ t: 'aimStart', dx: ((t * 37) % 900) - 450, sy: 380 });
      else if (phase === 20) cmds.push({ t: 'zoom', step: (t / 90) % 3 });
      else if (phase > 20 && phase < 60 && phase % 6 === 0)
        cmds.push({ t: 'aimMove', dx: ((t * 37) % 900) - 450 + phase, sy: 380 + phase / 3 });
      else if (phase === 60) cmds.push({ t: 'aimRelease' });
      else if (phase === 70 && sim.snapshot().weapon.shells === 0) cmds.push({ t: 'reload' });
      rec.record(sim.tick, cmds);
      sim.step(cmds);
      all.push(...sim.drainEvents());
      t++;
    }
    while (!sim.isOver()) {
      sim.step([]);
      all.push(...sim.drainEvents());
    }
    expect(ofType(all, 'zoomChanged').length).toBeGreaterThanOrEqual(10);
    expect(ofType(all, 'shotFired').length).toBeGreaterThanOrEqual(10);
    const log = decodeInputLogText(encodeInputLogText(rec.toLog()));
    expect(log.mode).toMatchObject({ weapon: 'langloop', sight: 'scope_var', bonus: 'dieVerste' });
    const replay = runReplay(log, base);
    expect(replay.eventHash).toBe(hashEvents(all));
    expect(replay.result.score).toBe(sim.result().score);
  });
});
