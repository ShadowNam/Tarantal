// Supply crates (GDD §8, §10.3–10.4): parachute in twice per Classic/Daily hunt at times drawn
// inside powerups.json → crates.windows (fractions of hunt length). Shoot one to get a power-up or
// a crate weapon from the weighted table. Times and contents come from rng.stream('crates').
import type { Biome, Powerups } from '../../content/schemas';
import { msToTicks, TICKS_PER_SECOND } from '../clock';
import type { RandomStream } from '../rng';
import type { CrateView, ModeId, PlaneId } from '../types';

type CrateConfig = Powerups['crates'];

export interface Crate {
  readonly id: number;
  readonly plane: PlaneId;
  readonly x: number;
  y: number;
  readonly landY: number;
  /** Plane px per tick. */
  readonly fallPerTick: number;
  landed: boolean;
  /** Ticks left on the ground. */
  lingerLeft: number;
  /** Hit ellipse on its plane (plane px). */
  readonly rx: number;
  readonly ry: number;
}

/** Spawn ticks for this hunt's crates (empty when the mode has none), in time order. */
export function scheduleCrates(
  cfg: CrateConfig,
  mode: ModeId,
  durationTicks: number,
  rng: RandomStream,
): number[] {
  if (!cfg.modes.includes(mode)) return [];
  return cfg.windows
    .slice(0, cfg.perHunt)
    .map((w) => Math.floor(rng.range(w[0], w[1]) * durationTicks))
    .sort((a, b) => a - b);
}

export interface CrateSpawn {
  readonly id: number;
  /** Plane x under the screen centre right now (crates drop into view). */
  readonly centreX: number;
  readonly planeScale: number;
  readonly midScale: number;
}

/** A new crate falling from the top of its plane's sky lane, or null if the plane has no lanes. */
export function spawnCrate(
  cfg: CrateConfig,
  biome: Biome,
  s: CrateSpawn,
  rng: RandomStream,
): Crate | null {
  const lane = biome.lanes[cfg.plane];
  const sky = lane?.skyY;
  const ground = lane?.groundY;
  if (sky === undefined || ground === undefined) return null;
  const ratio = s.planeScale / s.midScale;
  return {
    id: s.id,
    plane: cfg.plane,
    x: s.centreX + rng.range(-cfg.spawnHalfWidthPx, cfg.spawnHalfWidthPx) * ratio,
    y: sky[0],
    landY: rng.range(ground[0], ground[1]),
    fallPerTick: (cfg.fallPxPerSec * ratio) / TICKS_PER_SECOND,
    landed: false,
    lingerLeft: Math.max(1, msToTicks(cfg.lingerMs)),
    rx: cfg.hitbox.rx * s.planeScale,
    ry: cfg.hitbox.ry * s.planeScale,
  };
}

/** One tick of falling or lying. Returns true when the crate is gone. */
export function tickCrate(c: Crate): boolean {
  if (!c.landed) {
    c.y = Math.min(c.landY, c.y + c.fallPerTick);
    if (c.y >= c.landY) c.landed = true;
    return false;
  }
  c.lingerLeft--;
  return c.lingerLeft <= 0;
}

export interface CrateItem {
  readonly id: string;
  readonly type: 'powerup' | 'weapon';
}

/** Rolls the crate table (weights). */
export function rollCrate(cfg: CrateConfig, rng: RandomStream): CrateItem | null {
  const i = rng.weightedIndex(cfg.table.map((e) => e.weight));
  const e = cfg.table[i];
  return e === undefined ? null : { id: e.id, type: e.type ?? 'powerup' };
}

export function crateView(c: Crate): CrateView {
  return { id: c.id, plane: c.plane, x: c.x, y: c.y, landed: c.landed };
}
