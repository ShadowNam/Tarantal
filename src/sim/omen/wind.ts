// Karoo wind (GDD §11 omen): a direction (±1) and a strength (0..1 of the biome's effects),
// re-rolled every directionChangeSeconds. Flying birds with the wind go faster (tailwind), against
// it slower (headwind). v1.17 (D-079): a pellet drifts downwind on EVERY plane, more the farther
// it flies (driftPlaneMul by the plane's scroll factor: near a little, far the most, Ver more), and
// faster than linearly with strength (strength ^ strengthExponent: a strong gust clearly pushes
// the shot, a light breeze barely does). Gusts: short peaks on top of the period's strength.
// Randomness: rng.stream('omen') for the rolls; the gusts come from a stream seeded with the
// first roll (no extra draws on 'omen', so the showers, the storm and the dust devils keep their
// sequences). Tech §3.4.
import type { Biome } from '../../content/schemas';
import { secondsToTicks } from '../clock';
import { pow } from '../detmath';
import { createStream, type RandomStream } from '../rng';
import type { PlaneId, WindView } from '../types';

export type WindConfig = NonNullable<Biome['omen']['wind']>;

/** Each plane's scroll factor (from scoring.planes). */
export type PlaneFactors = Readonly<Record<PlaneId, number>>;

interface Gust {
  readonly start: number;
  readonly len: number;
}

export interface Wind {
  readonly cfg: WindConfig;
  dir: 1 | -1;
  /** The period's strength (rolled); `strengthNow()` adds the gust. */
  strength: number;
  ticksToChange: number;
  /** Ticks since the hunt began (the gust clock). */
  t: number;
  gust: Gust | null;
  nextGust: number;
  readonly gustRng: RandomStream | null;
  /** [scroll factor, drift mul] by factor, highest first (near → Ver). */
  readonly curve: readonly (readonly [number, number])[];
}

function roll(w: Wind, rng: RandomStream): void {
  w.dir = rng.chance(0.5) ? 1 : -1;
  w.strength = rng.range(w.cfg.strength[0], w.cfg.strength[1]);
  w.ticksToChange = Math.max(
    1,
    secondsToTicks(rng.range(w.cfg.directionChangeSeconds[0], w.cfg.directionChangeSeconds[1])),
  );
}

const PLANE_ORDER: readonly PlaneId[] = ['near', 'mid', 'far', 'ver'];

export function createWind(
  cfg: WindConfig,
  rng: RandomStream,
  planes: PlaneFactors = { near: 1, mid: 0.6, far: 0.35, ver: 0.22 },
): Wind {
  const mul = cfg.driftPlaneMul ?? { near: 0, mid: 0, far: 1, ver: 1 };
  const curve = PLANE_ORDER.map((p) => [planes[p], mul[p]] as const).sort((a, b) => b[0] - a[0]);
  const w: Wind = {
    cfg,
    dir: 1,
    strength: 0,
    ticksToChange: 0,
    t: 0,
    gust: null,
    nextGust: 0,
    gustRng: null,
    curve,
  };
  roll(w, rng);
  if (cfg.gusts === undefined) return w;
  // Seeded with the first roll's numbers: no extra draw on the omen stream.
  const seed = (w.ticksToChange * 7919 + Math.floor(w.strength * 1e6) + (w.dir > 0 ? 1 : 0)) >>> 0;
  const g: Wind = { ...w, gustRng: createStream(seed) };
  g.nextGust = gapTicks(g);
  return g;
}

function gapTicks(w: Wind): number {
  const r = w.gustRng;
  const g = w.cfg.gusts;
  if (r === null || g === undefined) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, secondsToTicks(r.range(g.everySeconds[0], g.everySeconds[1])));
}

/** Advances one tick; returns 'changed' when the wind was re-rolled, 'gust' when a gust began. */
export function tickWind(w: Wind, rng: RandomStream): false | 'changed' | 'gust' {
  w.t++;
  let out: false | 'changed' | 'gust' = false;
  if (w.gust !== null && w.t >= w.gust.start + w.gust.len) w.gust = null;
  const g = w.cfg.gusts;
  if (g !== undefined && w.gustRng !== null && w.gust === null && w.t >= w.nextGust) {
    const len = Math.max(1, secondsToTicks(w.gustRng.range(g.seconds[0], g.seconds[1])));
    w.gust = { start: w.t, len };
    w.nextGust = w.t + len + gapTicks(w);
    out = 'gust';
  }
  w.ticksToChange--;
  if (w.ticksToChange > 0) return out;
  roll(w, rng);
  return 'changed';
}

/** 0..1: how far into its peak the gust is (a quick rise, a slower fall), 0 without one. */
export function gustLevel(w: Wind): number {
  if (w.gust === null) return 0;
  const p = (w.t - w.gust.start) / w.gust.len;
  if (p < 0 || p >= 1) return 0;
  return p < 0.3 ? p / 0.3 : (1 - p) / 0.7;
}

/** The strength now: the period's plus the gust's (never above 1). */
export function strengthNow(w: Wind): number {
  const add = w.cfg.gusts?.add ?? 0;
  return Math.min(1, w.strength + add * gustLevel(w));
}

/** Speed multiplier for something flying in direction `sign` (0 = not moving across). The
 *  period's strength only (birds don't feel a gust). */
export function windSpeedMul(w: Wind | null, sign: number): number {
  if (w === null || sign === 0) return 1;
  const mul = Math.sign(sign) === w.dir ? w.cfg.tailwindSpeedMul : w.cfg.headwindSpeedMul;
  return 1 + (mul - 1) * w.strength;
}

/** The drift multiplier at scroll factor `f`: the planes' driftPlaneMul, linear between them
 *  (a prop layer between two planes), the end values beyond (the sky beyond Ver). */
export function planeDriftMul(curve: Wind['curve'], f: number): number {
  const first = curve[0];
  if (first === undefined) return 0;
  if (f >= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a === undefined || b === undefined) break;
    if (f >= b[0]) return b[1] + ((a[1] - b[1]) * (f - b[0])) / (a[0] - b[0]);
  }
  return curve[curve.length - 1]?.[1] ?? 0;
}

/** Screen-px drift at the far plane for a weapon with this wind sensitivity, now (signed). */
export function windDriftPx(w: Wind | null, windSensitivity: number): number {
  if (w === null) return 0;
  const e = w.cfg.strengthExponent ?? 1;
  const s = strengthNow(w);
  const shaped = e === 1 ? s : s <= 0 ? 0 : pow(s, e);
  return w.cfg.driftPxAtFar * shaped * w.dir * windSensitivity;
}

/** The drift of a pellet that reaches scroll factor `f` (screen px, signed). */
export function windDriftAt(w: Wind | null, windSensitivity: number, f: number): number {
  if (w === null) return 0;
  return windDriftPx(w, windSensitivity) * planeDriftMul(w.curve, f);
}

export function windView(w: Wind | null): WindView | null {
  if (w === null) return null;
  const e = w.cfg.strengthExponent ?? 1;
  const s = strengthNow(w);
  return {
    dir: w.dir,
    strength: s,
    gust: gustLevel(w),
    farDriftPx: w.cfg.driftPxAtFar * (e === 1 ? s : s <= 0 ? 0 : pow(s, e)),
    curve: w.curve,
  };
}
