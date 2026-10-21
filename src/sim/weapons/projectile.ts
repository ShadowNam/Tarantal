// Projectile weapons (Kettie, GDD §10.1, Tech §3.4): delayed hitscan. The stone flies to the world
// point under the tap at the moment it was fired and reaches each depth band after that band's
// travel time; it is tested there against what stands there *then*, dropped by the band's
// `dropPx`. Wind drift is read on arrival (far plane and behind only, like pellets).
import type { Weapon } from '../../content/schemas';
import { msToTicks } from '../clock';
import type { PlaneId } from '../types';
import type { ShotGeometry, Slice } from './hitTest';

export type Projectile = NonNullable<Extract<Weapon, { kind: 'primary' }>['projectile']>;

/** One depth band of the flight: the layers the stone crosses at `ticks` after the shot. */
export interface ProjectileBand {
  readonly plane: PlaneId;
  /** Ticks after the shot when the stone is at this band. */
  readonly ticks: number;
  /** Screen px the stone has dropped by then. */
  readonly dropPx: number;
  /** Layers in this band, front → back. */
  readonly slices: readonly Slice[];
}

/**
 * Splits the front-to-back slices into near / mid / far bands by scroll factor: everything in
 * front of or on the near plane is near (foreground included), then mid, then the far plane and
 * every layer behind it. Bands come back in flight order.
 */
export function projectileBands(
  p: Projectile,
  slices: readonly Slice[],
  planeFactor: Readonly<Record<PlaneId, number>>,
): ProjectileBand[] {
  const bandOf = (f: number): PlaneId =>
    f >= planeFactor.near ? 'near' : f >= planeFactor.mid ? 'mid' : 'far';
  return (['near', 'mid', 'far'] as const).map((plane) => ({
    plane,
    ticks: Math.max(1, msToTicks(p.travelMs[plane])),
    dropPx: p.dropPx[plane],
    slices: slices.filter((s) => bandOf(s.scrollFactor) === plane),
  }));
}

/** The shot geometry restricted to one band's layers. */
export function bandGeometry(geo: ShotGeometry, band: ProjectileBand): ShotGeometry {
  return { ...geo, slices: band.slices };
}

/** A stone in the air. `next` is the index of the band it reaches next. */
export interface Flight {
  readonly shotId: number;
  readonly dx: number;
  readonly sy: number;
  /** Camera centre when it was fired: the stone flies to that world point. */
  readonly cx: number;
  readonly firedTick: number;
  next: number;
}
