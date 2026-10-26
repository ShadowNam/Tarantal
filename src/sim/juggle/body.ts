// v1.8 (D-050, GDD §11.3): a small, generic "juggle body" — something that rests until it is hit,
// is kicked away from the hit side, spins, falls under gravity, is kicked higher by every further
// hit while it is in the air (the chain), bounces once on the ground and lies there, or climbs out
// of the top of the view and is gone. Tin cans are its first user; makalani nuts can follow.
// Pure and deterministic: plane px and ticks only, detmath-free arithmetic, randomness only from
// the stream the caller passes (its own system's), every number from the caller's tuning.
import { TICKS_PER_SECOND } from '../clock';
import { degToRad } from '../detmath';
import type { RandomStream } from '../rng';

/** Flight numbers already in plane px for this body's plane (the caller applies tuningRatio). */
export interface JuggleTuning {
  readonly gravityPxPerSec2: number;
  readonly kickUpPxPerSec: number;
  readonly kickSidePxPerSec: number;
  /** A hit on the centre line still pushes this share of kickSide (away from the shooter's side). */
  readonly minSideShare: number;
  readonly spinDegPerSec: number;
  readonly upGrowth: number;
  readonly spinGrowthDegPerSec: number;
  readonly jitterPxPerSec: number;
  readonly jitterGrowthPxPerSec: number;
  readonly growthCapHits: number;
  readonly pelletBonus: number;
  readonly pelletCap: number;
  readonly bounce: { readonly restitution: number; readonly keep: number };
  readonly goneMarginPx: number;
}

/** rest: where it was put; air: flying (the chain may grow); bounced: its one bounce, still in
 *  the air and still juggled; landed: lying on the ground for good; gone: out of the top. */
export type JuggleState = 'rest' | 'air' | 'bounced' | 'landed' | 'gone';

export interface JuggleBody {
  x: number;
  y: number;
  /** px per tick. */
  vx: number;
  vy: number;
  /** Radians, clockwise on screen; spin in radians per tick. */
  angle: number;
  spin: number;
  state: JuggleState;
  /** Air hits so far (0 after the knock-off). */
  chain: number;
  /** Where its centre comes to rest on the ground (y of the centre lying down). */
  readonly groundY: number;
  /** Its reach from the centre (the top of the view test and the ground contact). */
  readonly extent: number;
}

export function restingBody(x: number, y: number, groundY: number, extent: number): JuggleBody {
  return { x, y, vx: 0, vy: 0, angle: 0, spin: 0, state: 'rest', chain: 0, groundY, extent };
}

/** Is it in the air (a hit there grows the chain)? */
export const airborne = (b: JuggleBody): boolean => b.state === 'air' || b.state === 'bounced';

/** Can a hit move it (resting or in the air)? Landed and gone bodies are done. */
export const kickable = (b: JuggleBody): boolean => b.state === 'rest' || airborne(b);

export interface KickResult {
  /** 'knock' = it was resting; 'juggle' = an air hit, `chain` is the new count (1, 2, …). */
  readonly kind: 'knock' | 'juggle';
  readonly chain: number;
}

/**
 * A hit: `side` is where it struck across the body, −1 (its left edge) … 1 (its right edge); it
 * flies the other way. `pellets` on it in this one shot give one stronger kick (capped).
 * Returns null for a body that can't be kicked.
 */
export function kick(
  b: JuggleBody,
  t: JuggleTuning,
  side: number,
  pellets: number,
  rng: RandomStream,
): KickResult | null {
  if (!kickable(b)) return null;
  const kind = b.state === 'rest' ? 'knock' : 'juggle';
  const n = kind === 'knock' ? 0 : b.chain + 1;
  const g = Math.min(n, t.growthCapHits);
  const power = Math.min(1 + t.pelletBonus * Math.max(0, pellets - 1), t.pelletCap);
  const s = Math.max(-1, Math.min(1, side));
  // Away from the hit side; a dead-centre hit still goes one way (the sign of a zero is +1 → left).
  const dir = s > 0 ? -1 : 1;
  const share = Math.max(t.minSideShare, Math.abs(s));
  const jitter = t.jitterPxPerSec + t.jitterGrowthPxPerSec * g;
  const vxSec = (dir * t.kickSidePxPerSec * share + rng.range(-jitter, jitter)) * power;
  const vySec = -t.kickUpPxPerSec * (1 + t.upGrowth * g) * power;
  const spinSec = degToRad(t.spinDegPerSec + t.spinGrowthDegPerSec * g);
  b.vx = vxSec / TICKS_PER_SECOND;
  b.vy = vySec / TICKS_PER_SECOND;
  // It somersaults the way it flies.
  b.spin = ((vxSec >= 0 ? 1 : -1) * spinSec) / TICKS_PER_SECOND;
  b.chain = n;
  b.state = 'air';
  return { kind, chain: n };
}

export type StepResult = 'bounced' | 'landed' | 'gone' | null;

/** One tick of flight. `topY` is the top of the view in plane px (0). */
export function stepBody(b: JuggleBody, t: JuggleTuning, topY: number): StepResult {
  if (!airborne(b)) return null;
  const g = t.gravityPxPerSec2 / (TICKS_PER_SECOND * TICKS_PER_SECOND);
  b.vy += g;
  b.x += b.vx;
  b.y += b.vy;
  b.angle += b.spin;
  if (b.y + b.extent < topY - t.goneMarginPx) {
    b.state = 'gone';
    return 'gone';
  }
  if (b.vy > 0 && b.y >= b.groundY) {
    b.y = b.groundY;
    if (b.state === 'air') {
      b.state = 'bounced';
      b.vy = -b.vy * t.bounce.restitution;
      b.vx *= t.bounce.keep;
      b.spin *= t.bounce.keep;
      return 'bounced';
    }
    b.state = 'landed';
    b.vx = 0;
    b.vy = 0;
    b.spin = 0;
    // Lying on its side: the nearest quarter turn that lies flat (± π/2).
    const turn = Math.PI;
    const k = Math.round((b.angle - Math.PI / 2) / turn);
    b.angle = Math.PI / 2 + k * turn;
    return 'landed';
  }
  return null;
}

/** The body's flight numbers on a plane: px tunings × ratio (tuningRatio of the plane). */
export function scaledTuning<T extends JuggleTuning>(t: T, ratio: number): JuggleTuning {
  return {
    ...t,
    gravityPxPerSec2: t.gravityPxPerSec2 * ratio,
    kickUpPxPerSec: t.kickUpPxPerSec * ratio,
    kickSidePxPerSec: t.kickSidePxPerSec * ratio,
    jitterPxPerSec: t.jitterPxPerSec * ratio,
    jitterGrowthPxPerSec: t.jitterGrowthPxPerSec * ratio,
  };
}
