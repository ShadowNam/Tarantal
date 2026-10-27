// Active power-ups (GDD §10.4): timed (ms) or counted in shells. Picking one up again refreshes
// it. Effects combine: spread and reload-time multipliers multiply, the creature time scale takes
// the slowest, the idle top-up delay takes the shortest.
import type { Powerups } from '../content/schemas';
import { msToTicks } from './clock';
import type { PowerupView } from './types';

type PowerupDef = Powerups['powerups'][number];

export interface ActivePowerup {
  readonly def: PowerupDef;
  ticksLeft: number | null;
  readonly totalTicks: number | null;
  shellsLeft: number | null;
}

export function activate(list: ActivePowerup[], def: PowerupDef): void {
  const totalTicks = def.durationMs === undefined ? null : Math.max(1, msToTicks(def.durationMs));
  const fresh: ActivePowerup = {
    def,
    ticksLeft: totalTicks,
    totalTicks,
    shellsLeft: def.durationShells ?? null,
  };
  const i = list.findIndex((p) => p.def.id === def.id);
  if (i >= 0) list[i] = fresh;
  else list.push(fresh);
}

/** Advances timers; returns the ids that ran out (in list order) and removes them. */
export function tickPowerups(list: ActivePowerup[]): string[] {
  const ended: string[] = [];
  for (const p of list) {
    if (p.ticksLeft !== null) {
      p.ticksLeft--;
      if (p.ticksLeft <= 0) ended.push(p.def.id);
    }
  }
  removeIds(list, ended);
  return ended;
}

/** One shell fired: counts down shell power-ups; returns the ids that ran out. */
export function onShellFired(list: ActivePowerup[]): string[] {
  const ended: string[] = [];
  for (const p of list) {
    if (p.shellsLeft !== null) {
      p.shellsLeft--;
      if (p.shellsLeft <= 0) ended.push(p.def.id);
    }
  }
  removeIds(list, ended);
  return ended;
}

function removeIds(list: ActivePowerup[], ids: readonly string[]): void {
  for (const id of ids) {
    const i = list.findIndex((p) => p.def.id === id);
    if (i >= 0) list.splice(i, 1);
  }
}

export interface PowerupEffects {
  readonly autoFire: boolean;
  readonly infiniteAmmo: boolean;
  readonly spreadMul: number;
  /** 1 = normal speed. */
  readonly creatureTimeScale: number;
  readonly revealHidden: boolean;
  /** Reload time factor (Blitslaai, v1.6b); factors multiply. 1 = normal. */
  readonly reloadTimeMul: number;
  /** Oupa Laai (v1.6b): an empty gun starts its reload by itself. */
  readonly autoReload: boolean;
  /** Ticks without a shot before a per-shell gun tops up by itself; null = never. */
  readonly idleTopUpTicks: number | null;
  /** 1.9.2 (D-055) Rooikol: rifles aim through a red dot (up at once, no zoom). */
  readonly redDot: boolean;
  /** Red-dot sway × this (the lowest wins). 1 = the sight's own. */
  readonly redDotSwayMul: number;
  /** A rifle's time between shots × this; factors multiply. 1 = normal. */
  readonly fireCooldownMul: number;
}

export function effectsOf(list: readonly ActivePowerup[]): PowerupEffects {
  let autoFire = false;
  let infiniteAmmo = false;
  let spreadMul = 1;
  let creatureTimeScale = 1;
  let revealHidden = false;
  let reloadTimeMul = 1;
  let autoReload = false;
  let idleTopUpTicks: number | null = null;
  let redDot = false;
  let redDotSwayMul = 1;
  let fireCooldownMul = 1;
  for (const p of list) {
    const e = p.def.effect;
    if (e.autoFire === true) autoFire = true;
    if (e.infiniteAmmo === true) infiniteAmmo = true;
    if (e.spreadMul !== undefined) spreadMul *= e.spreadMul;
    if (e.creatureTimeScale !== undefined)
      creatureTimeScale = Math.min(creatureTimeScale, e.creatureTimeScale);
    if (e.revealHidden === true) revealHidden = true;
    if (e.reloadTimeMul !== undefined) reloadTimeMul *= e.reloadTimeMul;
    if (e.autoReload === true) autoReload = true;
    if (e.idleTopUpMs !== undefined) {
      const t = Math.max(1, msToTicks(e.idleTopUpMs));
      idleTopUpTicks = idleTopUpTicks === null ? t : Math.min(idleTopUpTicks, t);
    }
    if (e.redDot === true) redDot = true;
    if (e.redDotSwayMul !== undefined) redDotSwayMul = Math.min(redDotSwayMul, e.redDotSwayMul);
    if (e.fireCooldownMul !== undefined) fireCooldownMul *= e.fireCooldownMul;
  }
  return {
    autoFire,
    infiniteAmmo,
    spreadMul,
    creatureTimeScale,
    revealHidden,
    reloadTimeMul,
    autoReload,
    idleTopUpTicks,
    redDot,
    redDotSwayMul,
    fireCooldownMul,
  };
}

export function powerupView(p: ActivePowerup): PowerupView {
  return {
    id: p.def.id,
    ticksLeft: p.ticksLeft,
    totalTicks: p.totalTicks,
    shellsLeft: p.shellsLeft,
  };
}
