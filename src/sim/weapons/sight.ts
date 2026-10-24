// v1.3 rifle sights (GDD §10.6, Tech §3.4, D-036): hold to raise the sight and zoom, release to
// fire. Pure state over ticks. The aim point is in design px of the UNZOOMED screen (dx from the
// centre, sy from the top) — the zoom is a view on the same world point, so a zoomed shot lands
// on the same world point on every screen size (Tech §3.3).
//
// Sway is a slow figure-eight (x at the loop rate, y at twice it, half as tall). Its phase and a
// small pace change are drawn from rng.stream('sway') at each raise, so a replay sways the same.
// Breath: after holdAfter ticks of holding the sway eases to holdMul (breath held) for holdTicks,
// then grows to tiredMul over tireTicks — you can't camp on a bird.
import type { Sight } from '../../content/schemas';
import { msToTicks } from '../clock';
import { sin } from '../detmath';
import type { RandomStream } from '../rng';

export interface SightTiming {
  readonly id: string;
  readonly zoom: readonly number[];
  readonly raiseTicks: number;
  readonly swayPx: number;
  readonly swayPerStep: number;
  readonly swayPeriodTicks: number;
  readonly swayPace: readonly [number, number];
  readonly swayHeight: number;
  readonly holdAfterTicks: number;
  readonly easeTicks: number;
  readonly holdTicks: number;
  readonly holdMul: number;
  readonly tireTicks: number;
  readonly tiredMul: number;
}

export function sightTiming(s: Sight): SightTiming {
  return {
    id: s.id,
    zoom: s.zoom,
    raiseTicks: Math.max(1, msToTicks(s.raiseMs)),
    swayPx: s.swayPx,
    swayPerStep: s.swayPerStep,
    swayPeriodTicks: Math.max(1, msToTicks(s.swayPeriodMs)),
    swayPace: s.swayPace,
    swayHeight: s.swayHeight,
    holdAfterTicks: msToTicks(s.breath.holdAfterMs),
    easeTicks: Math.max(1, msToTicks(s.breath.easeMs)),
    holdTicks: Math.max(1, msToTicks(s.breath.holdMs)),
    holdMul: s.breath.holdMul,
    tireTicks: Math.max(1, msToTicks(s.breath.tireMs)),
    tiredMul: s.breath.tiredMul,
  };
}

/** A sight on its way up or up. */
export interface Aim {
  dx: number;
  sy: number;
  /** Ticks since the press (0 on the press tick). */
  heldTicks: number;
  /** Loop phase (radians) and pace (× the sight's loop rate), drawn at the raise. */
  readonly phase: number;
  readonly pace: number;
  /** Zoom step at the press (a zoom change while raised applies from the next raise). */
  readonly step: number;
}

/** Starts a raise: two draws from the sway stream (always two, whatever the sight). */
export function raiseSight(
  dx: number,
  sy: number,
  step: number,
  rng: RandomStream,
  t: Pick<SightTiming, 'swayPace'>,
): Aim {
  const phase = rng.range(0, 2 * Math.PI);
  const pace = rng.range(t.swayPace[0], t.swayPace[1]);
  return { dx, sy, heldTicks: 0, phase, pace, step };
}

/** 0..1: how far the sight is up. */
export function raiseProgress(a: Aim, t: SightTiming): number {
  return Math.min(1, a.heldTicks / t.raiseTicks);
}

export const isUp = (a: Aim, t: SightTiming): boolean => a.heldTicks >= t.raiseTicks;

export type Breath = 'raising' | 'steady' | 'held' | 'tired';

/** Sway amplitude multiplier at `held` ticks into the hold, and the breath state. */
export function breathAt(held: number, t: SightTiming): { mul: number; breath: Breath } {
  const startHold = t.holdAfterTicks;
  const settled = startHold + t.easeTicks;
  const endHold = settled + t.holdTicks;
  const tired = endHold + t.tireTicks;
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
  if (held < startHold) return { mul: 1, breath: held < t.raiseTicks ? 'raising' : 'steady' };
  if (held < settled)
    return { mul: lerp(1, t.holdMul, (held - startHold) / t.easeTicks), breath: 'held' };
  if (held < endHold) return { mul: t.holdMul, breath: 'held' };
  if (held < tired)
    return { mul: lerp(t.holdMul, t.tiredMul, (held - endHold) / t.tireTicks), breath: 'tired' };
  return { mul: t.tiredMul, breath: 'tired' };
}

/** Sway offset now (unzoomed design px). Grows in with the raise, so a hip shot barely sways. */
export function swayAt(a: Aim, t: SightTiming): { dx: number; dy: number } {
  const amp =
    (t.swayPx + t.swayPerStep * a.step) * breathAt(a.heldTicks, t).mul * raiseProgress(a, t);
  if (amp === 0) return { dx: 0, dy: 0 };
  const w = ((2 * Math.PI) / t.swayPeriodTicks) * a.pace;
  const th = w * a.heldTicks + a.phase;
  return { dx: amp * sin(th), dy: amp * t.swayHeight * sin(2 * th) };
}

/** The zoom step clamped to the sight's steps. */
export function clampStep(step: number, t: SightTiming): number {
  return Math.min(t.zoom.length - 1, Math.max(0, Math.trunc(step)));
}
