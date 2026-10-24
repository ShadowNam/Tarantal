// v1.3x (D-037) Skietbaan statistics: what the range's sim events say about a gun at a distance.
// Pure (no Phaser, no DOM): the overlay feeds it each frame's events and draws what it returns.
// Kept in memory for the page's session only; never saved.
import type { SimEvent } from '../../sim/events';
import type { PlaneId, RangeTarget } from '../../sim/types';

/** How many paper impacts are drawn and measured (the newest). */
export const GROUP_IMPACTS = 20;
/** Shots tracked until their pellets land (far more than can be in the air at once). */
const OPEN_SHOTS = 64;

/** One pellet on the paper, and the aim point of the shot it came from (plane px). */
export interface Impact {
  readonly x: number;
  readonly y: number;
  readonly aimX: number;
  readonly aimY: number;
}

/** The stats of one gun (a rifle with its sight) at one distance on one kind of target. */
export interface RangeCell {
  readonly gun: string;
  readonly plane: PlaneId;
  readonly target: RangeTarget;
  /** Pellets per shot (1 for rifles and the Kettie). */
  readonly pellets: number;
  shots: number;
  /** Shots that put at least one pellet on the target (a paper target, or a bird it hit). */
  hits: number;
  /** Pellets that landed on the target, over every shot. */
  pelletsOn: number;
  /** The newest paper impacts, oldest first (at most GROUP_IMPACTS). */
  impacts: Impact[];
}

export interface GroupStats {
  readonly n: number;
  /** Mean distance of the impacts from the group's centre (design px). */
  readonly meanRadius: number;
  /** Largest distance between two impacts (design px). */
  readonly extremeSpread: number;
  /** The group's centre relative to the aim point (design px, +x right, +y down). */
  readonly offsetX: number;
  readonly offsetY: number;
}

export const cellKey = (gun: string, plane: PlaneId, target: RangeTarget): string =>
  `${gun}|${plane}|${target}`;

export function misses(c: RangeCell): number {
  return c.shots - c.hits;
}

/** Hit rate 0..1 (0 before the first shot). */
export function hitRate(c: RangeCell): number {
  return c.shots === 0 ? 0 : c.hits / c.shots;
}

/** Average pellets on the target per shot (0 before the first shot). */
export function pelletsPerShot(c: RangeCell): number {
  return c.shots === 0 ? 0 : c.pelletsOn / c.shots;
}

/** Group size and centre of impacts, each measured from its own shot's aim point. */
export function groupStats(impacts: readonly Impact[]): GroupStats | null {
  const n = impacts.length;
  if (n === 0) return null;
  const off = impacts.map((i) => ({ x: i.x - i.aimX, y: i.y - i.aimY }));
  let sx = 0;
  let sy = 0;
  for (const o of off) {
    sx += o.x;
    sy += o.y;
  }
  const cx = sx / n;
  const cy = sy / n;
  let radius = 0;
  for (const o of off) radius += Math.hypot(o.x - cx, o.y - cy);
  let spread = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = off[i];
      const b = off[j];
      if (a === undefined || b === undefined) continue;
      spread = Math.max(spread, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return { n, meanRadius: radius / n, extremeSpread: spread, offsetX: cx, offsetY: cy };
}

/** A length as a percentage of the guineafowl's body width at that distance. */
export function pctOfBody(px: number, bodyWidthPx: number): number {
  return bodyWidthPx > 0 ? (px / bodyWidthPx) * 100 : 0;
}

/** What the range is shooting now (stats go to this cell). */
export interface RangeSelection {
  readonly gun: string;
  readonly plane: PlaneId;
  readonly target: RangeTarget;
  readonly pellets: number;
}

/**
 * Every cell of the page's session. `ingest` reads a frame's events: shots are counted at
 * shotFired, their aim point at rangeShot, and a shot is a hit at its first pellet on the
 * target (a Kettie stone lands ticks later, so shots are tracked by id until then).
 */
export class RangeStats {
  private readonly cells = new Map<string, RangeCell>();
  /** Shots of this session still able to land: id → its cell, aim point, and whether it hit. */
  private readonly open = new Map<
    number,
    { cell: RangeCell; aimX: number; aimY: number; hit: boolean }
  >();
  /** Bumped by reset(): a sim started before it reports into nothing. */
  private epoch = 0;

  get generation(): number {
    return this.epoch;
  }

  /** All cells with at least one shot, in first-shot order. */
  list(): RangeCell[] {
    return [...this.cells.values()].filter((c) => c.shots > 0);
  }

  cell(sel: RangeSelection): RangeCell {
    const key = cellKey(sel.gun, sel.plane, sel.target);
    let c = this.cells.get(key);
    if (c === undefined) {
      c = { ...sel, shots: 0, hits: 0, pelletsOn: 0, impacts: [] };
      this.cells.set(key, c);
    }
    return c;
  }

  /** A new range session (another setup): shot ids start again at 1. */
  newSession(): void {
    this.open.clear();
  }

  reset(): void {
    this.cells.clear();
    this.open.clear();
    this.epoch++;
  }

  ingest(events: readonly SimEvent[], sel: RangeSelection): void {
    for (const e of events) {
      switch (e.type) {
        case 'shotFired': {
          const cell = this.cell(sel);
          cell.shots++;
          this.open.set(e.shotId, { cell, aimX: NaN, aimY: NaN, hit: false });
          // Only the last few shots can still land (a Kettie stone is in the air < 1 s).
          if (this.open.size > OPEN_SHOTS) {
            const oldest = this.open.keys().next();
            if (oldest.done !== true) this.open.delete(oldest.value);
          }
          break;
        }
        case 'rangeShot': {
          const s = this.open.get(e.shotId);
          if (s !== undefined) {
            s.aimX = e.x;
            s.aimY = e.y;
          }
          break;
        }
        case 'paperHit': {
          const s = this.open.get(e.shotId);
          if (s === undefined) break;
          this.land(s);
          s.cell.impacts.push({ x: e.x, y: e.y, aimX: s.aimX, aimY: s.aimY });
          if (s.cell.impacts.length > GROUP_IMPACTS) s.cell.impacts.shift();
          break;
        }
        case 'pelletImpact': {
          // Bird targets: every pellet that stopped on a bird (all the range's birds are targets).
          const s = this.open.get(e.shotId);
          if (s !== undefined && e.birdId !== null) this.land(s);
          break;
        }
        default:
          break;
      }
    }
  }

  private land(s: { cell: RangeCell; hit: boolean }): void {
    s.cell.pelletsOn++;
    if (!s.hit) {
      s.hit = true;
      s.cell.hits++;
    }
  }
}
