import { msToTicks } from '../clock';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import {
  createWeaponState,
  reloadProgress,
  startReload,
  tickWeapon,
  tryFire,
  weaponTiming,
  type PrimaryWeapon,
  type WeaponTiming,
} from './weaponState';

function primary(id: string): PrimaryWeapon {
  const w = loadContent().weapons.weapons.find((x) => x.id === id);
  if (w?.kind !== 'primary') throw new Error(id);
  return w;
}

/** Fire, then tick until the cooldown has passed. */
function fireReady(s: ReturnType<typeof createWeaponState>, t: WeaponTiming) {
  const out = tryFire(s, t);
  for (let i = 0; i < t.cooldownTicks; i++) tickWeapon(s, t);
  return out;
}

describe('Dubbelloop belt (GDD §5.1)', () => {
  const t = weaponTiming(primary('dubbelloop'));

  it('has 8 shells, 0.9 s reload (54 ticks) and a 140 ms cooldown (8 ticks)', () => {
    expect(t.magazine).toBe(8);
    expect(t.reloadTicks).toBe(54);
    expect(t.cooldownTicks).toBe(8);
    expect(t.pellets).toBe(8);
  });

  it('fires 8 times, then clicks empty without using anything', () => {
    const s = createWeaponState(t);
    for (let i = 0; i < 8; i++) expect(fireReady(s, t).kind).toBe('fired');
    expect(s.shells).toBe(0);
    expect(tryFire(s, t).kind).toBe('empty');
    expect(tryFire(s, t).kind).toBe('empty');
    expect(s.cooldownTicks).toBe(0);
  });

  it('ignores a shot during the cooldown', () => {
    const s = createWeaponState(t);
    expect(tryFire(s, t).kind).toBe('fired');
    expect(tryFire(s, t).kind).toBe('blocked');
    for (let i = 0; i < 7; i++) tickWeapon(s, t);
    expect(tryFire(s, t).kind).toBe('blocked');
    tickWeapon(s, t);
    expect(tryFire(s, t).kind).toBe('fired');
  });

  it('refills the whole belt exactly 54 ticks after reload, and blocks shots meanwhile', () => {
    const s = createWeaponState(t);
    for (let i = 0; i < 3; i++) fireReady(s, t);
    expect(startReload(s, t)).toBe(true);
    expect(startReload(s, t)).toBe(false);
    for (let i = 0; i < 53; i++) expect(tickWeapon(s, t)).toBeNull();
    expect(tryFire(s, t).kind).toBe('blocked');
    expect(s.shells).toBe(5);
    expect(tickWeapon(s, t)).toBe('reloadFinished');
    expect(s.shells).toBe(8);
  });

  it('does not reload a full belt', () => {
    const s = createWeaponState(t);
    expect(startReload(s, t)).toBe(false);
  });
});

describe('per-shell reloads', () => {
  it('Plaas-Pomp loads one shell per reload step and a shot interrupts the reload', () => {
    const t = weaponTiming(primary('pomp'));
    const step = t.reloadTicks;
    expect(step).toBe(msToTicks(primary('pomp').reloadMs));
    const s = createWeaponState(t);
    for (let i = 0; i < 6; i++) fireReady(s, t);
    startReload(s, t);
    for (let i = 0; i < step - 1; i++) tickWeapon(s, t);
    expect(tryFire(s, t).kind).toBe('blocked'); // nothing loaded yet
    expect(tickWeapon(s, t)).toBe('shellLoaded');
    for (let i = 0; i < step; i++) tickWeapon(s, t);
    expect(s.shells).toBe(2);
    const shot = tryFire(s, t);
    expect(shot).toEqual({ kind: 'fired', interrupted: true });
    expect(s.shells).toBe(1);
    expect(s.reloadTicks).toBe(0);
  });

  it('Windbuks loads per pellet but cannot be interrupted', () => {
    const t = weaponTiming(primary('windbuks'));
    const s = createWeaponState(t);
    for (let i = 0; i < 6; i++) fireReady(s, t);
    startReload(s, t);
    for (let i = 0; i < t.reloadTicks; i++) tickWeapon(s, t);
    expect(s.shells).toBe(1);
    expect(tryFire(s, t).kind).toBe('blocked');
    for (let i = 0; i < t.reloadTicks * 5; i++) tickWeapon(s, t);
    expect(s.shells).toBe(6);
    expect(s.reloadTicks).toBe(0);
  });

  it('an unlimited magazine (Kettie) never runs dry or reloads', () => {
    const t = weaponTiming(primary('kettie'));
    const s = createWeaponState(t);
    for (let i = 0; i < 50; i++) expect(fireReady(s, t).kind).toBe('fired');
    expect(startReload(s, t)).toBe(false);
  });

  it('v1.6b: a shortened reload step reports progress against its own length', () => {
    const t = weaponTiming(primary('dubbelloop'));
    const s = createWeaponState(t);
    fireReady(s, t);
    expect(startReload(s, t, 20)).toBe(true);
    for (let i = 0; i < 10; i++) tickWeapon(s, t);
    expect(reloadProgress(s)).toBeCloseTo(0.5);
    for (let i = 0; i < 10; i++) tickWeapon(s, t);
    expect(s.shells).toBe(t.magazine);
  });

  it('v1.6b: an auto reload of a non-interruptible per-shell gun can be cut by a shot', () => {
    const t = weaponTiming(primary('windbuks'));
    expect(t.interruptible).toBe(false);
    const s = createWeaponState(t);
    fireReady(s, t);
    fireReady(s, t);
    startReload(s, t, t.reloadTicks, true);
    for (let i = 0; i < t.reloadTicks; i++) tickWeapon(s, t);
    expect(s.shells).toBe(t.magazine - 1);
    const out = tryFire(s, t);
    expect(out).toEqual({ kind: 'fired', interrupted: true });
    expect(s.auto).toBe(false);
  });
});
