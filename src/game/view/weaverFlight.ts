// v1.4 B (D-039): angry sociable weavers — the flight of one burst, as a pure function of sim time.
// A burst is fixed by its nest and the tick of the secretPenalty event that started it (its
// seed), so a replay or a held frame (?holdAt) draws exactly the same birds. Rendering only:
// nothing here feeds back into the sim. Coordinates are px relative to the prop's position on its
// layer, already scaled for the plane.
import type { Feel } from '../../content/schemas';
import type { PlaneId } from '../../sim/types';

export type WeaverTuning = Feel['juice']['weavers'];

/** The nest part's ellipse, relative to the prop (content secret.part.shape), plane-scaled. */
export interface NestShape {
  readonly ox: number;
  readonly oy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface WeaverBird {
  /** The entrance it flies out of and back into (on the nest's underside). */
  readonly hx: number;
  readonly hy: number;
  /** Swirl: centre, radii, start angle, angular speed (rad/s, sign = direction). */
  readonly cx: number;
  readonly cy: number;
  readonly orx: number;
  readonly ory: number;
  readonly phase: number;
  readonly speed: number;
  readonly bob: number;
  readonly bobHz: number;
  /** Seconds after the burst's start before it leaves the hole (they pour out one by one). */
  readonly delay: number;
  /** A dart toward the camera: start (s), length (s) and how far it swoops (px). */
  readonly dart: {
    readonly at: number;
    readonly dur: number;
    readonly dx: number;
    readonly dy: number;
  } | null;
  /** Wingbeat phase offset (ticks). */
  readonly flap: number;
}

export interface WeaverPose {
  readonly x: number;
  readonly y: number;
  /** 1 = the bird's size on its plane; a darting bird grows toward the camera. */
  readonly scale: number;
  /** Facing: −1 left, 1 right. */
  readonly facing: number;
  readonly wingsUp: boolean;
  readonly visible: boolean;
}

/** mulberry32: a small deterministic PRNG (rendering only, never the sim's streams). */
export function weaverRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed of a burst: the nest's prop id and the event's tick. */
export function burstSeed(propId: string, tick: number): number {
  let h = 2166136261;
  for (let k = 0; k < propId.length; k++) h = Math.imul(h ^ propId.charCodeAt(k), 16777619);
  return (Math.imul(h ^ tick, 2654435761) ^ (tick >>> 3)) >>> 0;
}

/** How many birds a nest on `plane` sends out for this seed. */
export function burstCount(t: WeaverTuning, plane: PlaneId, seed: number): number {
  const [lo, hi] = t.count[plane];
  return lo + Math.floor(weaverRng(seed ^ 0x9e3779b9)() * (hi - lo + 1));
}

/** The birds of one burst. `size` is the bird's wingspan on this plane (px). */
export function burstBirds(
  t: WeaverTuning,
  plane: PlaneId,
  seed: number,
  nest: NestShape,
  size: number,
): WeaverBird[] {
  const r = weaverRng(seed);
  const n = burstCount(t, plane, seed);
  const canDart = plane === 'near' || plane === 'mid';
  const out: WeaverBird[] = [];
  for (let i = 0; i < n; i++) {
    // Entrances are in the flat underside: spread across it, just above the belly line.
    const u = (i + 0.5) / n - 0.5 + (r() - 0.5) * 0.12;
    const hx = nest.ox + u * nest.rx * 1.5;
    const hy = nest.oy + nest.ry * (0.55 + r() * 0.3);
    const dir = r() < 0.5 ? -1 : 1;
    out.push({
      hx,
      hy,
      cx: nest.ox + (r() - 0.5) * nest.rx * 0.4,
      cy: nest.oy + nest.ry * (0.2 + r() * 0.6),
      orx: nest.rx * (0.9 + r() * 0.7),
      ory: nest.ry * (1.4 + r() * 1.6),
      phase: r() * Math.PI * 2,
      speed: dir * (2.4 + r() * 2.2),
      bob: size * (0.2 + r() * 0.4),
      bobHz: 1.5 + r() * 2,
      delay: (i / n) * (t.outMs / 1000) * 0.8 + r() * 0.08,
      dart:
        canDart && r() < t.dartChance
          ? {
              at: 0.6 + r() * 1.2,
              dur: 0.5 + r() * 0.3,
              dx: (r() - 0.5) * nest.rx * 1.6,
              dy: nest.ry * (1.5 + r() * 1.5),
            }
          : null,
      flap: Math.floor(r() * 8),
    });
  }
  return out;
}

const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Where bird `b` is `ts` seconds after its burst started, when the swirl ends `swirlEnd` seconds
 * after the start (a later hit pushes it back). `tick` drives the wingbeat.
 */
export function weaverPose(
  t: WeaverTuning,
  b: WeaverBird,
  ts: number,
  swirlEnd: number,
  tick: number,
): WeaverPose {
  const outS = t.outMs / 1000;
  const settleS = t.settleMs / 1000;
  const hidden: WeaverPose = {
    x: b.hx,
    y: b.hy,
    scale: 0,
    facing: 1,
    wingsUp: false,
    visible: false,
  };
  if (ts < b.delay || ts > swirlEnd + settleS + b.delay * 0.5) return hidden;
  const local = ts - b.delay;
  const a = b.phase + b.speed * local;
  let sx = b.cx + Math.cos(a) * b.orx;
  let sy = b.cy + Math.sin(a) * b.ory + Math.sin(local * b.bobHz * Math.PI * 2) * b.bob;
  // Swirl direction: facing follows the horizontal velocity.
  let facing = -Math.sin(a) * b.speed >= 0 ? 1 : -1;
  let scale = 1;
  if (b.dart !== null) {
    const u = (local - b.dart.at) / b.dart.dur;
    if (u > 0 && u < 1) {
      const k = Math.sin(Math.PI * u);
      sx += b.dart.dx * k;
      sy += b.dart.dy * k;
      scale += 1.8 * k;
      facing = b.dart.dx >= 0 ? 1 : -1;
    }
  }
  // Out of the hole (eased into the swirl), then back in after the swirl.
  const outK = ease(local / outS);
  const backK = ease((ts - swirlEnd - b.delay * 0.5) / settleS);
  const k = outK * (1 - backK);
  const x = b.hx + (sx - b.hx) * k;
  const y = b.hy + (sy - b.hy) * k;
  if (backK > 0 && backK < 1) facing = b.hx >= sx ? 1 : -1;
  const wingsUp = Math.floor((tick + b.flap) / t.flapTicks) % 2 === 0;
  return { x, y, scale: scale * (0.55 + 0.45 * k), facing, wingsUp, visible: k > 0.02 };
}
