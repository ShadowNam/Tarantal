// Sim time is integer ticks at a fixed 60 Hz (Tech §3.2). Convert seconds/ms → ticks only at
// load time or at boundaries, never inside per-tick logic.

export const TICKS_PER_SECOND = 60;

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

export function msToTicks(ms: number): number {
  return Math.round((ms * TICKS_PER_SECOND) / 1000);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}
