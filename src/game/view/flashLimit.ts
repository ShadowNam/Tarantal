// Photosensitivity guard (GDD §18.3, WCAG 2.3.1, CLAUDE.md): no more than N large-area flashes
// (lightning light, the Stormvoël's lit darkness, Stampede pulses) in any one second, shared by
// every source on screen. Content already spaces lightning (≤ 2 a second, D-025); this is the
// client-side backstop. Pure; real time in ms.

export class FlashLimiter {
  private readonly starts: number[] = [];
  /** The last counted start and whether it was granted (a strike seen by several sources). */
  private last: { at: number; granted: boolean } | null = null;

  constructor(
    private readonly maxPerSecond: number,
    /** Starts this close to the last one are the same flash (one strike lighting two overlays
     *  on the same or the next frame): they share its slot and its answer. */
    private readonly mergeMs = 0,
  ) {}

  /** Asks to start a flash now: true (and counted) if fewer than N started in the last second. */
  start(nowMs: number): boolean {
    if (this.last !== null && nowMs - this.last.at <= this.mergeMs) return this.last.granted;
    while (this.starts.length > 0 && nowMs - (this.starts[0] ?? 0) >= 1000) this.starts.shift();
    const granted = this.starts.length < this.maxPerSecond;
    if (granted) this.starts.push(nowMs);
    this.last = { at: nowMs, granted };
    return granted;
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
