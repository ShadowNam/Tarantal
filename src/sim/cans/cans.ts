// v1.8 (D-050, GDD §11.3) Blikkies: tin cans on the posts of a farm fence. The fence and its cans
// come from the day's layout (moved back by a bonus map); a can is a juggle body (../juggle/body)
// on its plane. Sizes follow the plane's scale and the hit radius its minHitRadiusPx (cans are
// targets, D-049); flight numbers are px at the tuning reference, × tuningRatio. Pure and
// deterministic: the only randomness is the sideways jitter of a kick, from the 'cans' stream.
import type { Biome, Cans, CanType, Fence, Scoring } from '../../content/schemas';
import { cos, sin } from '../detmath';
import { hitRadius, tuningRatio } from '../planes';
import type { PlaneId } from '../types';
import { coreWidth } from '../world';
import {
  kick,
  restingBody,
  scaledTuning,
  stepBody,
  type JuggleBody,
  type JuggleTuning,
  type KickResult,
  type StepResult,
} from '../juggle/body';
import type { RandomStream } from '../rng';

/** Can ids start here, clear of bird ids and the Spookjag's (1,000,000). */
export const CAN_ID_BASE = 2_000_000;
/** The Blikkiesdans secret's id (secretTriggered propId; the Bird Book and the Notaboek). */
export const BLIKKIESDANS_SECRET = 'blikkiesdans';

export interface FencePost {
  readonly x: number;
  /** The post's top (design px). */
  readonly top: number;
}

export interface CanFence {
  readonly plane: PlaneId;
  readonly kind: Fence['kind'];
  /** The ground line the posts stand on (design px). */
  readonly groundY: number;
  readonly posts: readonly FencePost[];
}

export interface Can {
  readonly id: number;
  readonly plane: PlaneId;
  readonly type: CanType;
  readonly post: number;
  readonly body: JuggleBody;
  /** Drawn size on its plane (radius and half axis). */
  readonly r: number;
  readonly half: number;
  /** Hit radius (r floored by the plane's minHitRadiusPx). */
  readonly hitR: number;
}

export interface Blikkies {
  readonly fence: CanFence;
  readonly cans: Can[];
  readonly tuning: JuggleTuning;
  /** Longest air chain of the hunt, knock-offs, air hits, Weg!s, landed. */
  bestChain: number;
  knocks: number;
  airHits: number;
  weg: number;
  danced: boolean;
}

export interface CanDeps {
  readonly fence: Fence;
  readonly biome: Biome;
  readonly cans: Cans;
  readonly planes: Scoring['planes'];
  readonly tuningRefScale: number;
  /** The first can's id (the Skietbaan puts up fresh cans with new ids). */
  readonly idBase?: number;
}

/** Sets the fence and its cans up (null when the map has no fence or no ground line for it). */
export function startCans(d: CanDeps): Blikkies | null {
  const { fence, planes } = d;
  const groundY = d.biome.fenceY?.[fence.plane];
  if (groundY === undefined) return null;
  const p = planes[fence.plane];
  const ratio = tuningRatio(p.scale, d.tuningRefScale);
  const x0 = fence.u * coreWidth(p.scrollFactor);
  const posts = fence.posts.map((post) => ({
    x: x0 + post.dx * ratio,
    top: groundY - post.h * ratio,
  }));
  const cans: Can[] = [];
  fence.cans.forEach((c, i) => {
    const post = posts[c.post];
    if (post === undefined) return;
    const t = d.cans.types[c.type];
    const r = t.r * p.scale;
    const half = t.half * p.scale;
    const extent = r + half;
    cans.push({
      id: (d.idBase ?? CAN_ID_BASE) + i,
      plane: fence.plane,
      type: c.type,
      post: c.post,
      // Lying on its side on the ground, its centre is r above the ground line.
      body: restingBody(post.x, post.top - extent, groundY - r, extent),
      r,
      half,
      hitR: hitRadius(t.r, p.scale, p.minHitRadiusPx),
    });
  });
  return {
    fence: { plane: fence.plane, kind: fence.kind, groundY, posts },
    cans,
    tuning: scaledTuning(d.cans.juggle, ratio),
    bestChain: 0,
    knocks: 0,
    airHits: 0,
    weg: 0,
    danced: false,
  };
}

/** A can's hit capsule now (plane px): its axis turns with it. `growPx` = touch assist. */
export function canCapsule(
  c: Can,
  growPx = 0,
): { x: number; y: number; r: number; hx: number; hy: number } {
  const a = c.body.angle;
  // Upright (angle 0) the axis points up the screen (−y); the angle turns it clockwise.
  return {
    x: c.body.x,
    y: c.body.y,
    r: c.hitR + growPx,
    hx: c.half * sin(a),
    hy: -c.half * cos(a),
  };
}

/** A strike's point in the can's own frame (upright, centre 0,0): where its dent goes. */
export function canLocal(c: Can, dx: number, dy: number): { lx: number; ly: number } {
  const a = c.body.angle;
  const ca = cos(a);
  const sa = sin(a);
  return { lx: dx * ca + dy * sa, ly: -dx * sa + dy * ca };
}

/** The kick of one shot's pellets on a can (mean strike offset across it, in plane px). */
export function hitCan(
  b: Blikkies,
  c: Can,
  meanDx: number,
  pellets: number,
  rng: RandomStream,
): KickResult | null {
  const side = c.hitR > 0 ? meanDx / c.hitR : 0;
  const k = kick(c.body, b.tuning, side, pellets, rng);
  if (k === null) return null;
  if (k.kind === 'knock') b.knocks++;
  else {
    b.airHits++;
    b.bestChain = Math.max(b.bestChain, k.chain);
  }
  return k;
}

/** One tick for every can in flight, in id order. */
export function stepCans(
  b: Blikkies,
): { readonly can: Can; readonly r: NonNullable<StepResult> }[] {
  const out: { can: Can; r: NonNullable<StepResult> }[] = [];
  for (const c of b.cans) {
    const r = stepBody(c.body, b.tuning, 0);
    if (r === null) continue;
    if (r === 'gone') b.weg++;
    out.push({ can: c, r });
  }
  return out;
}

/** Points for a can event, before Frenzy and Stampede (rounded). */
export function canPoints(
  s: Scoring['cans'],
  plane: PlaneId,
  what: 'knock' | 'weg' | { readonly chain: number },
): number {
  const base =
    what === 'knock'
      ? s.knockOff
      : what === 'weg'
        ? s.weg
        : s.airHit + s.airHitStep * (Math.min(what.chain, s.chainCap) - 1);
  return Math.round(base * s.planeMul[plane]);
}
