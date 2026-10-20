// Dust devils (GDD §11 Karoo omen): a whirl that crosses its plane downwind and FLUSHES every
// flock it touches (once per flock). Spawned in view by the dustDevil world event. Randomness:
// rng.stream('omen').
import { secondsToTicks, TICKS_PER_SECOND } from '../clock';
import type { Flock } from '../flocks/Flock';
import type { RandomStream } from '../rng';
import type { DustDevilView, PlaneId } from '../types';
import { HALF_REFERENCE_WIDTH } from '../world';

export interface DustDevil {
  readonly id: number;
  readonly plane: PlaneId;
  x: number;
  readonly y: number;
  /** Plane px per tick, signed. */
  readonly vx: number;
  /** Contact radius in plane px. */
  readonly radius: number;
  ticksLeft: number;
  /** flushOnContact: touched flocks FLUSH; otherwise they get one threat. */
  readonly flushes: boolean;
  /** Flocks already flushed by this devil. */
  readonly touched: Set<number>;
}

export interface DustDevilSpec {
  readonly id: number;
  readonly plane: PlaneId;
  /** Plane x under the screen centre. */
  readonly centreX: number;
  /** Ground y for the devil's base. */
  readonly y: number;
  readonly ratio: number;
  readonly dir: 1 | -1;
  readonly speedPxPerSec: number;
  readonly radiusPx: number;
  readonly lifeSeconds: readonly [number, number];
  readonly flushes: boolean;
}

/** A dust devil starting in view (within half the reference width of the centre), upwind. */
export function spawnDustDevil(s: DustDevilSpec, rng: RandomStream): DustDevil {
  const half = HALF_REFERENCE_WIDTH * s.ratio;
  return {
    id: s.id,
    plane: s.plane,
    // Start on the upwind half so it crosses the view.
    x: s.centreX - s.dir * rng.range(0, half),
    y: s.y,
    vx: (s.dir * s.speedPxPerSec * s.ratio) / TICKS_PER_SECOND,
    radius: s.radiusPx * s.ratio,
    ticksLeft: Math.max(1, secondsToTicks(rng.range(s.lifeSeconds[0], s.lifeSeconds[1]))),
    flushes: s.flushes,
    touched: new Set(),
  };
}

/** Moves one tick. Returns true when it has blown out. */
export function tickDustDevil(d: DustDevil): boolean {
  d.x += d.vx;
  d.ticksLeft--;
  return d.ticksLeft <= 0;
}

/** Flocks on the devil's plane it touches for the first time (a member within its radius
 *  across), in flock order. Marks them touched. */
export function devilContacts(d: DustDevil, flocks: readonly Flock[]): Flock[] {
  const out: Flock[] = [];
  for (const f of flocks) {
    if (f.plane !== d.plane || d.touched.has(f.id)) continue;
    if (f.members.some((b) => Math.abs(b.x - d.x) <= d.radius)) {
      d.touched.add(f.id);
      out.push(f);
    }
  }
  return out;
}

export function dustDevilView(d: DustDevil): DustDevilView {
  return { id: d.id, plane: d.plane, x: d.x, y: d.y, radius: d.radius };
}
