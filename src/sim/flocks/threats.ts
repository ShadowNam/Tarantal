// Threat sources (GDD §6.2, Tech §3.4). Pure geometry over flocks and the sim camera; the
// device viewport never enters (visibility uses the 1920 reference width).
import { planeCentreX } from '../camera';
import type { PlaneId } from '../types';
import { HALF_REFERENCE_WIDTH } from '../world';
import type { Flock } from './Flock';

export interface PlaneGeo {
  readonly scrollFactor: number;
  readonly scale: number;
  /** D-049: scale / scoring.tuningRefScale (converts px tunings written at the mid plane). */
  readonly ratio: number;
}
export type PlaneGeometry = Readonly<Record<PlaneId, PlaneGeo>>;

export interface ShotImpact {
  /** Screen dx from the centre and sy from the top (as in pelletImpact events). */
  readonly dx: number;
  readonly sy: number;
}

export interface FlockThreat {
  readonly flock: Flock;
  /** Plane x the threat came from (mean of the impacts in range). */
  readonly x: number;
}

/** The weapon radius on a plane: alertRadiusPx is design px at the mid plane (D-049: at
 *  scoring.tuningRefScale; `ratio` converts it). */
export function radiusOnPlane(radiusMidPx: number, plane: PlaneId, geo: PlaneGeometry): number {
  return radiusMidPx * geo[plane].ratio;
}

/**
 * Flocks threatened by one shot: a flock counts once if any pellet impact lands within the
 * weapon's alert radius of any member (hit or miss). A silent weapon (radius 0) threatens only
 * the flocks of the birds it bagged (`baggedFlockIds`). Returned in flock order.
 */
export function shotThreats(
  flocks: readonly Flock[],
  impacts: readonly ShotImpact[],
  cameraX: number,
  radiusMidPx: number,
  geo: PlaneGeometry,
  baggedFlockIds: ReadonlySet<number>,
  /** v1.10 (D-067): a per-flock radius factor (Reënbui: jumpier in the build-up, calmer while
   *  feeding); absent = 1. */
  radiusMul?: (f: Flock) => number,
): FlockThreat[] {
  const out: FlockThreat[] = [];
  for (const f of flocks) {
    const centre = planeCentreX(cameraX, geo[f.plane].scrollFactor);
    const r = radiusOnPlane(radiusMidPx, f.plane, geo) * (radiusMul?.(f) ?? 1);
    let sum = 0;
    let n = 0;
    if (r > 0) {
      for (const imp of impacts) {
        const x = centre + imp.dx;
        const inRange = f.members.some((b) => {
          const dx = b.x - x;
          const dy = b.y - imp.sy;
          return dx * dx + dy * dy <= r * r;
        });
        if (inRange) {
          sum += x;
          n++;
        }
      }
    }
    if (n > 0) out.push({ flock: f, x: sum / n });
    else if (baggedFlockIds.has(f.id)) {
      // Silent bag (or a bag outside the radius): the bagged bird's own flock only.
      const mean = impacts.reduce((s, i) => s + i.dx, 0) / Math.max(1, impacts.length);
      out.push({ flock: f, x: centre + mean });
    }
  }
  return out;
}

/**
 * v1.4 (D-038) a very loud shot (Die Langloop, `alertsAllFlocks`): every flock the shot's own
 * radius didn't reach is threatened too, wherever it is — one threat per flock per shot (GDD
 * §6.1). The threat comes from the shot's mean impact projected onto each flock's plane.
 * Returned in flock order.
 */
export function loudShotThreats(
  flocks: readonly Flock[],
  already: readonly FlockThreat[],
  impacts: readonly ShotImpact[],
  cameraX: number,
  geo: PlaneGeometry,
): FlockThreat[] {
  const hit = new Set(already.map((t) => t.flock.id));
  const mean = impacts.reduce((s, i) => s + i.dx, 0) / Math.max(1, impacts.length);
  return flocks
    .filter((f) => !hit.has(f.id) && f.members.length > 0)
    .map((f) => ({ flock: f, x: planeCentreX(cameraX, geo[f.plane].scrollFactor) + mean }));
}

/** A flock is visible when any member is within the reference half-width of the screen centre. */
export function isFlockVisible(f: Flock, cameraX: number, geo: PlaneGeometry): boolean {
  const centre = planeCentreX(cameraX, geo[f.plane].scrollFactor);
  return f.members.some((b) => Math.abs(b.x - centre) <= HALF_REFERENCE_WIDTH);
}

/** World-event reactions (GDD §6.2): one threat, or a jump straight to RUN or FLUSH. */
export type ReactionEffect = 'threat' | 'run' | 'flush';

export type ReactionScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'visible' }
  /** Flocks with a member within radiusMidPx (scaled per plane) of screen point (dx, sy). */
  | {
      readonly kind: 'area';
      readonly dx: number;
      readonly sy: number;
      readonly radiusMidPx: number;
    };

export interface Reaction {
  readonly effect: ReactionEffect;
  readonly scope: ReactionScope;
}

/** Flocks a reaction reaches, with the plane x it comes from (the flock flees away from it). */
export function reactionTargets(
  flocks: readonly Flock[],
  scope: ReactionScope,
  cameraX: number,
  geo: PlaneGeometry,
): FlockThreat[] {
  const out: FlockThreat[] = [];
  for (const f of flocks) {
    const centre = planeCentreX(cameraX, geo[f.plane].scrollFactor);
    if (scope.kind === 'all') {
      out.push({ flock: f, x: centre });
    } else if (scope.kind === 'visible') {
      if (isFlockVisible(f, cameraX, geo)) out.push({ flock: f, x: centre });
    } else {
      const hit = shotThreats([f], [scope], cameraX, scope.radiusMidPx, geo, new Set());
      if (hit.length > 0) out.push({ flock: f, x: centre + scope.dx });
    }
  }
  return out;
}
