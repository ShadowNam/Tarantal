// Fixed-step driver between Phaser's variable frame rate and the 60 Hz sim (Tech §3.2).
// Pure TypeScript (no Phaser) so it is unit-tested. Each rendered frame calls advance(dtMs):
// the accumulator runs 0..maxSteps sim ticks, keeps the last two snapshots for interpolation,
// records every command for bug-report replays, and returns the events those ticks produced.
// Hit-stop only holds the accumulator: the sim still sees the same commands at the same ticks,
// so it never affects determinism.
import type { Sim } from '../sim/Sim';
import type { SimEvent } from '../sim/events';
import type { InputRecorder } from '../sim/replay/inputLog';
import type { Command, HuntResult, SimState } from '../sim/types';
import { TICKS_PER_SECOND } from '../sim/clock';

export const STEP_MS = 1000 / TICKS_PER_SECOND;

export interface RunnerOptions {
  readonly maxStepsPerFrame: number;
  readonly recorder?: InputRecorder;
  /** Commands produced every tick (e.g. the camera target from pan inertia). */
  readonly perTick?: () => readonly Command[];
}

export interface FrameResult {
  readonly steps: number;
  readonly events: readonly SimEvent[];
}

export class HuntRunner {
  private readonly sim: Sim;
  private readonly opts: RunnerOptions;
  private pending: Command[] = [];
  private accumulator = 0;
  private hitStopLeftMs = 0;
  private previous: SimState;
  private current: SimState;
  /** Events emitted at creation (huntStarted) are handed out by the first advance(). */
  private initialEvents: SimEvent[];

  constructor(sim: Sim, opts: RunnerOptions) {
    this.sim = sim;
    this.opts = opts;
    this.current = sim.snapshot();
    this.previous = this.current;
    this.initialEvents = [...sim.drainEvents()];
  }

  /** Queues a command for the next tick (fire, reload, …). */
  queue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Holds the sim for ms of real time (hit-stop); the longest request wins. */
  hitStop(ms: number): void {
    this.hitStopLeftMs = Math.max(this.hitStopLeftMs, ms);
  }

  get prev(): SimState {
    return this.previous;
  }

  get state(): SimState {
    return this.current;
  }

  /** Interpolation factor 0..1 between prev and state for rendering. */
  get alpha(): number {
    return Math.min(1, this.accumulator / STEP_MS);
  }

  get over(): boolean {
    return this.sim.isOver();
  }

  result(): HuntResult {
    return this.sim.result();
  }

  advance(dtMs: number): FrameResult {
    const events: SimEvent[] = this.initialEvents;
    this.initialEvents = [];
    if (this.sim.isOver() || !(dtMs > 0)) return { steps: 0, events };

    let dt = dtMs;
    if (this.hitStopLeftMs > 0) {
      const held = Math.min(this.hitStopLeftMs, dt);
      this.hitStopLeftMs -= held;
      dt -= held;
    }
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < this.opts.maxStepsPerFrame) {
      this.accumulator -= STEP_MS;
      const cmds = [...(this.opts.perTick?.() ?? []), ...this.pending];
      this.pending = [];
      this.opts.recorder?.record(this.sim.tick, cmds);
      this.sim.step(cmds);
      events.push(...this.sim.drainEvents());
      this.previous = this.current;
      this.current = this.sim.snapshot();
      steps++;
      if (this.sim.isOver()) {
        this.accumulator = 0;
        break;
      }
      // Stop catching up while a hit-stop is pending (hitStop() is called by the scene after
      // advance() returns, so it takes effect from the next frame).
      if (this.hitStopLeftMs > 0) break;
    }
    // Spiral-of-death guard: drop backlog we could not run this frame.
    if (steps >= this.opts.maxStepsPerFrame && this.accumulator >= STEP_MS) {
      this.accumulator = this.accumulator % STEP_MS;
    }
    return { steps, events };
  }
}
