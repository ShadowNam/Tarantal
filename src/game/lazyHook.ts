// v1.22.2 (D-087): test-hook entries computed when a spec reads them, not in the game's frame.
// The perf specs time each frame (cpuFrameMs, Phaser pre-step → post-render); hook work done in
// the frame counted toward it (about 1–2 ms a frame at 4× throttle on the Pixel 7 profile: the
// texture/bounds sample, the crates' drawn check, the on-screen spots of birds, flocks, crates,
// special-day things…). A read happens between frames (a page.evaluate, a waitForFunction poll, a
// page rAF callback), when the views hold what the last frame drew, so the value read is the one
// the frame would have stored. Test hooks only: the hook object exists only in test builds.

/**
 * Makes `target[key]` an enumerable accessor that runs `get` on every read (Playwright's
 * serialisation of `window.__TM__` reads it like a plain field). For entries that must always be
 * current (texture memory: the title and the tally read it too).
 */
export function defineLazy<T extends object, K extends keyof T>(
  target: T,
  key: K,
  get: () => T[K],
): void {
  Object.defineProperty(target, key, { get, enumerable: true, configurable: true });
}

/**
 * Entries the game used to store every frame, worked out at most once per frame and only when
 * read. `frame()` marks a new frame drawn (the next read works them out again). `freeze()`, when
 * the scene shuts down, works out the entries not read since the last frame and keeps them all, so
 * they keep reading as the last frame left them, as the stored values did; one that can't be
 * worked out any more (its views already gone) reads as it did before the first frame. Before the
 * first frame they read as they were defined (the hook's initial values). A write (a reset at a
 * hunt's start) reads back until the next frame.
 */
export class LazyEntries<T extends object> {
  private readonly cache = new Map<keyof T, unknown>();
  private readonly entries = new Map<keyof T, { compute: () => unknown; initial: unknown }>();
  private live = false;

  constructor(private readonly target: T) {}

  define<K extends keyof T>(key: K, compute: () => T[K]): void {
    const initial = this.target[key];
    this.entries.set(key, { compute, initial });
    Object.defineProperty(this.target, key, {
      enumerable: true,
      configurable: true,
      get: (): T[K] => {
        // Safe cast: the cache holds only values of this key (from `compute`, a write, or its
        // initial value).
        if (this.cache.has(key)) return this.cache.get(key) as T[K];
        if (!this.live) return initial;
        const v = compute();
        this.cache.set(key, v);
        return v;
      },
      set: (v: T[K]) => {
        this.cache.set(key, v);
      },
    });
  }

  /** A frame drew: every entry is worked out again when next read. */
  frame(): void {
    this.live = true;
    this.cache.clear();
  }

  /** The scene shuts down: every entry keeps what the last frame left (see the class note). */
  freeze(): void {
    if (!this.live) return;
    this.live = false;
    for (const [key, e] of this.entries) {
      if (this.cache.has(key)) continue;
      let v: unknown;
      try {
        v = e.compute();
      } catch {
        v = e.initial;
      }
      this.cache.set(key, v);
    }
  }
}
