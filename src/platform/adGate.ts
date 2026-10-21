// One ad at a time, whatever the portal SDK does (M9). Tracks "an ad is requested or covers the
// game" for the AudioDirector (muted while it plays) and the menus (input locked from the request
// on, D-026), never rejects, and gives up if the SDK never starts the ad so a stuck SDK can't
// hang the game between hunts. Once the ad has started there is no timeout: a long ad, or one the
// player watches after switching tabs, ends only when the SDK says so.

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  /** The page is hidden: the request timeout waits (an SDK can't show an ad in a hidden tab). */
  hidden(): boolean;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => {
    clearTimeout(h as ReturnType<typeof setTimeout>);
  },
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
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

  /** An ad is being requested or shown (input is locked, a second request is refused). */
  get isBusy(): boolean {
    return this.busy;
  }

  onChange(fn: (playing: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Runs one ad. `show(started)` asks the SDK for it and settles when it is over; it calls
   * `started()` when the ad covers the game. Resolves `fallback` on an error, while another ad
   * runs, or when the SDK hasn't started the ad within `timeoutMs` of visible time. Listeners
   * hear `true` at the start and `false` once it is over.
   */
  async run<T>(show: (started: () => void) => Promise<T>, fallback: T): Promise<T> {
    if (this.busy) return fallback;
    this.busy = true;
    let timer: unknown = null;
    const stopTimer = (): void => {
      if (timer !== null) this.timers.clear(timer);
      timer = null;
    };
    try {
      const timeout = new Promise<T>((resolve) => {
        const arm = (): void => {
          timer = this.timers.set(() => {
            // Hidden tab: wait for the player to come back before giving up on the request.
            if (this.timers.hidden()) arm();
            else resolve(fallback);
          }, this.timeoutMs);
        };
        arm();
      });
      let ad: Promise<T>;
      try {
        ad = show(() => {
          stopTimer();
          this.setPlaying(true);
        }).catch(() => fallback);
      } catch {
        ad = Promise.resolve(fallback);
      }
      return await Promise.race([ad, timeout]);
    } finally {
      stopTimer();
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
