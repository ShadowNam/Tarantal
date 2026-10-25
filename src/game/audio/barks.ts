// Oupa's barks (v1.0.1, D-028 §3; art bible §10). Pure: reads the typed sim event stream (plus a
// few facts the HUD knows — the run's quota, the clock, the save's last hunt day) and decides
// whether Oupa says something this frame. Never the sim's business: a bark changes nothing in the
// hunt, so wall-clock time and per-page state are fine here.
//   - Triggers (feel.json barks.triggers): each has a priority, a cooldown and lines said in turn.
//   - One bark per frame at most (the highest priority), at most one per `gapMs` overall (the
//     bible's 6 s, audio.barkGapMs), and each trigger at most once per its own cooldownMs.
//   - A trigger that can't speak because of the gap is dropped, except the "while it lasts" ones
//     (idle, lastSeconds, quotaMet, boss, stampede, oupaLaai), which try again on later frames; tally lines
//     can ask `waitMs` and retry.
//   - The director is the only gap clock (the HUD's Phaser time). A secret's own bark (biome
//     content, shown in the HUD banner) always speaks and claims the gap (`secret`), so no generic
//     line follows it within 6 s and the two never share the screen (D-028 review).
// The HUD shows the line as a speech bubble (the subtitle) and asks the AudioDirector to play
// voice/<line> (it plays once a recording is delivered; music ducks under it).
import type { BarkTrigger, Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';

export type BarkTuning = Feel['barks'];

/** What the HUD knows about this hunt frame besides the events. */
export interface BarkFrame {
  /** Wall-clock ms (gap and cooldowns). */
  readonly nowMs: number;
  readonly tick: number;
  readonly ticksLeft: number;
  readonly ticksPerSecond: number;
  /** The Frenzy multiplier that counts as "on fire" (the top tier). */
  readonly frenzyTopMul: number;
  /** Season Run: the score just reached the hunt's quota this frame. */
  readonly quotaReached?: boolean;
}

export interface Bark {
  readonly trigger: BarkTrigger;
  /** The line: an i18n key, and the voice key voice/<line>. */
  readonly line: string;
}

export class BarkDirector {
  private lastAt = -Infinity;
  private readonly lastByTrigger = new Map<BarkTrigger, number>();
  private readonly nextLine = new Map<BarkTrigger, number>();
  // Per hunt.
  private bagRun = 0;
  private missRun = 0;
  private lastShotTick = 0;
  private idleSaid = false;
  private lastSecondsSaid = false;
  private quotaSaid = false;
  private quotaPending = false;
  /** Event triggers that hold until said (a boss or the Stampede arrives during the gap). */
  private pending = new Set<BarkTrigger>();
  private bagged = new Set<number>();
  /** v1.6b: Oupa Laai's first auto reload since the last pickup has been announced. */
  private autoSaid = false;

  constructor(
    private readonly tuning: BarkTuning,
    /** At most one bark per this many ms (audio.barkGapMs). */
    private readonly gapMs: number,
  ) {}

  /** A new hunt starts at `tick` (per-hunt streaks and once-only lines reset). */
  startHunt(tick: number): void {
    this.bagRun = 0;
    this.missRun = 0;
    this.lastShotTick = tick;
    this.idleSaid = false;
    this.lastSecondsSaid = false;
    this.quotaSaid = false;
    this.quotaPending = false;
    this.pending = new Set();
    this.bagged = new Set();
    this.autoSaid = false;
  }

  /** One hunt frame: this frame's events → at most one bark. */
  hunt(events: readonly SimEvent[], f: BarkFrame): Bark | null {
    const t = this.tuning;
    const cands: BarkTrigger[] = [];
    for (const e of events) {
      switch (e.type) {
        case 'shotFired':
          this.lastShotTick = e.tick;
          this.idleSaid = false;
          break;
        case 'miss':
          this.bagRun = 0;
          if (++this.missRun >= t.missStreak) {
            this.missRun = 0;
            cands.push('missStreak');
          }
          break;
        case 'targetBagged':
          // A shot that bags two birds is one shot in the streak.
          if (this.bagged.has(e.shotId)) break;
          this.bagged.add(e.shotId);
          this.missRun = 0;
          if (++this.bagRun >= t.bagStreak) {
            this.bagRun = 0;
            cands.push('bagStreak');
          }
          break;
        case 'penaltyApplied':
          cands.push(e.creature === 'kwevoel' ? 'kwevoel' : 'nonTarget');
          break;
        case 'bonusAwarded':
          if (e.bonus === 'wholeFlock') cands.push('wholeFlock');
          else if (e.bonus === 'twoFlies') cands.push('twoFlies');
          break;
        case 'emptyClick':
          cands.push('emptyClick');
          break;
        case 'stampedeStarted':
          this.pending.add('stampede');
          break;
        case 'birdSpawned':
          if (e.motion === 'boss') this.pending.add('boss');
          break;
        case 'flockStateChanged':
          if (e.to === 'flush') cands.push('flush');
          break;
        case 'crateOpened':
          cands.push('crate');
          break;
        case 'powerupStarted':
          // A pickup (or a refresh) lets the next auto reload speak again.
          this.autoSaid = false;
          break;
        case 'reloadStarted':
          // v1.6b (D-043): only Oupa Laai starts a reload by itself. Held until said (the gap
          // delays it at most a few seconds).
          if (e.auto === true && !this.autoSaid) {
            this.autoSaid = true;
            this.pending.add('oupaLaai');
          }
          break;
        case 'comboChanged':
          if (e.frenzyMul >= f.frenzyTopMul) cands.push('frenzyTop');
          break;
        case 'weatherChanged':
          if (e.rain) cands.push('rain');
          break;
        default:
          break;
      }
    }
    if (f.quotaReached === true && !this.quotaSaid) this.quotaPending = true;
    if (this.quotaPending) cands.push('quotaMet');
    cands.push(...this.pending);
    if (!this.idleSaid && f.tick - this.lastShotTick >= t.idleSeconds * f.ticksPerSecond)
      cands.push('idle');
    if (!this.lastSecondsSaid && f.ticksLeft > 0 && f.ticksLeft <= t.lastSeconds * f.ticksPerSecond)
      cands.push('lastSeconds');

    const bark = this.pick(cands, f.nowMs);
    if (bark?.trigger === 'idle') this.idleSaid = true;
    if (bark?.trigger === 'lastSeconds') this.lastSecondsSaid = true;
    if (bark?.trigger === 'quotaMet') {
      this.quotaSaid = true;
      this.quotaPending = false;
    }
    if (bark !== null) this.pending.delete(bark.trigger);
    // The lasting ones hold until said, so a gap only delays them; others are gone.
    return bark;
  }

  /** A trigger from outside the hunt frame (first hunt today, tally verdicts, the run tally). */
  say(trigger: BarkTrigger, nowMs: number): Bark | null {
    return this.pick([trigger], nowMs);
  }

  /** Ms until the gap lets Oupa speak again (0 = now): a tally line can retry then. */
  waitMs(nowMs: number): number {
    return Math.max(0, this.gapMs - (nowMs - this.lastAt));
  }

  /**
   * A secret's bark (biome content: the HUD banner shows it and the AudioDirector says it) speaks
   * now whatever the gap, and claims the gap: no generic line this frame or for gapMs after.
   */
  secret(nowMs: number): void {
    this.lastAt = nowMs;
  }

  private pick(cands: readonly BarkTrigger[], nowMs: number): Bark | null {
    if (cands.length === 0 || nowMs - this.lastAt < this.gapMs) return null;
    const ready = cands.filter(
      (c) => nowMs - (this.lastByTrigger.get(c) ?? -Infinity) >= this.tuning.triggers[c].cooldownMs,
    );
    let best: BarkTrigger | null = null;
    for (const c of ready)
      if (best === null || this.tuning.triggers[c].priority > this.tuning.triggers[best].priority)
        best = c;
    if (best === null) return null;
    const lines = this.tuning.triggers[best].lines;
    const i = this.nextLine.get(best) ?? 0;
    const line = lines[i % lines.length];
    if (line === undefined) return null;
    this.nextLine.set(best, i + 1);
    this.lastAt = nowMs;
    this.lastByTrigger.set(best, nowMs);
    return { trigger: best, line };
  }
}

/** Every bark line in the tuning (the voice keys the asset manifest lists). */
export function allBarkLines(t: BarkTuning): string[] {
  const out = new Set<string>();
  for (const cfg of Object.values(t.triggers)) for (const l of cfg.lines) out.add(l);
  return [...out].sort();
}

/** Hunt-start bark: the first hunt of a UTC day (the save remembers the last hunt's day). */
export function firstHuntToday(lastHuntDay: number | null, today: number): boolean {
  return lastHuntDay !== today;
}
