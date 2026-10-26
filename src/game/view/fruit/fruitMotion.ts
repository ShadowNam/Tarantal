// v1.7c (D-047): how a fruit moves after shots, as a pure function of sim ticks (so a replay or
// a held frame `?holdAt` draws the same pose). A swing is a damped pendulum; each hit adds one
// (a linear oscillator, so hits simply add up). A hard hit snaps a hanging or standing fruit
// off: it falls, bounces on its ground line, rolls a little, lies there and fades. Fruit on the
// ground rock and roll a few px instead. Tunables: feel.json juice.fruit.
import type { Feel } from '../../../content/schemas';
import { TICKS_PER_SECOND } from '../../../sim/clock';
import type { FruitMotion, FruitSpot } from './fruitTypes';

export type FruitTuning = Feel['juice']['fruit'];

/** A hit: when, and its signed peak swing (radians; + = clockwise on screen). */
export interface FruitHit {
  readonly tick: number;
  readonly amp: number;
  /** Ground fruit: how far it rolls (signed px). */
  readonly nudge: number;
}

export interface FruitState {
  readonly hits: readonly FruitHit[];
  /** The tick it snapped off, and which way it flies (−1 left, +1 right). */
  readonly dropTick: number | null;
  readonly dropDir: number;
}

export const RESTING: FruitState = { hits: [], dropTick: null, dropDir: 1 };

/** Only this many recent hits are kept (older ones have long died down). */
const MAX_HITS = 6;
const DEG = Math.PI / 180;

const secondsSince = (tick: number, from: number): number =>
  Math.max(0, tick - from) / TICKS_PER_SECOND;

/** Damping rate: a swing falls to 5 % after swingSeconds. */
function decay(t: FruitTuning): number {
  return Math.log(20) / t.swingSeconds;
}

/** The swing angle at `tick` from the hits (radians). */
export function swingAngle(hits: readonly FruitHit[], tick: number, t: FruitTuning): number {
  const k = decay(t);
  const w = 2 * Math.PI * t.swingHz;
  let a = 0;
  for (const h of hits) {
    if (h.tick > tick) continue;
    const s = secondsSince(tick, h.tick);
    a += h.amp * Math.exp(-k * s) * Math.sin(w * s);
  }
  return a;
}

/** How big the swing still is at `tick` (the envelope, radians; 0 when still). */
export function swingEnvelope(hits: readonly FruitHit[], tick: number, t: FruitTuning): number {
  const k = decay(t);
  let e = 0;
  for (const h of hits)
    if (h.tick <= tick) e += Math.abs(h.amp) * Math.exp(-k * secondsSince(tick, h.tick));
  return e;
}

/** How a shot reached a fruit: pellets on it, near misses, and which way they push it. */
export interface ShotOnFruit {
  readonly tick: number;
  readonly pellets: number;
  readonly nearMisses: number;
  /** +1 pushes it right (the pellets came from its left), −1 left. */
  readonly push: number;
}

/** One-pellet swing (radians) after Settings → reduce motion. */
function baseAmp(t: FruitTuning, reduced: boolean): number {
  return t.swingDeg * DEG * (reduced ? t.reducedMotionMul : 1);
}

/** The state after a shot. Returns the same state when the shot does nothing to it. */
export function hitFruit(
  s: FruitState,
  motion: FruitMotion,
  shot: ShotOnFruit,
  t: FruitTuning,
  reduced: boolean,
): FruitState {
  if (s.dropTick !== null || (shot.pellets <= 0 && shot.nearMisses <= 0)) return s;
  const one = baseAmp(t, reduced);
  const cap = t.maxSwingDeg * DEG * (reduced ? t.reducedMotionMul : 1);
  const size =
    shot.pellets > 0
      ? Math.min(cap, one + (shot.pellets - 1) * t.perPelletDeg * DEG)
      : one * t.nearMissMul;
  if (motion !== 'ground' && shot.pellets > 0) {
    const swinging = swingEnvelope(s.hits, shot.tick, t) >= one * t.dropWhileSwinging;
    if (shot.pellets >= t.dropPellets || swinging)
      return { ...s, dropTick: shot.tick, dropDir: shot.push };
  }
  // A hanging fruit pushed right swings its bottom right: counter-clockwise about the stalk top.
  const sign = motion === 'hang' ? -shot.push : shot.push;
  const amp = motion === 'ground' ? Math.min(size, t.rockDeg * DEG) : size;
  const nudge =
    motion === 'ground' && shot.pellets > 0
      ? shot.push * t.nudgePx * (reduced ? t.reducedMotionMul : 1)
      : 0;
  const hits = [...s.hits, { tick: shot.tick, amp: sign * amp, nudge }].slice(-MAX_HITS);
  return { ...s, hits };
}

/**
 * A fruit's pose relative to its spot's pivot: where its body's pivot is and how it is turned,
 * how its stalk is turned (the stalk stays on the tree when the fruit snaps off), and opacity.
 */
export interface FruitPose {
  readonly angle: number;
  readonly bx: number;
  readonly by: number;
  readonly stalkAngle: number;
  readonly alpha: number;
  /** Ticks since it first landed (null before, or if it never fell). */
  readonly landedTicks: number | null;
}

/** The fall's timing (seconds from the drop): first landing, and when each bounce ends. */
export interface FallPlan {
  /** The body's pivot: its y travel to its resting place, and its x travel while it rolls. */
  readonly height: number;
  readonly roll: number;
  readonly land: number;
  /** Bounce k (from 0): starts at ends[k], ends at ends[k + 1]; its launch speed is speeds[k]. */
  readonly ends: readonly number[];
  readonly speeds: readonly number[];
  /** Angle it lies at once down (radians). */
  readonly lie: number;
}

const rot = (x: number, y: number, a: number): { x: number; y: number } => ({
  x: x * Math.cos(a) - y * Math.sin(a),
  y: x * Math.sin(a) + y * Math.cos(a),
});

/** A long fruit (sausage, flower spike) ends up lying across its fall. */
function liesAcross(spot: FruitSpot): boolean {
  return spot.fh > spot.fw * 1.4;
}

/** The angle a dropped fruit lies at: across its fall, tipped the way it flew; else upright. */
function lieAngle(spot: FruitSpot, dir: number): number {
  return liesAcross(spot) ? (dir >= 0 ? -1 : 1) * (Math.PI / 2) : 0;
}

/** Its x extent lying at `lie` with its pivot at x = 0 (design px). */
function lyingSpan(spot: FruitSpot, lie: number): readonly [number, number] {
  if (lie < 0) return [-spot.oy, spot.fh - spot.oy];
  if (lie > 0) return [-(spot.fh - spot.oy), spot.oy];
  return [-spot.ox, spot.fw - spot.ox];
}

/**
 * How far a dropped fruit's body pivot falls (from `startY`, its offset below the spot's pivot)
 * before it lies on the ground (px, ≥ 0).
 */
export function fallHeight(spot: FruitSpot, startY = spot.ay): number {
  // Lying across its fall, the pivot ends about half the fruit's width above the ground; an
  // upright one (lie 0) rests on the bottom of its frame.
  const below = liesAcross(spot) ? Math.min(spot.fw, spot.fh) / 2 : spot.fh - spot.oy;
  return Math.max(0, spot.ground - below - (spot.y + startY));
}

/**
 * The fall of a fruit dropped with its body pivot at `start` (offset from the spot's pivot),
 * flying toward `dir`. It rolls `rollPx` on, and further if it would lie against its trunk.
 */
export function fallPlan(
  spot: FruitSpot,
  dir: number,
  t: FruitTuning,
  reduced: boolean,
  start: { readonly x: number; readonly y: number } = { x: spot.ax, y: spot.ay },
): FallPlan {
  const g = t.gravityPxPerS2;
  const height = fallHeight(spot, start.y);
  const land = Math.sqrt((2 * height) / g);
  const ends = [land];
  const speeds: number[] = [];
  let v = g * land * (reduced ? 0 : t.bounce);
  for (let k = 0; k < (reduced ? 0 : t.bounces) && v > 1; k++) {
    speeds.push(v);
    ends.push((ends[ends.length - 1] ?? land) + (2 * v) / g);
    v *= t.bounce;
  }
  const lie = lieAngle(spot, dir);
  let roll = (reduced ? 0.5 : 1) * t.rollPx * dir;
  if (spot.trunk !== null) {
    // Where it would come to rest, and the trunk's foot it must lie clear of.
    const x = spot.x + start.x + land * t.driftPxPerS * dir + roll;
    const [a, b] = lyingSpan(spot, lie);
    const f0 = spot.trunk.x - spot.trunk.half - t.trunkClearPx;
    const f1 = spot.trunk.x + spot.trunk.half + t.trunkClearPx;
    if (x + b > f0 && x + a < f1) roll += dir >= 0 ? f1 - (x + a) : f0 - (x + b);
  }
  return { height, roll, land, ends, speeds, lie };
}

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** The pose at `tick`. */
export function fruitPose(
  spot: FruitSpot,
  s: FruitState,
  tick: number,
  t: FruitTuning,
  reduced: boolean,
): FruitPose {
  const swing = swingAngle(s.hits, tick, t);
  if (s.dropTick === null || tick < s.dropTick) {
    let dx = 0;
    for (const h of s.hits)
      if (h.tick <= tick)
        dx += h.nudge * (1 - Math.exp(-secondsSince(tick, h.tick) / t.rollSeconds));
    const b = rot(spot.ax, spot.ay, swing);
    return {
      angle: swing,
      bx: b.x + dx,
      by: b.y,
      stalkAngle: swing,
      alpha: 1,
      landedTicks: null,
    };
  }
  const start = swingAngle(s.hits, s.dropTick, t);
  const from = rot(spot.ax, spot.ay, start);
  const plan = fallPlan(spot, s.dropDir, t, reduced, from);
  const g = t.gravityPxPerS2;
  const at = secondsSince(tick, s.dropTick);
  let dy: number;
  if (at < plan.land) dy = 0.5 * g * at * at;
  else {
    dy = plan.height;
    for (let k = 0; k < plan.speeds.length; k++) {
      const b0 = plan.ends[k] ?? 0;
      const b1 = plan.ends[k + 1] ?? 0;
      const v = plan.speeds[k] ?? 0;
      if (at >= b0 && at < b1) {
        const u = at - b0;
        dy = plan.height - (v * u - 0.5 * g * u * u);
      }
    }
  }
  const settled = plan.ends[plan.ends.length - 1] ?? plan.land;
  const fly = Math.min(at, plan.land) * t.driftPxPerS * s.dropDir;
  const after = Math.max(0, at - plan.land);
  const roll = plan.roll * (1 - Math.exp(-after / t.rollSeconds));
  const angle = start + (plan.lie - start) * smooth(at / Math.max(0.05, settled));
  const lying = Math.max(0, at - settled);
  const alpha =
    lying < t.fadeAfterSeconds ? 1 : Math.max(0, 1 - (lying - t.fadeAfterSeconds) / t.fadeSeconds);
  const landedTicks = at >= plan.land ? Math.round((at - plan.land) * TICKS_PER_SECOND) : null;
  return {
    angle,
    bx: from.x + fly + roll,
    by: from.y + dy,
    stalkAngle: swing,
    alpha,
    landedTicks,
  };
}

/** The tick a dropped fruit first lands (null if it has not been dropped). */
export function landTick(
  spot: FruitSpot,
  s: FruitState,
  t: FruitTuning,
  reduced: boolean,
): number | null {
  if (s.dropTick === null) return null;
  const from = rot(spot.ax, spot.ay, swingAngle(s.hits, s.dropTick, t));
  return (
    s.dropTick + Math.round(fallPlan(spot, s.dropDir, t, reduced, from).land * TICKS_PER_SECOND)
  );
}
