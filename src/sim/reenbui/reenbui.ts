// v1.10 (D-067, GDD §11.3e): Reënbui — the first summer rain and the flying ants. A world event of
// its own, on its own stream `reenbui` (never shared), so every other event's time stays the same:
// whether it comes, when, where the alate columns rise and the extra flocks that run in.
// Pure functions plus a small per-hunt state; the Sim wires it to the flocks and the scoring.
import type { Reenbui, ReenbuiPhase } from '../../content/schemas';
import { planeCentreX } from '../camera';
import { secondsToTicks } from '../clock';
import type { RandomStream } from '../rng';
import type { ModeId, PlaneId, SeasonHuntKind } from '../types';

export type { ReenbuiPhase };

/** What decides whether a hunt can have it (GDD §11.3e "Where" and "Modes"). */
export interface ReenbuiEligibility {
  readonly biome: string;
  readonly mode: ModeId;
  /** Season Run hunts: plain, omen or boss; null elsewhere. */
  readonly seasonKind: SeasonHuntKind | null;
  /** A special day's Daily (Feesdae keep their own twist). */
  readonly feesdag: boolean;
  /** The map's weather (a `calm` day never has it). */
  readonly weather: 'calm' | 'default' | 'omen';
  /** The weekday layout's rule. */
  readonly layoutRule: 'force' | 'none' | undefined;
}

/** The hunt's chance of a Reënbui (0 = never, 1 = always). */
export function reenbuiChance(cfg: Reenbui, e: ReenbuiEligibility): number {
  if (!cfg.modes.includes(e.mode)) return 0;
  if (e.seasonKind === 'boss' || e.feesdag) return 0;
  const area = cfg.areas.find((a) => a.biome === e.biome);
  if (area === undefined || e.weather === 'calm' || e.layoutRule === 'none') return 0;
  if (e.layoutRule === 'force') return 1;
  return area.chance;
}

/** The phase starts in ticks; the event is over at `endAt`. */
export interface ReenbuiPlan {
  readonly buildupAt: number;
  readonly dropsAt: number;
  readonly swarmAt: number;
  readonly easingAt: number;
  readonly endAt: number;
  /** The Kalahari omen: the swarm rose when the Donderstorm broke (no build-up or drops of its
   *  own; the storm's haze and rain were those). */
  readonly withStorm: boolean;
}

/**
 * Whether and when this hunt's Reënbui comes. `stormTick`: the Kalahari omen's Donderstorm (the
 * swarm rises with it). Draws from `rng` only when the chance is above 0.
 */
export function planReenbui(
  cfg: Reenbui,
  e: ReenbuiEligibility,
  durationTicks: number,
  stormTick: number | null,
  rng: RandomStream,
): ReenbuiPlan | null {
  const chance = reenbuiChance(cfg, e);
  if (chance <= 0) return null;
  const roll = rng.next();
  const at = rng.range(cfg.window[0], cfg.window[1]);
  if (roll >= chance) return null;
  const p = cfg.phaseSeconds;
  const swarm = secondsToTicks(p.swarm);
  const easing = secondsToTicks(p.easing);
  if (stormTick !== null) {
    const easingAt = stormTick + swarm;
    return {
      buildupAt: stormTick,
      dropsAt: stormTick,
      swarmAt: stormTick,
      easingAt,
      endAt: easingAt + easing,
      withStorm: true,
    };
  }
  const buildup = secondsToTicks(p.buildup);
  const drops = secondsToTicks(p.drops);
  const total = buildup + drops + swarm + easing;
  // A late start is pulled back so the rain has eased before the hunt ends.
  const latest = durationTicks - total - secondsToTicks(cfg.endMarginSeconds);
  const drawn = Math.floor(at * durationTicks);
  const start = latest >= 0 ? Math.min(drawn, latest) : drawn;
  return {
    buildupAt: start,
    dropsAt: start + buildup,
    swarmAt: start + buildup + drops,
    easingAt: start + buildup + drops + swarm,
    endAt: start + total,
    withStorm: false,
  };
}

/** The phase at `tick` (null before the build-up and once it is over). */
export function reenbuiPhaseAt(plan: ReenbuiPlan, tick: number): ReenbuiPhase | null {
  if (tick < plan.buildupAt || tick >= plan.endAt) return null;
  if (tick >= plan.easingAt) return 'easing';
  if (tick >= plan.swarmAt) return 'swarm';
  if (tick >= plan.dropsAt) return 'drops';
  return 'buildup';
}

/** Whether a tick range overlaps the event (the Okavango's sun-shower spells are dropped then). */
export function overlapsReenbui(plan: ReenbuiPlan, from: number, to: number): boolean {
  return from < plan.endAt && to > plan.buildupAt;
}

export type ColumnPlane = Reenbui['columns']['planes'][number];

/** One column of flying ants rising from the ground (plane coordinates). */
export interface AlateColumn {
  readonly id: number;
  readonly plane: ColumnPlane;
  readonly x: number;
  /** The ground it rises from (design px). */
  readonly y: number;
}

/** A plane where columns can rise, as the map has it. */
export interface ColumnPlaneGeo {
  readonly plane: ColumnPlane;
  readonly scrollFactor: number;
  /** D-049 tuningRatio of the plane (mid-plane px → plane px). */
  readonly ratio: number;
  readonly coreWidth: number;
  readonly groundY: readonly [number, number];
}

// Structure, not tuning: tries per column to keep the minimum gap before giving that one up.
const PLACE_TRIES = 6;

/**
 * The swarm's columns (2–4), in and near the view at the moment it rises: a plane each, then x
 * round the view's centre on that plane (at least minGapPx from a column on the same plane), y
 * in the plane's ground band. `anchor` (a flock in view): the first column rises right where it
 * forages, so a flock feeds at a column on screen (review of #110). Ordered by id; a column that
 * finds no room is left out.
 */
export function placeColumns(
  cfg: Reenbui,
  planes: readonly ColumnPlaneGeo[],
  cameraX: number,
  rng: RandomStream,
  anchor: { readonly plane: ColumnPlane; readonly x: number } | null = null,
): AlateColumn[] {
  const usable = cfg.columns.planes
    .map((id) => planes.find((g) => g.plane === id))
    .filter((g): g is ColumnPlaneGeo => g !== undefined);
  if (usable.length === 0) return [];
  const count = rng.int(cfg.columns.count[0], cfg.columns.count[1]);
  const out: AlateColumn[] = [];
  const anchorGeo = anchor === null ? undefined : usable.find((g) => g.plane === anchor.plane);
  if (anchor !== null && anchorGeo !== undefined) {
    const margin = Math.min(anchorGeo.coreWidth / 2, (cfg.columns.spreadPx * anchorGeo.ratio) / 4);
    const x = Math.min(anchorGeo.coreWidth - margin, Math.max(margin, anchor.x));
    out.push({
      id: 0,
      plane: anchor.plane,
      x,
      y: rng.range(anchorGeo.groundY[0], anchorGeo.groundY[1]),
    });
  }
  for (let i = out.length; i < count; i++) {
    const g = usable[rng.int(0, usable.length - 1)];
    if (g === undefined) continue;
    const centre = planeCentreX(cameraX, g.scrollFactor);
    const spread = cfg.columns.spreadPx * g.ratio;
    const gap = cfg.columns.minGapPx * g.ratio;
    const margin = Math.min(g.coreWidth / 2, spread / 4);
    for (let t = 0; t < PLACE_TRIES; t++) {
      const x = Math.min(
        g.coreWidth - margin,
        Math.max(margin, centre + rng.range(-spread, spread)),
      );
      const y = rng.range(g.groundY[0], g.groundY[1]);
      if (out.some((c) => c.plane === g.plane && Math.abs(c.x - x) < gap)) continue;
      out.push({ id: i, plane: g.plane, x, y });
      break;
    }
  }
  return out;
}

/** The column a flock at plane x would feed at: the nearest on its plane within reach. */
export function feedColumn(
  columns: readonly AlateColumn[],
  plane: PlaneId,
  x: number,
  reachPx: number,
): AlateColumn | null {
  let best: AlateColumn | null = null;
  let bestD = reachPx;
  for (const c of columns) {
    if (c.plane !== plane) continue;
    const d = Math.abs(c.x - x);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Where an extra flock comes in for a column: fromPx beyond it, on the side away from the view
 *  centre (the other side when that is off the plane). Returns plane x and the run direction. */
export function arrivalFor(
  column: AlateColumn,
  geo: ColumnPlaneGeo,
  cameraX: number,
  fromPx: number,
): { readonly x: number; readonly dir: 1 | -1 } {
  const centre = planeCentreX(cameraX, geo.scrollFactor);
  const off = fromPx * geo.ratio;
  let side: 1 | -1 = column.x >= centre ? 1 : -1;
  if (column.x + side * off < 0 || column.x + side * off > geo.coreWidth) side = side > 0 ? -1 : 1;
  const x = column.x + side * off;
  return { x, dir: side > 0 ? -1 : 1 };
}
