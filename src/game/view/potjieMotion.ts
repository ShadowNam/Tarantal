// D-051 (Karoo polish, product owner 26 Oct): the potjie simmers and, shot, its lid flies off.
// Every pose here is a pure function of the sim tick (a held frame holds still; a replay looks the
// same), unit-tested; PotjieView draws them. Positions are design px from the prop's origin
// (tools/art/potjie.ts potjieHd: the rim's middle is at POT_RIM = (0, RIM_Y)).
import { TICKS_PER_SECOND } from '../../sim/clock';

/** Where the lid sits on the rim (its texture's origin), and the ground beside the pot. */
export const RIM_Y = -30;
export const LID_REST = { x: 122, y: 98, rot: Math.PI * 2 + 0.32 } as const;

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
  const lift = (calm ? 2.5 : 6) * Math.abs(Math.sin(p * Math.PI * 4)) * fade;
  const rot = (calm ? 0.02 : 0.06) * Math.sin(p * Math.PI * 7) * fade;
  return { x: rot * 30, y: RIM_Y - lift, rot, rattling: true };
}

/** True on the ticks a rattle knocks the lid back on the rim (one clack each). */
export function rattleClack(tick: number, calm: boolean): boolean {
  const d = tick - rattleStart(tick, calm);
  return d >= 0 && d < RATTLE_TICKS && d % 6 === 0;
}

/** The lid's flight: pops up, tumbles off and lands beside the pot (FLIGHT_TICKS), then rests. */
export const FLIGHT_TICKS = 40;
export function lidFlight(sinceOff: number): LidPose & { landed: boolean } {
  const s = Math.max(0, sinceOff);
  if (s >= FLIGHT_TICKS + 12) return { ...LID_REST, landed: true };
  if (s >= FLIGHT_TICKS) {
    // A small bounce where it lands.
    const b = (s - FLIGHT_TICKS) / 12;
    return {
      x: LID_REST.x + 4 * b,
      y: LID_REST.y - 7 * Math.sin(b * Math.PI) * (1 - b),
      rot: LID_REST.rot + 0.12 * Math.sin(b * Math.PI) * (1 - b),
      landed: true,
    };
  }
  const u = s / FLIGHT_TICKS;
  // Straight up first (the pop), then over to the side and down; one full tumble on the way.
  const x = LID_REST.x * u * u * (3 - 2 * u);
  const y = RIM_Y + (LID_REST.y - RIM_Y) * u * u - 150 * 4 * u * (1 - u) * (1 - u * 0.35);
  const rot = LID_REST.rot * (1 - (1 - u) * (1 - u));
  return { x, y, rot, landed: false };
}

/** The tick the lid lands (its clang). */
export const LID_LANDS = FLIGHT_TICKS;

/** The lid this frame (on the pot, rattling, flying or lying beside it). */
export function lidPose(s: PotState): LidPose {
  return s.sinceOff === null ? lidOnPot(s.tick, s.calm) : lidFlight(s.sinceOff);
}

/** Steam: soft wisps rising from under the lid (or the open pot), drifting with the wind. */
export function steam(s: PotState): Wisp[] {
  const off = s.sinceOff !== null;
  // Lid on: clearly visible white wisps from the lid's edge (the review found the first, fainter
  // ones read as "no steam"); lid off: a fuller column from the whole mouth.
  const count = (off ? 9 : 7) - (s.calm ? 2 : 0);
  const period = Math.round((off ? 2.2 : 2.6) * (s.calm ? 1.5 : 1) * TICKS_PER_SECOND);
  const rise = off ? 170 : 150;
  const sway = s.calm ? 4 : 9;
  const drift = 14 + s.wind * 70;
  const out: Wisp[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((((s.tick + Math.floor((i * period) / count)) % period) + period) % period) / period;
    // Lid on: from the gaps either side of the knob; off: across the whole mouth.
    const x0 = off
      ? (i / Math.max(1, count - 1) - 0.5) * 70
      : (i % 2 === 0 ? -1 : 1) * (18 + (i % 3) * 9);
    const y0 = RIM_Y - (off ? 2 : 18);
    const fadeIn = Math.min(1, a / 0.15);
    const swing = Math.sin(a * TAU * 0.8 + i * 1.7);
    out.push({
      x: x0 + swing * sway * a + drift * a * a,
      y: y0 - rise * a,
      scale: (off ? 0.55 : 0.45) + (off ? 1.3 : 1.0) * a,
      alpha: (off ? 0.7 : 0.8) * fadeIn * Math.pow(1 - a, 1.2),
      lean: Math.max(-1, Math.min(1, s.wind + swing * 0.3 * a)),
    });
  }
  // A puff when the lid rattles, a big one when it pops.
  const puff = (age: number, n: number, big: boolean): void => {
    for (let k = 0; k < n; k++) {
      const f = k / Math.max(1, n - 1) - 0.5;
      out.push({
        x: f * (big ? 90 : 60) * (0.4 + age) + drift * age * 0.5,
        y: RIM_Y - 8 - (big ? 120 : 50) * age,
        scale: (big ? 0.8 : 0.5) + (big ? 1.6 : 0.8) * age,
        alpha: (big ? 0.8 : 0.6) * Math.pow(1 - age, 1.6),
        lean: Math.max(-1, Math.min(1, s.wind + f * 0.5)),
      });
    }
  };
  if (s.sinceOff === null) {
    const d = s.tick - rattleStart(s.tick, s.calm);
    if (d >= 0 && d < 40) puff(d / 40, s.calm ? 2 : 3, false);
  } else if (s.sinceOff < 60) puff(s.sinceOff / 60, s.calm ? 4 : 6, true);
  return out;
}

/** The coals' glow (alpha 0 … 1): a gentle flicker, slower and steadier with reduce motion. */
export function coalGlow(tick: number, calm: boolean): number {
  const k = calm ? 0.5 : 1;
  return (
    0.6 +
    0.14 * k * Math.sin(tick * 0.11 * k) +
    0.08 * k * Math.sin(tick * 0.29 * k + 1.3) +
    0.05 * k * Math.sin(tick * 0.71 + 0.4)
  );
}

/** The simmer bed: a soft bubble on these ticks (a few a second, irregular). */
export function bubbleAt(tick: number, lidOff: boolean): boolean {
  const step = lidOff ? 9 : 13;
  if (tick % step !== 0) return false;
  return hash01(Math.floor(tick / step) + 7919) < (lidOff ? 0.75 : 0.55);
}
