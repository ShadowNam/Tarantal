// Temporary crate weapons (GDD §10.3). While one is active it replaces the primary weapon, whose
// belt is left as it was. Shot weapons (Voorlaaier) fire `shots` times with a ramrod reload after
// each; timed weapons (Mielie-Masjien) fire every fireIntervalMs while held, until time runs out.
import type { Weapon } from '../../content/schemas';
import { msToTicks } from '../clock';

export type CrateWeaponDef = Extract<Weapon, { kind: 'crate' }>;

export interface CrateWeaponState {
  readonly def: CrateWeaponDef;
  shotsLeft: number | null;
  ticksLeft: number | null;
  readonly totalTicks: number | null;
  /** Ticks until the next shot is allowed (fire interval, or the reload after a shot). */
  cooldownTicks: number;
  readonly cooldownLength: number;
  /** Length of the running cooldown (a power-up can shorten the ramrod reload, v1.6b). */
  cooldownStep: number;
}

export function armCrateWeapon(def: CrateWeaponDef): CrateWeaponState {
  const totalTicks = def.durationMs === undefined ? null : Math.max(1, msToTicks(def.durationMs));
  return {
    def,
    shotsLeft: def.shots ?? null,
    ticksLeft: totalTicks,
    totalTicks,
    cooldownTicks: 0,
    cooldownLength: Math.max(1, msToTicks(def.fireIntervalMs ?? def.reloadMs ?? 0)),
    cooldownStep: 0,
  };
}

/** Fires once if allowed. Returns true when a shot went off. `reloadTicks` maps the ramrod
 *  reload after a shot (shot weapons only) to its length with power-ups applied; a fire
 *  interval (Mielie-Masjien) is not a reload and keeps its length. */
export function tryFireCrate(
  s: CrateWeaponState,
  reloadTicks: (ticks: number) => number = (t) => t,
): boolean {
  if (s.cooldownTicks > 0) return false;
  if (s.shotsLeft !== null) {
    if (s.shotsLeft <= 0) return false;
    s.shotsLeft--;
  }
  s.cooldownTicks =
    s.shotsLeft !== null ? Math.max(1, reloadTicks(s.cooldownLength)) : s.cooldownLength;
  s.cooldownStep = s.cooldownTicks;
  return true;
}

/** True when the weapon is used up (no shots left, or time is up). */
export function crateWeaponSpent(s: CrateWeaponState): boolean {
  return (s.shotsLeft !== null && s.shotsLeft <= 0) || (s.ticksLeft !== null && s.ticksLeft <= 0);
}

/** Advances timers by one tick. */
export function tickCrateWeapon(s: CrateWeaponState): void {
  if (s.cooldownTicks > 0) s.cooldownTicks--;
  if (s.ticksLeft !== null && s.ticksLeft > 0) s.ticksLeft--;
}
