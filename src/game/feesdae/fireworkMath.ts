// D-065: one New Year firework burst, worked out once: the art tool bakes its frames into the New
// Year sheet (tools/art/newyear.ts) and the game only picks the frame for the burst's age and its
// alpha (NuwejaarView) — no per-spark work in the game. Pure: the same numbers in both.
// The burst is the reviewed one: 16 sparks streaking out along their own rays at their own speeds
// (fast out, slowing), drifting down, the second half glittering (a flicker) as they fall; every
// whiteEvery-th spark white; a small bright core as it opens. Drawn at a reference radius.

/** A stable 0..1 hash of an integer and a salt. */
export function hash01(n: number, salt: number): number {
  let h = Math.imul(n ^ Math.imul(salt, 0x27d4eb2d), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The look numbers the burst needs (feel.json feesdae.looks.newyear.fireworks). */
export interface BurstLook {
  readonly sparks: number;
  readonly alpha: number;
  readonly trail: number;
  readonly core: { readonly px: number; readonly alpha: number; readonly until: number };
  readonly glitterFrom: number;
  readonly whiteEvery: number;
}

/** The radius the frames are drawn at (design px); a burst of radius r is shown at r / BURST_R. */
export const BURST_R = 84;
/** The spark pattern baked into the frames (the old per-burst slot's role). */
export const BURST_PATTERN = 7;
/** Frames in the strip, and the burst age (0 … 1) each one shows: more of them early, where it
 *  opens fast. */
export const BURST_FRAMES = 14;
export const BURST_T: readonly number[] = Array.from(
  { length: BURST_FRAMES },
  (_, i) => 0.93 * (i / (BURST_FRAMES - 1)) ** 1.7,
);
/** A frame cell (design px): the burst drawn at half size (it is shown 2× larger), its centre at
 *  (ox, oy); room for the sparks' reach (≤ BURST_R + a head) and their drop (below). */
export const BURST_CELL = { w: 96, h: 124, ox: 48, oy: 48, scale: 0.5 } as const;

/** The frame for a burst age t (0 … 1): the last one at or before it. */
export function burstFrameAt(t: number): number {
  let i = 0;
  while (i + 1 < BURST_FRAMES && (BURST_T[i + 1] ?? 2) <= t) i++;
  return i;
}

/** The whole burst's fade at age t (the game sets it as the images' alpha). */
export function burstAlpha(look: BurstLook, t: number): number {
  return look.alpha * (1 - t) ** 1.2;
}

export interface SparkAt {
  /** Head position from the centre (design px at BURST_R), the streak's rotation (radians). */
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  /** Streak length (× the 34 px streak) and thickness factors. */
  readonly len: number;
  readonly thick: number;
  readonly white: boolean;
  /** Alpha relative to the whole burst's fade (the glitter's flicker; 1 otherwise). */
  readonly alpha: number;
}

/** Every spark at age t; `flick` is the glitter's flicker step (the frame index when baked). */
export function burstSparks(look: BurstLook, t: number, flick: number): SparkAt[] {
  const n = look.sparks;
  const slot = BURST_PATTERN;
  const out = 1 - (1 - t) * (1 - t) * (1 - t);
  const speedNow = 3 * (1 - t) * (1 - t);
  const glitter = t > look.glitterFrom;
  const gt = glitter ? (t - look.glitterFrom) / (1 - look.glitterFrom) : 0;
  const fall = 0.3 * t * t + 0.5 * gt * gt;
  const sparks: SparkAt[] = [];
  for (let i = 0; i < n; i++) {
    const k = 0.55 + 0.45 * hash01(i * 31 + slot, 8);
    const ang = (i / n) * Math.PI * 2 + slot * 0.37 + (hash01(i, slot) - 0.5) * 0.3;
    const r = BURST_R * k * out;
    const dx = Math.cos(ang) * speedNow;
    const dy = Math.sin(ang) * speedNow + 0.6 * t;
    sparks.push({
      x: Math.cos(ang) * r,
      y: Math.sin(ang) * r + BURST_R * fall * k,
      rot: Math.atan2(dy, dx),
      len: Math.min(1, Math.sqrt(dx * dx + dy * dy) / 3) * (look.trail / 34) * k + 0.25,
      thick: 1.3 - 0.5 * t,
      white: (i + slot) % look.whiteEvery === 0,
      alpha: glitter && hash01(flick + i * 7, slot) < 0.35 ? 0.25 : 1,
    });
  }
  return sparks;
}

/** The core at age t: its size (× a 16 px spark) and alpha relative to the burst's fade, or null
 *  once it has gone. */
export function burstCore(look: BurstLook, t: number): { scale: number; alpha: number } | null {
  const ct = t / look.core.until;
  if (ct >= 1) return null;
  const fade = burstAlpha(look, t);
  return {
    scale: (look.core.px / 16) * (0.6 + 0.4 * ct),
    alpha: fade <= 0 ? 0 : Math.min(1, (look.core.alpha * (1 - ct)) / fade),
  };
}

/** Reduce flashes: the dots of the twinkle (no growth), at half the radius, each its own alpha. */
export function twinkleDots(look: BurstLook): { x: number; y: number; alpha: number }[] {
  const n = look.sparks;
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2;
    return {
      x: Math.cos(ang) * BURST_R * 0.5,
      y: Math.sin(ang) * BURST_R * 0.5,
      alpha: 0.6 + 0.4 * hash01(i + BURST_PATTERN, 7),
    };
  });
}
