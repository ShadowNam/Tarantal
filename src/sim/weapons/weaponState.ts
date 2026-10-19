// Primary-weapon belt, fire cooldown and reload (GDD §5.1, §10.1). Pure state transitions; the
// Sim turns the outcomes into events. Times are precomputed in ticks.
import type { Weapon } from '../../content/schemas';
import { msToTicks } from '../clock';

export type PrimaryWeapon = Extract<Weapon, { kind: 'primary' }>;

export interface WeaponTiming {
  readonly id: string;
  /** -1 = unlimited. */
  readonly magazine: number;
  readonly cooldownTicks: number;
  /** Ticks for a full reload, or per shell when perShell. */
  readonly reloadTicks: number;
  readonly perShell: boolean;
  /** Per-shell reloads that a shot can interrupt (Plaas-Pomp). */
  readonly interruptible: boolean;
  readonly pellets: number;
  readonly spreadPx: number;
}

export function weaponTiming(w: PrimaryWeapon): WeaponTiming {
  return {
    id: w.id,
    magazine: w.magazine,
    cooldownTicks: msToTicks(w.fireCooldownMs),
    reloadTicks: Math.max(1, msToTicks(w.reloadMs)),
    perShell: w.perShellReload,
    interruptible: w.interruptibleReload === true,
    pellets: w.pellets,
    spreadPx: w.spreadPx,
  };
}

export interface WeaponState {
  shells: number;
  cooldownTicks: number;
  /** Ticks until the current reload step completes; 0 = not reloading. */
  reloadTicks: number;
}

export function createWeaponState(t: WeaponTiming): WeaponState {
  return { shells: t.magazine, cooldownTicks: 0, reloadTicks: 0 };
}

export const isReloading = (s: WeaponState): boolean => s.reloadTicks > 0;
const unlimited = (t: WeaponTiming): boolean => t.magazine < 0;

/**
 * Outcome of a fire command:
 * - `fired`: a shell was used (or the magazine is unlimited); `interrupted` if it cut a reload.
 * - `empty`: the belt is empty — the click (no penalty beyond lost time).
 * - `blocked`: cooldown or a non-interruptible reload is running; the command is ignored.
 */
export type FireOutcome =
  | { readonly kind: 'fired'; readonly interrupted: boolean }
  | { readonly kind: 'empty' }
  | { readonly kind: 'blocked' };

export function tryFire(s: WeaponState, t: WeaponTiming): FireOutcome {
  if (s.cooldownTicks > 0) return { kind: 'blocked' };
  let interrupted = false;
  if (isReloading(s)) {
    if (!(t.perShell && t.interruptible && s.shells > 0)) return { kind: 'blocked' };
    s.reloadTicks = 0;
    interrupted = true;
  }
  if (!unlimited(t) && s.shells <= 0) return { kind: 'empty' };
  if (!unlimited(t)) s.shells--;
  s.cooldownTicks = t.cooldownTicks;
  return { kind: 'fired', interrupted };
}

/** Starts a reload. Returns false when there is nothing to do. */
export function startReload(s: WeaponState, t: WeaponTiming): boolean {
  if (unlimited(t) || isReloading(s) || s.shells >= t.magazine) return false;
  s.reloadTicks = t.reloadTicks;
  return true;
}

export type TickOutcome = 'shellLoaded' | 'reloadFinished' | null;

/** Advances timers by one tick. */
export function tickWeapon(s: WeaponState, t: WeaponTiming): TickOutcome {
  if (s.cooldownTicks > 0) s.cooldownTicks--;
  if (!isReloading(s)) return null;
  s.reloadTicks--;
  if (s.reloadTicks > 0) return null;
  if (!t.perShell) {
    s.shells = t.magazine;
    return 'reloadFinished';
  }
  s.shells++;
  if (s.shells >= t.magazine) return 'reloadFinished';
  s.reloadTicks = t.reloadTicks;
  return 'shellLoaded';
}

/** 0..1 progress of the current reload step. */
export function reloadProgress(s: WeaponState, t: WeaponTiming): number {
  return isReloading(s) ? 1 - s.reloadTicks / t.reloadTicks : 0;
}
