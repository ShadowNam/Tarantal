// The title-screen frame benchmark (Tech §5, M9): counts rAF-to-rAF frame times while the title
// is on screen and the tab is visible, until warm-up + `frames` are measured, then reports them
// once. It runs only on the title (paused whenever the title closes) and never again this page.
// Gaps longer than `maxGapMs` (1 s: a stall at load, a missed visibility event) aren't frames.

export interface FrameClock {
  raf(cb: (t: number) => void): number;
  cancel(handle: number): void;
}

const browserClock: FrameClock = {
  raf: (cb) => requestAnimationFrame(cb),
  cancel: (h) => {
    cancelAnimationFrame(h);
  },
};

export class FrameBenchmark {
  private readonly frames: number[] = [];
  private last: number | null = null;
  private handle: number | null = null;
  private finished = false;

  constructor(
    private readonly need: number,
    private readonly onDone: (frames: readonly number[]) => void,
    private readonly maxGapMs = 1000,
    private readonly clock: FrameClock = browserClock,
  ) {}

  get done(): boolean {
    return this.finished;
  }

  get measured(): number {
    return this.frames.length;
  }

  /** The title is on screen: (re)start counting. */
  resume(): void {
    if (this.finished || this.handle !== null) return;
    this.last = null;
    this.handle = this.clock.raf(this.tick);
  }

  /** The title closed or the tab hid: stop the loop (nothing runs outside the title). */
  pause(): void {
    if (this.handle !== null) this.clock.cancel(this.handle);
    this.handle = null;
    this.last = null;
  }

  private readonly tick = (t: number): void => {
    this.handle = null;
    if (this.last !== null) {
      const dt = t - this.last;
      if (dt > 0 && dt <= this.maxGapMs) this.frames.push(dt);
    }
    this.last = t;
    if (this.frames.length >= this.need) {
      this.finished = true;
      this.onDone(this.frames);
      return;
    }
    this.handle = this.clock.raf(this.tick);
  };
}
