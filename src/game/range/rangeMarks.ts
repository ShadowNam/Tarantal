// Skietbaan gongs (D-040): the hit marks on the range's paper targets and steel plates. Pure (no
// Phaser, no DOM): Skietbaan.ts feeds it the sim's paperHit/plateHit events and the draw classes
// bake what it holds. Every impact leaves a mark for the whole Skietbaan visit (paper and steel
// alike), kept per (area, course, distance, target kind, target index) so a gun swap, the scope or a
// switch to another setup and back keep them; leaving the Skietbaan or Repaint clears them.
// A mark's shape comes from the impact itself (shot id, tick, pellet index), never from a
// per-frame random, so a replay, a held frame and every device draw the same marks.
import { cos, sin } from '../../sim/detmath';
import { fnv1a32 } from '../../sim/rng';
import type { PaperView, PlaneId } from '../../sim/types';
import { isMixed, type RangePlaneChoice, type RangeTargetChoice } from './rangeGuns';

/** Marks kept (and drawn) per target; past it the oldest MARK_TRIM go at once (one re-bake). */
export const MARK_CAP = 400;
export const MARK_TRIM = 50;
/** The newest mark is highlighted for this long (sim ticks), then settles. */
export const NEWEST_TICKS = 75;

/** How big a gun's mark is: shot pellets small, a .22 medium, the Langloop (or a stone) large. */
export type MarkClass = 'shot' | 'rifle' | 'heavy';
/** Rendering only: guns whose single projectile leaves a large mark. */
const HEAVY = new Set(['langloop', 'kettie']);
/** Mark radius in design px at plane scale 1 (near), by kind of target and class. */
const MARK_PX: Readonly<Record<PaperView['kind'], Readonly<Record<MarkClass, number>>>> = {
  plate: { shot: 5, rifle: 8, heavy: 12 },
  paper: { shot: 3, rifle: 4.5, heavy: 6.5 },
};

export function markClass(weapon: string, pellets: number): MarkClass {
  if (pellets > 1) return 'shot';
  return HEAVY.has(weapon) ? 'heavy' : 'rifle';
}

/** A mark's radius in units of the target's radius (the plane's scale is in both). */
export function markSize(
  kind: PaperView['kind'],
  cls: MarkClass,
  planeScale: number,
  targetR: number,
): number {
  return targetR > 0 ? (MARK_PX[kind][cls] * planeScale) / targetR : 0;
}

/** One mark: where it is on its target (u, v: offset from the centre over the radius, so the
 *  mark sits on the target wherever the layout puts it), its size, and what shapes it. */
export interface Mark {
  readonly u: number;
  readonly v: number;
  /** Radius over the target's radius. */
  readonly size: number;
  /** The shape seed (from the impact: shot id, tick, pellet index). */
  readonly seed: number;
  /** The sim tick it landed (its range session's clock). */
  readonly tick: number;
  /** The range session it landed in (only the current session's newest is highlighted). */
  readonly visit: number;
}

/** The impact a mark is made from (a paperHit/plateHit event and its target). */
export interface MarkImpact {
  readonly shotId: number;
  readonly tick: number;
  /** Which pellet of the shot on this target (0 = the first). */
  readonly pellet: number;
  readonly x: number;
  readonly y: number;
}

export function impactSeed(i: Pick<MarkImpact, 'shotId' | 'tick' | 'pellet'>): number {
  return fnv1a32(`${String(i.shotId)}:${String(i.tick)}:${String(i.pellet)}`);
}

export function makeMark(
  i: MarkImpact,
  target: Pick<PaperView, 'x' | 'y' | 'r'>,
  size: number,
  visit: number,
): Mark {
  return {
    u: (i.x - target.x) / target.r,
    v: (i.y - target.y) / target.r,
    size,
    seed: impactSeed(i),
    tick: i.tick,
    visit,
  };
}

/** The course a setup sets out: the mixed course, or one distance's single target kind. Marks
 *  are kept per course, so the mixed course's plates never share marks with the plate course. */
export function courseOf(c: {
  readonly plane: RangePlaneChoice;
  readonly target: RangeTargetChoice;
}): string {
  return isMixed(c) ? 'mixed' : c.target;
}

/** A target's key: area, course, distance, kind and its index among the same plane and kind. */
export function targetKey(t: {
  readonly biome: string;
  readonly course: string;
  readonly plane: PlaneId;
  readonly kind: string;
  readonly index: number;
}): string {
  return `${t.biome}|${t.course}|${t.plane}|${t.kind}|${String(t.index)}`;
}

/** Each target's index among the targets of its plane and kind (by the sim's order). */
export function targetIndices(papers: readonly PaperView[]): Map<number, number> {
  const seen = new Map<string, number>();
  const out = new Map<number, number>();
  for (const p of papers) {
    const k = `${p.plane}|${p.kind}`;
    const n = seen.get(k) ?? 0;
    out.set(p.id, n);
    seen.set(k, n + 1);
  }
  return out;
}

interface TargetMarks {
  marks: Mark[];
  /** Bumped when marks go (a trim, Repaint): a drawn surface then re-bakes from scratch. */
  epoch: number;
}

/** Every target's marks for the Skietbaan visit (in memory only; never saved). */
export class MarkStore {
  private readonly targets = new Map<string, TargetMarks>();
  private epochs = 0;

  private entry(key: string): TargetMarks {
    let t = this.targets.get(key);
    if (t === undefined) {
      t = { marks: [], epoch: ++this.epochs };
      this.targets.set(key, t);
    }
    return t;
  }

  add(key: string, mark: Mark): void {
    const t = this.entry(key);
    t.marks.push(mark);
    if (t.marks.length > MARK_CAP) {
      t.marks.splice(0, t.marks.length - (MARK_CAP - MARK_TRIM));
      t.epoch = ++this.epochs;
    }
  }

  marks(key: string): readonly Mark[] {
    return this.targets.get(key)?.marks ?? [];
  }

  /** Changes when the marks were trimmed or cleared (appends keep it). */
  epoch(key: string): number {
    return this.entry(key).epoch;
  }

  count(key: string): number {
    return this.marks(key).length;
  }

  /** Repaint / new paper: those targets start clean (none: every target, leaving the range). */
  clear(keys?: Iterable<string>): void {
    if (keys === undefined) {
      for (const t of this.targets.values()) {
        t.marks = [];
        t.epoch = ++this.epochs;
      }
      return;
    }
    for (const k of keys) {
      const t = this.entry(k);
      t.marks = [];
      t.epoch = ++this.epochs;
    }
  }
}

/** A mark's shape in its own unit (1 = the mark's radius), from its seed. */
export interface MarkShape {
  /** The lead splash / flaked paint: a star polygon, [x, y] pairs. */
  readonly star: readonly (readonly [number, number])[];
  /** The darker centre's radius. */
  readonly core: number;
  readonly coreX: number;
  readonly coreY: number;
  /** Small radial spatter flecks around it. */
  readonly flecks: readonly { readonly x: number; readonly y: number; readonly r: number }[];
}

/** xorshift32 from the seed: the shape's own little stream (0 ≤ n < 1). */
function stream(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

export function markShape(seed: number): MarkShape {
  const rnd = stream(seed);
  const spikes = 7 + Math.floor(rnd() * 5);
  const rot = rnd() * Math.PI * 2;
  const star: [number, number][] = [];
  for (let k = 0; k < spikes * 2; k++) {
    const a = rot + (k / (spikes * 2)) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    const r = k % 2 === 0 ? 0.72 + rnd() * 0.28 : 0.38 + rnd() * 0.16;
    star.push([cos(a) * r, sin(a) * r]);
  }
  const flecks: { x: number; y: number; r: number }[] = [];
  const n = 3 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 1.15 + rnd() * 0.75;
    flecks.push({ x: cos(a) * d, y: sin(a) * d, r: 0.07 + rnd() * 0.09 });
  }
  return {
    star,
    core: 0.28 + rnd() * 0.12,
    coreX: (rnd() - 0.5) * 0.12,
    coreY: (rnd() - 0.5) * 0.12,
    flecks,
  };
}

/** The newest mark of a target if it is still highlighted at `tick` of session `visit`. */
export function newestLit(marks: readonly Mark[], visit: number, tick: number): Mark | null {
  const m = marks.at(-1);
  if (m === undefined || m.visit !== visit) return null;
  const age = tick - m.tick;
  return age >= 0 && age < NEWEST_TICKS ? m : null;
}

/** Rendering only: the plate's swing decay time and period (ms). A hit kicks the plate out at
 *  once (a struck plate jumps), then it swings back and settles; a new hit starts it again. */
const SWING_TAU_MS = 900;
const SWING_PERIOD_MS = 620;

/** The plate's swing angle `ms` after a hit of amplitude `amp` (0 once it has settled). */
export function swingAngle(amp: number, ms: number): number {
  if (amp === 0 || ms < 0 || ms > SWING_TAU_MS * 5) return 0;
  const w = (2 * Math.PI) / SWING_PERIOD_MS;
  return amp * Math.exp(-ms / SWING_TAU_MS) * Math.cos(w * ms);
}
