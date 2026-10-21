import { describe, expect, it } from 'vitest';
import { FrameBenchmark, type FrameClock } from './FrameBenchmark';

function fakeClock(): FrameClock & { step(dt: number): void; pending: boolean } {
  let cb: ((t: number) => void) | null = null;
  let t = 0;
  return {
    raf: (fn) => {
      cb = fn;
      return 1;
    },
    cancel: () => {
      cb = null;
    },
    step(dt: number) {
      t += dt;
      const fn = cb;
      cb = null;
      fn?.(t);
    },
    get pending() {
      return cb !== null;
    },
  };
}

describe('FrameBenchmark', () => {
  it('measures frame gaps while resumed, reports once, then stops its loop', () => {
    const clock = fakeClock();
    const done: number[][] = [];
    const b = new FrameBenchmark(3, (f) => done.push([...f]), 250, clock);
    b.resume();
    clock.step(16); // first frame: no gap yet
    clock.step(17);
    clock.step(1000); // a tab switch: not a frame
    clock.step(20);
    expect(b.measured).toBe(2);
    b.pause();
    expect(clock.pending).toBe(false);
    b.resume();
    clock.step(500); // first frame after resume: no gap counted
    clock.step(18);
    expect(done).toEqual([[17, 20, 18]]);
    expect(b.done).toBe(true);
    expect(clock.pending).toBe(false);
    b.resume();
    expect(clock.pending).toBe(false);
  });
});
