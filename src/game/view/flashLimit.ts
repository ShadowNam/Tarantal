// Photosensitivity guard (GDD §18.3, WCAG 2.3.1, CLAUDE.md): no more than N large-area flashes
// (lightning light, the Stormvoël's lit darkness, Stampede pulses) in any one second, shared by
// every source on screen. Content already spaces lightning (≤ 2 a second, D-025); this is the
// client-side backstop. Pure; real time in ms.

export class FlashLimiter {
  private readonly starts: number[] = [];

  constructor(private readonly maxPerSecond: number) {}

  /** Asks to start a flash now: true (and counted) if fewer than N started in the last second. */
  start(nowMs: number): boolean {
    while (this.starts.length > 0 && nowMs - (this.starts[0] ?? 0) >= 1000) this.starts.shift();
    if (this.starts.length >= this.maxPerSecond) return false;
    this.starts.push(nowMs);
    return true;
  }
}

/**
 * One flash source (a lightning light): asks the shared limiter when its flash turns on, and
 * stays dark for that whole flash if it was refused.
 */
export class FlashGate {
  private on = false;
  private granted = false;

  constructor(private readonly limiter: FlashLimiter) {}

  /** Whether the flash may show this frame, given whether the source wants it on. */
  lit(wantOn: boolean, nowMs: number): boolean {
    if (wantOn && !this.on) this.granted = this.limiter.start(nowMs);
    this.on = wantOn;
    return wantOn && this.granted;
  }
}
