// "Oupa se Les" (GDD §16): turns the FTUE hunt's sim events into one line of guidance at a time
// and reports each step for telemetry (ftue_step, Tech §14). Pure: no Phaser, no DOM — the HUD
// draws `prompt`, the hunt scene feeds events. Steps:
//   start → first_shot → first_bag, and whenever they happen: run (a flock runs: "They run!"),
//   reload (first empty belt), flush (first flush: "Wing shot ×2!"), secret (windpomp hint),
//   then complete (tally) or skip.
import type { SimEvent } from '../../sim/events';
import type { InputKind } from '../../sim/types';

export type FtueStep =
  | 'start'
  | 'first_shot'
  | 'first_bag'
  | 'run'
  | 'reload'
  | 'flush'
  | 'secret'
  | 'complete'
  | 'skip';

export type FtuePromptKey =
  | 'ftue.shoot_touch'
  | 'ftue.shoot_mouse'
  | 'ftue.run'
  | 'ftue.reload_touch'
  | 'ftue.reload_mouse'
  | 'ftue.flush'
  | 'ftue.secret';

export interface FtuePrompt {
  readonly key: FtuePromptKey;
  /** Pulsing hand/cursor: at the flock (shoot) or at the belt (reload). */
  readonly hand: 'flock' | 'belt' | null;
}

export interface FtueOptions {
  readonly inputKind: InputKind;
  readonly durationTicks: number;
  /** Fraction of the hunt when the windpomp hint shows. */
  readonly secretHintAt: number;
  /** Banner length in ticks. */
  readonly bannerTicks: number;
  readonly onStep: (step: FtueStep, tick: number) => void;
}

export class FtueDirector {
  private readonly done = new Set<FtueStep>();
  private banner: { key: FtuePromptKey; until: number } | null = null;
  private needReload = false;
  private tick = 0;
  private finished = false;

  constructor(private readonly o: FtueOptions) {
    this.step('start', 0);
  }

  get steps(): ReadonlySet<FtueStep> {
    return this.done;
  }

  /** Feed one frame: the events and the latest tick and belt state. */
  update(
    events: readonly SimEvent[],
    tick: number,
    belt: { shells: number; reloading: boolean },
  ): void {
    if (this.finished) return;
    this.tick = tick;
    for (const e of events) {
      if (e.type === 'shotFired') this.step('first_shot', e.tick);
      else if (e.type === 'targetBagged') this.step('first_bag', e.tick);
      else if (e.type === 'flockStateChanged' && e.to === 'run') {
        if (this.step('run', e.tick)) this.show('ftue.run');
      } else if (e.type === 'flockStateChanged' && e.to === 'flush') {
        if (this.step('flush', e.tick)) this.show('ftue.flush');
      } else if (e.type === 'reloadStarted') this.needReload = false;
    }
    if (belt.shells === 0 && !belt.reloading && !this.done.has('reload')) {
      this.needReload = true;
      this.step('reload', tick);
    }
    if (belt.shells !== 0 || belt.reloading) this.needReload = false;
    if (
      tick >= Math.floor(this.o.secretHintAt * this.o.durationTicks) &&
      this.step('secret', tick)
    ) {
      this.show('ftue.secret');
    }
  }

  /** The one line to show now (banner > reload > shoot), or null. */
  get prompt(): FtuePrompt | null {
    if (this.finished) return null;
    const touch = this.o.inputKind === 'touch';
    if (this.needReload)
      return { key: touch ? 'ftue.reload_touch' : 'ftue.reload_mouse', hand: 'belt' };
    if (this.banner !== null && this.tick < this.banner.until)
      return { key: this.banner.key, hand: null };
    if (!this.done.has('first_shot'))
      return { key: touch ? 'ftue.shoot_touch' : 'ftue.shoot_mouse', hand: 'flock' };
    return null;
  }

  complete(tick: number): void {
    if (this.finished) return;
    this.step('complete', tick);
    this.finished = true;
  }

  skip(tick: number): void {
    if (this.finished) return;
    this.step('skip', tick);
    this.finished = true;
  }

  private show(key: FtuePromptKey): void {
    this.banner = { key, until: this.tick + this.o.bannerTicks };
  }

  /** Records a step once; true the first time. */
  private step(s: FtueStep, tick: number): boolean {
    if (this.done.has(s)) return false;
    this.done.add(s);
    this.o.onStep(s, tick);
    return true;
  }
}
