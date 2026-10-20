// Front-to-back shot resolution geometry (Tech §3.3–3.4). A pellet stops at the first thing it
// meets, walking layers from the front (highest scroll factor) to the back. Within a plane layer,
// birds stand in front of that layer's props (D-018); a layer's props block every layer behind.
import type { Biome, Creature } from '../../content/schemas';
import { tapToPlane } from '../camera';
import type { PlaneId } from '../types';
import { coreWidth } from '../world';

export type Hitbox = Extract<Creature, { hitbox: unknown }>['hitbox'];

export interface HitBird {
  readonly id: number;
  readonly plane: PlaneId;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly hitbox: Hitbox;
  readonly hittable: boolean;
}

export type OccluderShape =
  | { readonly type: 'rect'; readonly w: number; readonly h: number }
  | { readonly type: 'ellipse'; readonly rx: number; readonly ry: number };

/** A prop occluder in its layer's coordinates (design px, not scaled by plane). */
export interface Occluder {
  readonly propId: string;
  readonly x: number;
  readonly y: number;
  readonly shape: OccluderShape;
}

export interface Slice {
  readonly layerId: string;
  readonly scrollFactor: number;
  readonly plane: PlaneId | null;
  readonly occluders: readonly Occluder[];
}

/** Layers front → back with their occluders. Built once per hunt from the biome. */
export function buildSlices(biome: Biome): Slice[] {
  return biome.layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => b.layer.scrollFactor - a.layer.scrollFactor || a.index - b.index)
    .map(({ layer }) => ({
      layerId: layer.id,
      scrollFactor: layer.scrollFactor,
      plane: layer.plane ?? null,
      occluders: biome.props.flatMap((prop): Occluder[] => {
        const o = prop.occluder;
        if (prop.layer !== layer.id || o === undefined) return [];
        const x = prop.u * coreWidth(layer.scrollFactor) + o.ox;
        const y = prop.y + o.oy;
        const shape: OccluderShape =
          o.type === 'rect'
            ? { type: 'rect', w: o.w, h: o.h }
            : { type: 'ellipse', rx: o.rx, ry: o.ry };
        return [{ propId: prop.id, x, y, shape }];
      }),
    }));
}

function inEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

export function pointInOccluder(px: number, py: number, o: Occluder): boolean {
  if (o.shape.type === 'rect') {
    return Math.abs(px - o.x) <= o.shape.w / 2 && Math.abs(py - o.y) <= o.shape.h / 2;
  }
  return inEllipse(px, py, o.x, o.y, o.shape.rx, o.shape.ry);
}

/**
 * Body ellipse + head circle, from sprite-local units at scale 1.0, scaled by the plane and
 * grown by the touch aim-assist radius. Facing −1 mirrors the x offsets.
 */
export function pointInBird(
  px: number,
  py: number,
  bird: HitBird,
  scale: number,
  assistPx: number,
): boolean {
  const { body, head } = bird.hitbox;
  const bx = bird.x + body.ox * scale * bird.facing;
  const by = bird.y + body.oy * scale;
  if (inEllipse(px, py, bx, by, body.rx * scale + assistPx, body.ry * scale + assistPx))
    return true;
  if (head === undefined) return false;
  const hx = bird.x + head.ox * scale * bird.facing;
  const hy = bird.y + head.oy * scale;
  const r = head.r * scale + assistPx;
  return inEllipse(px, py, hx, hy, r, r);
}

export interface PelletResult {
  readonly birdId: number | null;
  /** An occluding prop, or the prop of the secret part hit. */
  readonly propId: string | null;
  /** The secret part hit (with propId). */
  readonly partId: string | null;
  readonly crateId: number | null;
}

/** Things on a layer that move or come and go: crates and live secret parts (layer coords). */
export type HitExtra =
  | {
      readonly kind: 'crate';
      readonly crateId: number;
      readonly x: number;
      readonly y: number;
      readonly shape: OccluderShape;
    }
  | {
      readonly kind: 'secret';
      readonly propId: string;
      readonly partId: string;
      readonly x: number;
      readonly y: number;
      readonly shape: OccluderShape;
    };

const NOTHING: PelletResult = { birdId: null, propId: null, partId: null, crateId: null };

export interface ShotGeometry {
  readonly slices: readonly Slice[];
  readonly planeScale: Readonly<Record<PlaneId, number>>;
  /** Aim-assist growth per plane (0 for pointer input). */
  readonly assistPx: Readonly<Record<PlaneId, number>>;
}

/**
 * Resolves one pellet at screen position (dx from centre, sy from top) for camera centre cx.
 * `birdsByPlane` lists each plane's birds front-most first (highest id first). Within a layer the
 * order is birds → extras (crates, then secret parts, as listed) → occluders. `driftDx(f)` shifts
 * the pellet sideways on layers with scroll factor f (wind, Tech §3.4).
 */
export function resolvePellet(
  dx: number,
  sy: number,
  cx: number,
  geometry: ShotGeometry,
  birdsByPlane: Readonly<Record<PlaneId, readonly HitBird[]>>,
  extras: ReadonlyMap<string, readonly HitExtra[]> = new Map(),
  driftDx: (scrollFactor: number) => number = () => 0,
): PelletResult {
  for (const slice of geometry.slices) {
    const p = tapToPlane(cx, slice.scrollFactor, dx + driftDx(slice.scrollFactor), sy);
    if (slice.plane !== null) {
      const scale = geometry.planeScale[slice.plane];
      const assist = geometry.assistPx[slice.plane];
      for (const bird of birdsByPlane[slice.plane]) {
        if (bird.hittable && pointInBird(p.x, p.y, bird, scale, assist)) {
          return { ...NOTHING, birdId: bird.id };
        }
      }
    }
    for (const e of extras.get(slice.layerId) ?? []) {
      if (!pointInOccluder(p.x, p.y, { propId: '', x: e.x, y: e.y, shape: e.shape })) continue;
      return e.kind === 'crate'
        ? { ...NOTHING, crateId: e.crateId }
        : { ...NOTHING, propId: e.propId, partId: e.partId };
    }
    for (const o of slice.occluders) {
      if (pointInOccluder(p.x, p.y, o)) return { ...NOTHING, propId: o.propId };
    }
  }
  return NOTHING;
}

/** A shot hits a target when its pellets on it ≥ min(pelletsToBag, weapon pellets) (GDD §5.1). */
export function pelletsNeeded(pelletsToBag: number, weaponPellets: number): number {
  return Math.min(pelletsToBag, weaponPellets);
}
