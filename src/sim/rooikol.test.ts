// 1.9.2 (D-055) Rooikol, the red dot sight: for its time a rifle's sight is up the moment it is
// pressed (no raise), sways as its first step × redDotSwayMul, and its time between shots is ×
// fireCooldownMul. Rifle only: crates hold it only when the hunt's gun has a sight, the Padstal
// never sells it. The zoom is the view's business (the AimView says redDot).
import { describe, expect, it } from 'vitest';
import { base, newSim, ofType, quiet, run, type Content } from '../../tools/simHarness';
import { msToTicks } from './clock';
import { planeToDx } from './camera';
import { CAMERA_MAX_X, CAMERA_MIN_X } from './world';
import { createRun, rollOffers } from './run/run';
import { effectsOf, activate, type ActivePowerup } from './powerups';
import type { Sim } from './Sim';
import type { Command, ModeConfig } from './types';

const def = base.powerups.powerups.find((p) => p.id === 'rooikol');
const mul = def?.effect.fireCooldownMul ?? 1;

const rifle = (weapon: 'twee_twee' | 'langloop'): ModeConfig => ({
  id: 'classic',
  layout: 'mon',
  weapon,
  sight: weapon === 'langloop' ? 'scope_var' : 'scope_small',
});

/** One early crate holding `item` (or the real table). */
function crates(item: string | null): Content {
  const c = quiet();
  c.powerups.crates.perHunt = 1;
  c.powerups.crates.windows = [[0.01, 0.01]];
  if (item !== null) c.powerups.crates.table = [{ id: item, weight: 1 }];
  return c;
}

/** Commands that put the crate under a rifle's sight (camera on it, the sight raised at it). */
function aimCrate(sim: Sim, c: Content): Command[] {
  const crate = sim.snapshot().crates[0];
  if (crate === undefined) throw new Error('no crate');
  const sf = c.scoring.planes[crate.plane].scrollFactor;
  const cx = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, (crate.x - 960) / sf + 960));
  const q = Math.round(cx * 2) / 2;
  return [
    { t: 'cameraTarget', cx: q },
    { t: 'aimStart', dx: planeToDx(q, sf, crate.x), sy: crate.y + 4 },
  ];
}

/** Drops the crate, opens it through the sight; the power-up is running after this. */
function pickUp(sim: Sim, c: Content): void {
  const pre = run(sim, 60);
  expect(ofType(pre, 'crateSpawned')).toHaveLength(1);
  // Wait until it has landed: a raised rifle sight takes a while and a falling crate moves.
  for (let i = 0; i < 1200 && sim.snapshot().crates[0]?.landed === false; i++) run(sim, 1);
  const sight = sim.snapshot().weapon.sight;
  const s = c.weapons.sights.find((x) => x.id === sight);
  run(sim, 1, aimCrate(sim, c));
  run(sim, msToTicks(s?.raiseMs ?? 0) + 1);
  const ev = run(sim, 1, [{ t: 'aimRelease' }]);
  expect(ofType(ev, 'crateOpened')).toMatchObject([{ item: 'rooikol' }]);
}

/** A primary gun's normal time between shots, in ticks. */
function cooldownTicks(id: string): number {
  const w = base.weapons.weapons.find((x) => x.id === id);
  if (w?.kind !== 'primary') throw new Error(`no primary ${id}`);
  return msToTicks(w.fireCooldownMs);
}

function waitCooldown(sim: Sim): number {
  let n = 0;
  while (sim.snapshot().weapon.cooldownTicks > 0 && n < 400) {
    run(sim, 1);
    n++;
  }
  return n;
}

describe('Rooikol content (D-055)', () => {
  it('a timed rifle-only power-up with a red dot and a shorter time between shots', () => {
    expect(def).toBeDefined();
    expect(def?.effect.redDot).toBe(true);
    expect(def?.needsSight).toBe(true);
    expect(def?.padstalPrice).toBeUndefined();
    expect(def?.durationMs).toBeGreaterThan(0);
    expect(mul).toBeGreaterThan(0);
    expect(mul).toBeLessThan(1);
    expect(base.powerups.crates.table.some((e) => e.id === 'rooikol')).toBe(true);
  });

  it('effects: the red dot, the lowest sway factor and multiplied cooldown factors', () => {
    if (def === undefined) throw new Error('no rooikol');
    const list: ActivePowerup[] = [];
    expect(effectsOf(list)).toMatchObject({ redDot: false, fireCooldownMul: 1, redDotSwayMul: 1 });
    activate(list, def);
    expect(effectsOf(list)).toMatchObject({
      redDot: true,
      fireCooldownMul: mul,
      redDotSwayMul: def.effect.redDotSwayMul ?? 1,
    });
  });

  it('the Padstal never offers it', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = createRun(base, { seed, weapon: 'twee_twee', pool: [] });
      for (let k = 0; k < 3; k++)
        expect(rollOffers(base, r, k).some((o) => o.id === 'rooikol')).toBe(false);
    }
  });
});

describe('crates hold it only for a rifle', () => {
  it('a shotgun hunt never drops it; with only Rooikol in the table the crate is empty', () => {
    const shotgun = newSim(crates('rooikol'), { id: 'classic', layout: 'mon' });
    const ev = run(shotgun, 90);
    expect(ofType(ev, 'crateSpawned')).toHaveLength(1);
    expect(shotgun.snapshot().crates[0]?.item ?? null).toBeNull();
  });

  it('a rifle hunt can drop it', () => {
    const sim = newSim(crates('rooikol'), rifle('twee_twee'));
    run(sim, 90);
    expect(sim.snapshot().crates[0]?.item).toBe('rooikol');
  });

  it("a shotgun hunt's crates draw what they drew before Rooikol joined the table", () => {
    const withIt = structuredClone(base) as Content;
    const without = structuredClone(base) as Content;
    without.powerups.crates.table = without.powerups.crates.table.filter((e) => e.id !== 'rooikol');
    for (let seed = 1; seed <= 12; seed++) {
      const items = (c: Content): (string | null)[] => {
        const sim = newSim(c, { id: 'classic', huntSeconds: 60 }, seed);
        const ev = run(sim, 60 * 60);
        return ofType(ev, 'crateSpawned').map((e) => e.item ?? null);
      };
      expect(items(withIt)).toEqual(items(without));
    }
  });
});

describe.each(['twee_twee', 'langloop'] as const)('Rooikol with %s', (gun) => {
  it('picked up: the sight is up on the press tick, the AimView says redDot', () => {
    const c = crates('rooikol');
    const sim = newSim(c, rifle(gun));
    pickUp(sim, c);
    expect(sim.snapshot().powerups.map((p) => p.id)).toContain('rooikol');
    waitCooldown(sim);
    const ev = run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 300 }]);
    expect(ofType(ev, 'aimRaised')).toHaveLength(1);
    expect(ofType(ev, 'aimStarted')[0]?.zoom).toBe(1);
    const aim = sim.snapshot().aim;
    expect(aim?.redDot).toBe(true);
    expect(aim?.progress).toBe(1);
    // A press and release in one tick goes off through the sight (no hip spread).
    const shot = run(sim, 1, [{ t: 'aimRelease' }]);
    expect(ofType(shot, 'shotFired')[0]?.aim).toBe('sight');
  });

  it('the time between shots is × fireCooldownMul while it runs, normal after it ends', () => {
    const c = crates('rooikol');
    const sim = newSim(c, rifle(gun));
    const normal = cooldownTicks(gun);
    pickUp(sim, c);
    // The pickup shot itself went off under the old cooldown; the next ones are faster.
    waitCooldown(sim);
    run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 300 }]);
    run(sim, 1, [{ t: 'aimRelease' }]);
    const fast = sim.snapshot().weapon.cooldownTicks;
    expect(fast).toBe(Math.max(1, Math.round(normal * mul)) - 1);
    // Expiry: the power-up ends after its duration, and the cooldown is back to normal.
    const ended = run(sim, msToTicks(def?.durationMs ?? 0));
    expect(ofType(ended, 'powerupEnded').map((e) => e.powerup)).toContain('rooikol');
    expect(sim.snapshot().powerups.map((p) => p.id)).not.toContain('rooikol');
    // Reload if empty, then one more shot.
    run(sim, 1, [{ t: 'reload' }]);
    run(sim, 200);
    run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 300 }]);
    expect(sim.snapshot().aim?.redDot).toBe(false);
    expect(sim.snapshot().aim?.progress).toBeLessThan(1);
    const s = c.weapons.sights.find((x) => x.id === sim.snapshot().weapon.sight);
    run(sim, msToTicks(s?.raiseMs ?? 0) + 1);
    run(sim, 1, [{ t: 'aimRelease' }]);
    expect(sim.snapshot().weapon.cooldownTicks).toBe(normal - 1);
  });

  it('two fast shots: the second goes off after the shortened cooldown', () => {
    const c = crates('rooikol');
    const sim = newSim(c, rifle(gun));
    pickUp(sim, c);
    waitCooldown(sim);
    const tap = (): number => {
      run(sim, 1, [{ t: 'aimStart', dx: 0, sy: 300 }]);
      return ofType(run(sim, 1, [{ t: 'aimRelease' }]), 'shotFired').length;
    };
    expect(tap()).toBe(1);
    const gap = waitCooldown(sim);
    expect(tap()).toBe(1);
    expect(gap).toBeLessThan(cooldownTicks(gun));
  });
});
