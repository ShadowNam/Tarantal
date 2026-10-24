// v1.3x (D-037) Skietbaan statistics: what the range's sim events say about a gun at a distance.
// Pure (no Phaser, no DOM): the overlay feeds it each frame's events and draws what it returns.
// Kept in memory for the page's session only; never saved.
import type { SimEvent } from '../../sim/events';
import type { PlaneId, RangeTarget } from '../../sim/types';

/** How many impacts the group-size stats measure (the newest). Only the stats: every hole and
 *  mark is drawn for the whole Skietbaan visit (rangeMarks.ts, D-040). */
export const GROUP_IMPACTS = 20;
/** Shots tracked until their pellets land (far more than can be in the air at once). */
const OPEN_SHOTS = 64;

/** One pellet on a paper target or plate, and its shot's aim point on that plane (plane px). */
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
  /** Misses that fell short of Ver (a gun that can't reach it; 24 Oct update). */
  short: number;
  /** Pellets that landed on the target, over every shot. */
  pelletsOn: number;
  /** The newest paper impacts, oldest first (at most GROUP_IMPACTS; for the group stats). */
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

/** What the range is shooting now: the gun; the plane and kind ('all'/'mixed' on the mixed
 *  course, where each shot goes to the cell of the target it hit or was counted for). */
export interface RangeSelection {
  readonly gun: string;
  readonly plane: PlaneId | 'all';
  readonly target: RangeTarget | 'mixed';
  readonly pellets: number;
}

/** How the last landed shot went (the overlay's markers and the bar read it). */
export interface ShotResult {
  readonly shotId: number;
  readonly cell: RangeCell;
  readonly hit: boolean;
  readonly short: boolean;
}

interface OpenShot {
  readonly gun: string;
  readonly pellets: number;
  plane: PlaneId | null;
  target: RangeTarget | null;
  /** Paper and plate impacts of this shot, until it lands. */
  impacts: (Impact & { paperId: number })[];
}

/**
 * Every cell of the page's session. `ingest` reads a frame's events (24 Oct update): a shot is
 * opened at shotFired, takes the target a miss counts for at rangeShot, collects its paper and
 * plate impacts, and is counted at rangeOutcome — for the target it put the most pellets on
 * (first on a tie), else for the rangeShot target ("short" when it fell short of Ver). A Kettie
 * stone lands ticks later, so shots are tracked by id until then.
 */
export class RangeStats {
  private readonly cells = new Map<string, RangeCell>();
  private readonly open = new Map<number, OpenShot>();
  /** Bumped by reset(): a sim started before it reports into nothing. */
  private epoch = 0;
  private lastResult: ShotResult | null = null;

  get generation(): number {
    return this.epoch;
  }

  /** The newest landed shot of this session (null: none since the session or a reset). */
  get last(): ShotResult | null {
    return this.lastResult;
  }

  /** All cells with at least one shot, in first-shot order. */
  list(): RangeCell[] {
    return [...this.cells.values()].filter((c) => c.shots > 0);
  }

  cell(sel: {
    readonly gun: string;
    readonly plane: PlaneId;
    readonly target: RangeTarget;
    readonly pellets: number;
  }): RangeCell {
    const key = cellKey(sel.gun, sel.plane, sel.target);
    let c = this.cells.get(key);
    if (c === undefined) {
      c = {
        gun: sel.gun,
        plane: sel.plane,
        target: sel.target,
        pellets: sel.pellets,
        shots: 0,
        hits: 0,
        short: 0,
        pelletsOn: 0,
        impacts: [],
      };
      this.cells.set(key, c);
    }
    return c;
  }

  /** A new range session (another setup or a shuffle): shot ids start again at 1. */
  newSession(): void {
    this.open.clear();
    this.lastResult = null;
  }

  reset(): void {
    this.cells.clear();
    this.open.clear();
    this.lastResult = null;
    this.epoch++;
  }

  /** Reads a frame's events; returns the shots that landed in it, in order. */
  ingest(events: readonly SimEvent[], sel: RangeSelection): ShotResult[] {
    const landed: ShotResult[] = [];
    for (const e of events) {
      switch (e.type) {
        case 'shotFired': {
          this.open.set(e.shotId, {
            gun: sel.gun,
            pellets: sel.pellets,
            plane: null,
            target: null,
            impacts: [],
          });
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
            s.plane = e.plane;
            s.target = e.target;
          }
          break;
        }
        case 'paperHit':
        case 'plateHit': {
          const s = this.open.get(e.shotId);
          if (s !== undefined)
            s.impacts.push({ x: e.x, y: e.y, aimX: e.aimX, aimY: e.aimY, paperId: e.paperId });
          break;
        }
        case 'rangeOutcome': {
          const s = this.open.get(e.shotId);
          if (s === undefined) break;
          this.open.delete(e.shotId);
          let top: (typeof e.hits)[number] | null = null;
          for (const h of e.hits) if (top === null || h.pellets > top.pellets) top = h;
          const plane = top?.plane ?? s.plane;
          const target = top?.target ?? s.target;
          if (plane === null || target === null) break;
          const cell = this.cell({ gun: s.gun, plane, target, pellets: s.pellets });
          cell.shots++;
          if (top !== null) {
            cell.hits++;
            cell.pelletsOn += top.pellets;
            if (top.target === 'paper' || top.target === 'plate') {
              const id = top.id;
              for (const i of s.impacts)
                if (i.paperId === id)
                  cell.impacts.push({ x: i.x, y: i.y, aimX: i.aimX, aimY: i.aimY });
              if (cell.impacts.length > GROUP_IMPACTS)
                cell.impacts.splice(0, cell.impacts.length - GROUP_IMPACTS);
            }
          } else if (e.short) cell.short++;
          const r: ShotResult = { shotId: e.shotId, cell, hit: top !== null, short: e.short };
          this.lastResult = r;
          landed.push(r);
          break;
        }
        default:
          break;
      }
    }
    return landed;
  }
}
