// v1.16 (D-078) when the troop calls (the owner: "its important to add the sound that the baboons
// are also making"), kept rare: a male's echoing wa-hoo every wahooSeconds while the troop is on
// its ridge, a bark when the aim comes near one looking over the edge (at most every
// aimBarkSeconds), now and then a grunt or a youngster's squeal as one comes up, and the idle calls
// minGapSeconds apart. A raid's warning and a scared raider's scream always sound (they are cues).
// Pure, on sim ticks (a held or paused hunt holds its calls too); the random draws come from the
// view's own source (sounds never touch the sim). Units: ticks, 60 a second.
import type { BaboonTuning } from '../../../content/schemas';

type Tuning = BaboonTuning['calls'];

const TPS = 60;

export type IdleCall = 'wahoo' | 'grunt' | 'squeal' | 'bark';

export class BaboonCalls {
  private nextWahoo: number | null = null;
  private lastIdle = -Infinity;
  private lastAimBark = -Infinity;
  /** Calls made so far (e2e hook: the rate limit). */
  readonly counts = { wahoo: 0, grunt: 0, squeal: 0, bark: 0, scream: 0 };

  constructor(
    private readonly T: Tuning,
    private readonly rand: () => number,
  ) {}

  private gapOk(tick: number): boolean {
    return tick - this.lastIdle >= this.T.minGapSeconds * TPS;
  }

  private schedule(tick: number): void {
    const [a, b] = this.T.wahooSeconds;
    this.nextWahoo = tick + Math.round((a + (b - a) * this.rand()) * TPS);
  }

  /** The idle wa-hoo: true when one is due now (the troop is on its ridge). */
  wahoo(tick: number, onRidge: boolean): boolean {
    if (!onRidge) {
      this.nextWahoo = null;
      return false;
    }
    if (this.nextWahoo === null) {
      this.schedule(tick);
      return false;
    }
    if (tick < this.nextWahoo) return false;
    if (!this.gapOk(tick)) return false;
    this.lastIdle = tick;
    this.schedule(tick);
    this.counts.wahoo++;
    return true;
  }

  /** A raid's warning: the lookout's wa-hoo always sounds, and the idle one waits its full gap. */
  warn(tick: number): void {
    this.lastIdle = tick;
    this.schedule(tick);
    this.counts.wahoo++;
  }

  /** The aim came near one up over the edge: true when it barks now. */
  aimed(tick: number): boolean {
    if (tick - this.lastAimBark < this.T.aimBarkSeconds * TPS || !this.gapOk(tick)) return false;
    this.lastAimBark = tick;
    this.lastIdle = tick;
    this.counts.bark++;
    return true;
  }

  /** One came up over the edge: maybe a grunt (a youngster: maybe a squeal). */
  cameUp(tick: number, juvenile: boolean): 'grunt' | 'squeal' | null {
    if (!this.gapOk(tick)) return null;
    const r = this.rand();
    const call = juvenile
      ? r < this.T.squealChance
        ? 'squeal'
        : null
      : r < this.T.gruntChance
        ? 'grunt'
        : null;
    if (call === null) return null;
    this.lastIdle = tick;
    this.counts[call]++;
    return call;
  }

  /** A raider scared off screams (always). */
  scream(): void {
    this.counts.scream++;
  }
}
