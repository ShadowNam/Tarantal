// D-051 (Karoo polish, product owner 26 Oct): the potjie simmers and, shot, its lid flies off.
// Every pose here is a pure function of the sim tick (a held frame holds still; a replay looks the
// same), unit-tested; PotjieView draws them. Positions are design px from the prop's origin
// (tools/art/potjie.ts potjieHd: the rim's middle is at POT_RIM = (0, RIM_Y)).
import { TICKS_PER_SECOND } from '../../sim/clock';

/** Where the lid sits on the rim (its texture's origin), and the ground beside the pot. */
export const RIM_Y = -30;
export const LID_REST = { x: 122, y: 98, rot: Math.PI * 2 + 0.32 } as const;

/** The look, in one place (design px from the prop's origin, ticks, 0 … 1 alphas). */
export const LOOK = {
  /** Steam with the lid on: white wisps from the lid's edge, clearly visible (review 27 Oct). */
  lidOn: { count: 7, calmCount: 5, period: 2.6, rise: 150, y0: 18, scale: [0.45, 1.0], alpha: 0.8 },
  /** Steam with the lid off: a fuller column across the whole mouth. */
  lidOff: {
    count: 9,
    calmCount: 7,
    period: 2.2,
    rise: 170,
    y0: 2,
    width: 70,
    scale: [0.55, 1.3],
    alpha: 0.7,
  },
  /** Lid-on wisps start either side of the knob, this far out (plus a step per wisp). */
  edge: { x: 18, step: 9 },
  /** Reduce motion: the steam's cycle runs this much slower; the sway is smaller. */
  calmSlow: 1.5,
  sway: { normal: 9, calm: 4 },
  /** Drift: a little to the right in still air, plus the wind. */
  drift: { still: 14, wind: 70 },
  /** A rattle's puff: from both lid edges, white, readable (review: it hid behind the lid). */
  rattlePuff: {
    ticks: 40,
    count: 4,
    calmCount: 2,
    edge: 44,
    spread: 16,
    y0: 18,
    rise: 90,
    scale: [0.5, 0.8],
    alpha: 0.95,
  },
  /** The pop's big puff, when the lid flies off. */
  popPuff: {
    ticks: 60,
    count: 6,
    calmCount: 4,
    width: 90,
    y0: 8,
    rise: 120,
    scale: [0.8, 1.6],
    alpha: 0.8,
  },
  /** The lid's flight: how high it pops, and its bounce where it lands. */
  flight: { pop: 150, popEase: 0.35, bounceX: 4, bounceY: 7, bounceRot: 0.12 },
  /** A rattle: lift (px) and tilt (rad), normal and calm. */
  rattle: { lift: 6, calmLift: 2.5, tilt: 0.06, calmTilt: 0.02, bumps: 4 },
} as const;

/** How the pot is drawn this frame. */
export interface PotState {
  readonly tick: number;
  /** Ticks since the lid was shot off (null = still on). */
  readonly sinceOff: number | null;
  /** Reduce motion: calmer steam, smaller and rarer rattles. */
  readonly calm: boolean;
  /** Wind across the view (−1 … 1 × strength), or 0. */
  readonly wind: number;
}

export interface Wisp {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly alpha: number;
  /** Which way it leans (−1 … 1): with the wind and its sway. */
  readonly lean: number;
}

export interface LidPose {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
}

const TAU = Math.PI * 2;

/** A fixed 0 … 1 from an integer (which tick of a cycle the lid rattles on). */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x2545f491, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca77);
  return ((x ^ (x >>> 13)) >>> 0) / 0x1_0000_0000;
}

/** Rattles: one every RATTLE_CYCLE (± a bit), RATTLE_TICKS long. */
export const RATTLE_CYCLE = 4 * TICKS_PER_SECOND;
export const RATTLE_CYCLE_CALM = 7 * TICKS_PER_SECOND;
export const RATTLE_TICKS = 24;

/** The tick the rattle of the cycle holding `tick` starts on. */
export function rattleStart(tick: number, calm: boolean): number {
  const cycle = calm ? RATTLE_CYCLE_CALM : RATTLE_CYCLE;
  const c = Math.floor(tick / cycle);
  return c * cycle + Math.floor(hash01(c) * (cycle - RATTLE_TICKS - TICKS_PER_SECOND));
}

/** The lid on the pot: lifted `lift` px and tilted `rot` rad while it rattles (0 otherwise). */
export function lidOnPot(tick: number, calm: boolean): LidPose & { rattling: boolean } {
  const p = (tick - rattleStart(tick, calm)) / RATTLE_TICKS;
  if (p < 0 || p >= 1) return { x: 0, y: RIM_Y, rot: 0, rattling: false };
  const fade = 1 - p;
  const r = LOOK.rattle;
  const lift = (calm ? r.calmLift : r.lift) * Math.abs(Math.sin(p * Math.PI * r.bumps)) * fade;
  const rot = (calm ? r.calmTilt : r.tilt) * Math.sin(p * Math.PI * 7) * fade;
  return { x: rot * 30, y: RIM_Y - lift, rot, rattling: true };
}

/** Ticks between the rattle's drops back onto the rim. */
const DROP_TICKS = RATTLE_TICKS / LOOK.rattle.bumps;

/**
 * True on the ticks a rattle drops the lid back on the rim (one clack each): the drops inside the
 * rattle, three of them — never at its start, as the lid lifts, nor at its very end, where the
 * last bump has faded to nothing.
 */
export function rattleClack(tick: number, calm: boolean): boolean {
  const d = tick - rattleStart(tick, calm);
  return d > 0 && d < RATTLE_TICKS && d % DROP_TICKS === 0;
}

/** The lid's flight: pops up, tumbles off and lands beside the pot (FLIGHT_TICKS), then rests. */
export const FLIGHT_TICKS = 40;
/** The small bounce where it lands (ticks); after it the lid lies still. */
export const BOUNCE_TICKS = 12;
/** Ticks after the shot from which the lid lies still beside the pot. */
export const LID_SETTLED = FLIGHT_TICKS + BOUNCE_TICKS;
export function lidFlight(sinceOff: number): LidPose & { landed: boolean } {
  const s = Math.max(0, sinceOff);
  if (s >= LID_SETTLED) return { ...LID_REST, landed: true };
  if (s >= FLIGHT_TICKS) {
    // A small bounce where it lands.
    const b = (s - FLIGHT_TICKS) / BOUNCE_TICKS;
    const f = LOOK.flight;
    return {
      x: LID_REST.x + f.bounceX * b,
      y: LID_REST.y - f.bounceY * Math.sin(b * Math.PI) * (1 - b),
      rot: LID_REST.rot + f.bounceRot * Math.sin(b * Math.PI) * (1 - b),
      landed: true,
    };
  }
  const u = s / FLIGHT_TICKS;
  // Straight up first (the pop), then over to the side and down; one full tumble on the way.
  const x = LID_REST.x * u * u * (3 - 2 * u);
  const { pop, popEase } = LOOK.flight;
  const y = RIM_Y + (LID_REST.y - RIM_Y) * u * u - pop * 4 * u * (1 - u) * (1 - u * popEase);
  const rot = LID_REST.rot * (1 - (1 - u) * (1 - u));
  return { x, y, rot, landed: false };
}

/** The tick the lid lands (its clang). */
export const LID_LANDS = FLIGHT_TICKS;

/** The lid this frame (on the pot, rattling, flying or lying beside it). */
export function lidPose(s: PotState): LidPose {
  return s.sinceOff === null ? lidOnPot(s.tick, s.calm) : lidFlight(s.sinceOff);
}

/** Steam: soft wisps rising from the lid's edge (or the open pot), drifting with the wind. */
export function steam(s: PotState): Wisp[] {
  const off = s.sinceOff !== null;
  const L = off ? LOOK.lidOff : LOOK.lidOn;
  const count = s.calm ? L.calmCount : L.count;
  const period = Math.round(L.period * (s.calm ? LOOK.calmSlow : 1) * TICKS_PER_SECOND);
  const sway = s.calm ? LOOK.sway.calm : LOOK.sway.normal;
  const drift = LOOK.drift.still + s.wind * LOOK.drift.wind;
  const lean = (v: number): number => Math.max(-1, Math.min(1, v));
  const out: Wisp[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((((s.tick + Math.floor((i * period) / count)) % period) + period) % period) / period;
    // Lid on: from the gaps either side of the knob; off: across the whole mouth.
    const x0 = off
      ? (i / Math.max(1, count - 1) - 0.5) * LOOK.lidOff.width
      : (i % 2 === 0 ? -1 : 1) * (LOOK.edge.x + (i % 3) * LOOK.edge.step);
    const fadeIn = Math.min(1, a / 0.15);
    const swing = Math.sin(a * TAU * 0.8 + i * 1.7);
    out.push({
      x: x0 + swing * sway * a + drift * a * a,
      y: RIM_Y - L.y0 - L.rise * a,
      scale: L.scale[0] + L.scale[1] * a,
      alpha: L.alpha * fadeIn * Math.pow(1 - a, 1.2),
      lean: lean(s.wind + swing * 0.3 * a),
    });
  }
  if (s.sinceOff === null) {
    // A rattle's puff: white wisps squeezed out at both edges of the lid.
    const P = LOOK.rattlePuff;
    const d = s.tick - rattleStart(s.tick, s.calm);
    if (d >= 0 && d < P.ticks) {
      const age = d / P.ticks;
      const n = s.calm ? P.calmCount : P.count;
      for (let k = 0; k < n; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const x0 = side * (P.edge + Math.floor(k / 2) * P.spread);
        out.push({
          x: x0 + side * 20 * age + drift * age * 0.5,
          y: RIM_Y - P.y0 - P.rise * age,
          scale: P.scale[0] + P.scale[1] * age,
          alpha: P.alpha * Math.min(1, age / 0.1) * Math.pow(1 - age, 1.6),
          lean: lean(s.wind + side * 0.4),
        });
      }
    }
  } else if (s.sinceOff < LOOK.popPuff.ticks) {
    // The pop: a big puff out of the open pot.
    const P = LOOK.popPuff;
    const age = s.sinceOff / P.ticks;
    const n = s.calm ? P.calmCount : P.count;
    for (let k = 0; k < n; k++) {
      const f = k / Math.max(1, n - 1) - 0.5;
      out.push({
        x: f * P.width * (0.4 + age) + drift * age * 0.5,
        y: RIM_Y - P.y0 - P.rise * age,
        scale: P.scale[0] + P.scale[1] * age,
        alpha: P.alpha * Math.pow(1 - age, 1.6),
        lean: lean(s.wind + f * 0.5),
      });
    }
  }
  return out;
}

/** The coals' glow (alpha 0 … 1): a gentle flicker, slower and steadier with reduce motion. */
export function coalGlow(tick: number, calm: boolean): number {
  const k = calm ? 0.5 : 1;
  return (
    0.6 +
    0.14 * k * Math.sin(tick * 0.11 * k) +
    0.08 * k * Math.sin(tick * 0.29 * k + 1.3) +
    0.05 * k * Math.sin(tick * 0.71 * k + 0.4)
  );
}

/** The simmer bed: a soft bubble on these ticks (a few a second, irregular). */
export function bubbleAt(tick: number, lidOff: boolean): boolean {
  const step = lidOff ? 9 : 13;
  if (tick % step !== 0) return false;
  return hash01(Math.floor(tick / step) + 7919) < (lidOff ? 0.75 : 0.55);
}
