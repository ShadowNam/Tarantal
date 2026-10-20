// Active power-ups (GDD §10.4): timed (ms) or counted in shells. Picking one up again refreshes
// it. Effects combine: spread multipliers multiply, the creature time scale takes the slowest.
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
}

export function effectsOf(list: readonly ActivePowerup[]): PowerupEffects {
  let autoFire = false;
  let infiniteAmmo = false;
  let spreadMul = 1;
  let creatureTimeScale = 1;
  let revealHidden = false;
  for (const p of list) {
    const e = p.def.effect;
    if (e.autoFire === true) autoFire = true;
    if (e.infiniteAmmo === true) infiniteAmmo = true;
    if (e.spreadMul !== undefined) spreadMul *= e.spreadMul;
    if (e.creatureTimeScale !== undefined)
      creatureTimeScale = Math.min(creatureTimeScale, e.creatureTimeScale);
    if (e.revealHidden === true) revealHidden = true;
  }
  return { autoFire, infiniteAmmo, spreadMul, creatureTimeScale, revealHidden };
}

export function powerupView(p: ActivePowerup): PowerupView {
  return {
    id: p.def.id,
    ticksLeft: p.ticksLeft,
    totalTicks: p.totalTicks,
    shellsLeft: p.shellsLeft,
  };
}
