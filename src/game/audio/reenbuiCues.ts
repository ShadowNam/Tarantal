// v1.10 (D-067, Tech §7.1) Reënbui's sounds in the soundscape: the room it makes (every soundscape
// call quiet from quietBeforeMs before the build-up until quietAfterMs after the rain has eased)
// and its own cues (thunder, the first drops, the rain, the swarm's buzz, the excited birds) on
// sim ticks. The phase ticks are the sim's own (its snapshot's ReenbuiView, from the hunt's first
// tick: lesson 36, never a copy of its numbers). Pure: no Web Audio, no clock; the cue times are
// worked out once per hunt and walked with a cursor, so a frame of 20 ticks plays every cue due
// in it once, and a cue more than lateMs late is skipped, never played late.
import type { Soundscape } from '../../content/soundscape';
import { TICKS_PER_SECOND } from '../../sim/clock';
import type { ReenbuiView } from '../../sim/types';

export type ReenbuiSound = Soundscape['reenbui'];
export type ReenbuiTiming = Pick<
  ReenbuiView,
  'buildupTick' | 'dropsTick' | 'swarmTick' | 'easingTick' | 'endTick' | 'withStorm'
>;

const ticks = (ms: number): number => Math.round((ms * TICKS_PER_SECOND) / 1000);

/** True while the soundscape's own calls make room for the event at `tick`. */
export function makingRoom(cfg: ReenbuiSound, plan: ReenbuiTiming | null, tick: number): boolean {
  if (plan === null) return false;
  return (
    tick >= plan.buildupTick - ticks(cfg.quietBeforeMs) &&
    tick < plan.endTick + ticks(cfg.quietAfterMs)
  );
}

export interface CueTime {
  readonly tick: number;
  /** Index into cfg.cues. */
  readonly cue: number;
}

/** Every cue of the hunt's event, in tick order (ties: content order). */
export function cueTimes(cfg: ReenbuiSound, plan: ReenbuiTiming): CueTime[] {
  const spans = {
    buildup: [plan.buildupTick, plan.dropsTick],
    drops: [plan.dropsTick, plan.swarmTick],
    swarm: [plan.swarmTick, plan.easingTick],
    easing: [plan.easingTick, plan.endTick],
  } as const;
  const out: CueTime[] = [];
  cfg.cues.forEach((c, i) => {
    if (plan.withStorm && !c.withStorm) return;
    const [from, to] = spans[c.phase];
    const every = ticks(c.everyMs);
    for (let t = from + ticks(c.atMs); t < to; t += every) {
      out.push({ tick: t, cue: i });
      if (every <= 0) break;
    }
  });
  return out.sort((a, b) => a.tick - b.tick || a.cue - b.cue);
}

/** What became of a due cue (as the sink reports it, or why it was not offered). */
export type CueOutcome = 'played' | 'late' | 'locked' | 'muted' | 'missing' | 'voices';

/** Walks the hunt's cue times on sim ticks. */
export class ReenbuiCues {
  private times: CueTime[] = [];
  private cursor = 0;
  /** Outcomes so far (test hook). */
  readonly counts: Record<CueOutcome, number> = {
    played: 0,
    late: 0,
    locked: 0,
    muted: 0,
    missing: 0,
    voices: 0,
  };

  constructor(private readonly cfg: ReenbuiSound) {}

  /** A new hunt's event (null: none), from tick `now` (cues before it are not played). */
  reset(plan: ReenbuiTiming | null, now = 0): void {
    this.times = plan === null ? [] : cueTimes(this.cfg, plan);
    this.cursor = 0;
    while (this.cursor < this.times.length && (this.times[this.cursor]?.tick ?? 0) < now)
      this.cursor++;
    for (const k of Object.keys(this.counts) as CueOutcome[]) this.counts[k] = 0;
  }

  /** Offers every cue due by `tick` to `play` (late ones are skipped). */
  step(
    tick: number,
    play: (cue: ReenbuiSound['cues'][number]) => Exclude<CueOutcome, 'late'>,
  ): void {
    const late = ticks(this.cfg.lateMs);
    while (this.cursor < this.times.length) {
      const t = this.times[this.cursor];
      if (t === undefined || t.tick > tick) break;
      this.cursor++;
      const c = this.cfg.cues[t.cue];
      if (c === undefined) continue;
      const outcome = tick - t.tick > late ? 'late' : play(c);
      this.counts[outcome]++;
    }
  }
}
