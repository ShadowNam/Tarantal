// One ad at a time, whatever the portal SDK does (M9). Tracks "an ad covers the game" for the
// AudioDirector (muted meanwhile) and the menus (input locked), never rejects, and gives up
// after a timeout so a stuck SDK can't hang the game between hunts.

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => {
    clearTimeout(h as ReturnType<typeof setTimeout>);
  },
};

export class AdGate {
  private playing = false;
  private busy = false;
  private readonly listeners = new Set<(playing: boolean) => void>();

  constructor(
    private readonly timeoutMs: number,
    private readonly timers: Timers = realTimers,
  ) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  /** An ad is being requested or shown (a second request is refused meanwhile). */
  get isBusy(): boolean {
    return this.busy;
  }

  onChange(fn: (playing: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Runs one ad. `show(started)` asks the SDK for it and settles when it is over; it calls
   * `started()` when the ad covers the game. Resolves `fallback` on an error, a timeout or while
   * another ad runs. Listeners hear `true` at the start and `false` once it is over.
   */
  async run<T>(show: (started: () => void) => Promise<T>, fallback: T): Promise<T> {
    if (this.busy) return fallback;
    this.busy = true;
    let timer: unknown = null;
    try {
      const timeout = new Promise<T>((resolve) => {
        timer = this.timers.set(() => {
          resolve(fallback);
        }, this.timeoutMs);
      });
      let ad: Promise<T>;
      try {
        ad = show(() => {
          this.setPlaying(true);
        }).catch(() => fallback);
      } catch {
        ad = Promise.resolve(fallback);
      }
      return await Promise.race([ad, timeout]);
    } finally {
      if (timer !== null) this.timers.clear(timer);
      this.setPlaying(false);
      this.busy = false;
    }
  }

  private setPlaying(on: boolean): void {
    if (this.playing === on) return;
    this.playing = on;
    for (const fn of this.listeners) fn(on);
  }
}
