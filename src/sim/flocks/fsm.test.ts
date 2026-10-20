// Every flock FSM transition (GDD §6.1, Tech §3.5, D-020).
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { behaviourOf } from '../birds/Bird';
import { msToTicks } from '../clock';
import type { Flock, FlockParams } from './Flock';
import { applyThreat, forceState, tickFsm, type Transition } from './fsm';
import { moveFlock } from './steering';
import { makeFlock } from './testing';
import type { RandomStream } from '../rng';

const content = loadContent();
const d = content.birds.flockDefaults;
const WINDOW = msToTicks(d.escalationWindowMs);

/** Ticks the flock (FSM then steering) until `pred` holds; returns the transitions seen. */
function runUntil(
  f: Flock,
  p: FlockParams,
  rng: RandomStream,
  pred: () => boolean,
  max = 3000,
): Transition[] {
  const seen: Transition[] = [];
  for (let i = 0; i < max && !pred(); i++) {
    const t = tickFsm(f, p, rng);
    if (t) seen.push(t);
    moveFlock(f, p, rng);
  }
  if (!pred()) throw new Error('condition never reached');
  return seen;
}

describe('flock FSM', () => {
  it('FORAGE → ALERT on a threat: window opens, birds freeze 0.6–1.2 s, behaviour +0', () => {
    const { flock, params, rng } = makeFlock(content);
    expect(flock.members.map(behaviourOf)).toEqual(Array(6).fill('forage'));
    const t = applyThreat(flock, 1000, params, rng);
    expect(t).toEqual({ from: 'forage', to: 'alert', cause: 'threat' });
    expect(flock.windowTicks).toBe(WINDOW);
    expect(flock.freezeTicks).toBeGreaterThanOrEqual(msToTicks(d.alertMs[0]));
    expect(flock.freezeTicks).toBeLessThanOrEqual(msToTicks(d.alertMs[1]));
    expect(flock.members.every((b) => b.phase === 'alert')).toBe(true);
    expect(flock.members.map(behaviourOf)).toEqual(Array(6).fill('alert'));
    // Frozen: nobody moves while the freeze lasts.
    const xs = flock.members.map((b) => b.x);
    tickFsm(flock, params, rng);
    moveFlock(flock, params, rng);
    expect(flock.members.map((b) => b.x)).toEqual(xs);
  });

  it('ALERT → FORAGE when the 1.5 s window expires without a second threat', () => {
    const { flock, params, rng } = makeFlock(content);
    applyThreat(flock, 1000, params, rng);
    for (let i = 0; i < WINDOW - 1; i++) expect(tickFsm(flock, params, rng)).toBeNull();
    expect(tickFsm(flock, params, rng)).toEqual({ from: 'alert', to: 'forage', cause: 'window' });
    expect(flock.members.every((b) => b.phase === 'walk')).toBe(true);
    // Calming down ends Whole Flock for this flock (D-020).
    expect(flock.eligible).toBe(false);
  });

  it('ALERT → RUN on a threat inside the window, away from the threat (+0.5)', () => {
    const { flock, params, rng } = makeFlock(content, { x: 1500 });
    applyThreat(flock, 1400, params, rng);
    for (let i = 0; i < WINDOW - 1; i++) tickFsm(flock, params, rng);
    expect(applyThreat(flock, 1400, params, rng)).toEqual({
      from: 'alert',
      to: 'run',
      cause: 'threat',
    });
    expect(flock.dir).toBe(1);
    expect(flock.windowTicks).toBe(WINDOW);
    expect(flock.members.map(behaviourOf)).toEqual(Array(6).fill('run'));
    const before = flock.members.reduce((s, b) => s + b.x, 0);
    for (let i = 0; i < 60; i++) {
      tickFsm(flock, params, rng);
      moveFlock(flock, params, rng);
    }
    const after = flock.members.reduce((s, b) => s + b.x, 0);
    expect(after).toBeGreaterThan(before);
  });

  it('RUN sprints at speeds.run (3–5× walk)', () => {
    const { flock, params, rng } = makeFlock(content);
    applyThreat(flock, 0, params, rng);
    applyThreat(flock, 0, params, rng);
    const m = flock.members[0]?.fm;
    if (!m) throw new Error('no member');
    expect(m.run / m.walk).toBeGreaterThanOrEqual(3);
    expect(m.run / m.walk).toBeLessThanOrEqual(5);
    for (let i = 0; i < 40; i++) {
      tickFsm(flock, params, rng);
      moveFlock(flock, params, rng);
    }
    const speeds = flock.members.map((b) => Math.abs(b.fm?.vx ?? 0));
    expect(Math.max(...speeds)).toBeGreaterThan(m.walk * 2);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(m.run * 1.01);
  });

  it('RUN → FLUSH on a threat inside the window: staggered 0–300 ms, 55–75° take-off', () => {
    const { flock, params, rng } = makeFlock(content, { size: 12 });
    applyThreat(flock, 1000, params, rng);
    applyThreat(flock, 1000, params, rng);
    expect(applyThreat(flock, 1000, params, rng)).toEqual({
      from: 'run',
      to: 'flush',
      cause: 'threat',
    });
    const fms = flock.members.map((b) => b.fm);
    for (const m of fms) {
      if (!m) throw new Error('no member');
      expect(m.launchTicks).toBeGreaterThanOrEqual(msToTicks(d.flushStaggerMs[0]));
      expect(m.launchTicks).toBeLessThanOrEqual(msToTicks(d.flushStaggerMs[1]));
      expect((m.angle * 180) / Math.PI).toBeGreaterThanOrEqual(d.flushAngleDeg[0] - 1e-9);
      expect((m.angle * 180) / Math.PI).toBeLessThanOrEqual(d.flushAngleDeg[1] + 1e-9);
      expect(m.flapTicks).toBeGreaterThanOrEqual(msToTicks(d.flightMs[0]));
      expect(m.flapTicks).toBeLessThanOrEqual(msToTicks(d.flightMs[1]));
    }
    // Staggered: not everyone leaves on the same tick.
    expect(new Set(fms.map((m) => m?.launchTicks)).size).toBeGreaterThan(1);
    // Steep: the first flapping tick climbs much more than it travels.
    runUntil(flock, params, rng, () => flock.members.some((b) => b.phase === 'flap'));
    const bird = flock.members.find((b) => b.phase === 'flap');
    const m = bird?.fm;
    if (!m) throw new Error('no flyer');
    expect(-m.vy).toBeGreaterThan(Math.abs(m.vx));
    expect(flock.members.filter((b) => b.phase === 'flap').map(behaviourOf)).toContain('flying');
  });

  it('a threat in RUN after the window closed reopens it but keeps running (D-020)', () => {
    const { flock, params, rng } = makeFlock(content);
    applyThreat(flock, 1000, params, rng);
    applyThreat(flock, 1000, params, rng);
    for (let i = 0; i < WINDOW; i++) tickFsm(flock, params, rng);
    expect(flock.state).toBe('run');
    expect(flock.windowTicks).toBe(0);
    const calmBefore = flock.calmTicks;
    expect(applyThreat(flock, 1000, params, rng)).toBeNull();
    expect(flock.state).toBe('run');
    expect(flock.windowTicks).toBe(WINDOW);
    expect(flock.calmTicks).toBeGreaterThanOrEqual(calmBefore);
    expect(applyThreat(flock, 1000, params, rng)?.to).toBe('flush');
  });

  it('RUN → SETTLE after 4–7 s without a threat, then SETTLE → FORAGE; Whole Flock ends', () => {
    const { flock, params, rng } = makeFlock(content);
    applyThreat(flock, 1000, params, rng);
    applyThreat(flock, 1000, params, rng);
    const calm = flock.calmTicks;
    expect(calm).toBeGreaterThanOrEqual(msToTicks(d.settleTimeoutMs[0]));
    expect(calm).toBeLessThanOrEqual(msToTicks(d.settleTimeoutMs[1]));
    let settledAt = -1;
    for (let i = 1; i <= calm; i++) {
      const t = tickFsm(flock, params, rng);
      moveFlock(flock, params, rng);
      if (t) {
        expect(t).toEqual({ from: 'run', to: 'settle', cause: 'timeout' });
        settledAt = i;
      }
    }
    expect(settledAt).toBe(calm);
    expect(flock.eligible).toBe(false);
    const seen = runUntil(flock, params, rng, () => flock.state === 'forage');
    expect(seen).toEqual([{ from: 'settle', to: 'forage', cause: 'settled' }]);
  });

  it('FLUSH → land → SETTLE → FORAGE: birds glide down into the ground lane', () => {
    const { flock, params, rng } = makeFlock(content, { x: 1900 });
    forceState(flock, 'flush', 1000, 'gadget', params, rng);
    const phases = new Set<string>();
    const seen = runUntil(flock, params, rng, () => {
      for (const b of flock.members) phases.add(b.phase);
      return flock.state === 'forage';
    });
    expect([...phases]).toEqual(expect.arrayContaining(['launch', 'flap', 'glide', 'land']));
    expect(seen).toEqual([
      { from: 'flush', to: 'settle', cause: 'landed' },
      { from: 'settle', to: 'forage', cause: 'settled' },
    ]);
    expect(flock.eligible).toBe(false);
    for (const b of flock.members) {
      expect(b.y).toBeGreaterThanOrEqual(flock.groundY[0]);
      expect(b.y).toBeLessThanOrEqual(flock.groundY[1]);
      expect(b.x).toBeGreaterThan(1900); // flew away from the threat
    }
  });

  it('flying birds climb into the sky lane but never above it', () => {
    const { flock, params, rng } = makeFlock(content);
    forceState(flock, 'flush', 0, 'gadget', params, rng);
    let top = Infinity;
    runUntil(flock, params, rng, () => {
      for (const b of flock.members) top = Math.min(top, b.y);
      return flock.state !== 'flush';
    });
    expect(top).toBeGreaterThanOrEqual(flock.skyY[0]);
    expect(top).toBeLessThanOrEqual(flock.skyY[1]);
  });

  it('a flush is a fountain: birds cross at fly·cos θ, not full fly speed', () => {
    const { flock, params, rng } = makeFlock(content, { x: 1900 });
    forceState(flock, 'flush', 1000, 'gadget', params, rng);
    const start = flock.members.map((b) => b.x);
    let maxVx = 0;
    runUntil(flock, params, rng, () => {
      for (const b of flock.members) {
        const m = b.fm;
        if (m && (b.phase === 'flap' || b.phase === 'glide')) {
          maxVx = Math.max(maxVx, Math.abs(m.vx));
          expect(Math.abs(m.vx)).toBeLessThanOrEqual(
            Math.max(m.fly, m.glide) * Math.cos(m.angle) + 1e-9,
          );
        }
      }
      return flock.state !== 'flush';
    });
    const fly = flock.members[0]?.fm?.fly ?? 0;
    expect(maxVx).toBeLessThan(fly * 0.6);
    // Short hop: a few hundred px, not across the panorama.
    flock.members.forEach((b, i) => {
      expect(Math.abs(b.x - (start[i] ?? 0))).toBeLessThan(1600);
    });
  });

  it('a threat in FLUSH changes nothing', () => {
    const { flock, params, rng } = makeFlock(content);
    forceState(flock, 'flush', 1000, 'gadget', params, rng);
    expect(applyThreat(flock, 1000, params, rng)).toBeNull();
    expect(flock.state).toBe('flush');
  });

  it('a threat in SETTLE alerts the flock again', () => {
    const { flock, params, rng } = makeFlock(content);
    applyThreat(flock, 1000, params, rng);
    applyThreat(flock, 1000, params, rng);
    flock.calmTicks = 1;
    expect(tickFsm(flock, params, rng)?.to).toBe('settle');
    expect(applyThreat(flock, 1000, params, rng)).toEqual({
      from: 'settle',
      to: 'alert',
      cause: 'threat',
    });
  });

  it('forced reactions jump straight to RUN or FLUSH and never de-escalate', () => {
    const a = makeFlock(content);
    expect(forceState(a.flock, 'flush', 0, 'gadget', a.params, a.rng)).toEqual({
      from: 'forage',
      to: 'flush',
      cause: 'gadget',
    });
    expect(forceState(a.flock, 'run', 0, 'event', a.params, a.rng)).toBeNull();
    const b = makeFlock(content);
    applyThreat(b.flock, 0, b.params, b.rng);
    expect(forceState(b.flock, 'run', 0, 'stampede', b.params, b.rng)).toEqual({
      from: 'alert',
      to: 'run',
      cause: 'stampede',
    });
    expect(forceState(b.flock, 'run', 0, 'stampede', b.params, b.rng)).toBeNull();
  });

  it('EXIT: running birds that leave the panorama edge are returned for despawn', () => {
    const { flock, params, rng } = makeFlock(content, { x: 3700 });
    applyThreat(flock, 3000, params, rng);
    applyThreat(flock, 3000, params, rng);
    const exited = new Set<number>();
    for (let i = 0; i < 600 && exited.size < flock.members.length; i++) {
      tickFsm(flock, params, rng);
      for (const b of moveFlock(flock, params, rng)) exited.add(b.id);
    }
    expect(exited.size).toBeGreaterThan(0);
  });

  it('foraging birds stay together (cohesion) without stacking (separation)', () => {
    const { flock, params, rng } = makeFlock(content, { size: 10, spacing: 5 });
    for (let i = 0; i < 600; i++) {
      tickFsm(flock, params, rng);
      moveFlock(flock, params, rng);
    }
    const xs = flock.members.map((b) => b.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(params.forageWanderPx * 3);
    for (const a of flock.members) {
      for (const b of flock.members) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2);
      }
    }
  });
});
