// Oupa's barks (v1.0.1, D-028 §3; art bible §10). Pure: reads the typed sim event stream (plus a
// few facts the HUD knows — the run's quota, the clock, the save's last hunt day) and decides
// whether Oupa says something this frame. Never the sim's business: a bark changes nothing in the
// hunt, so wall-clock time and per-page state are fine here.
//   - Triggers (feel.json barks.triggers): each has a priority, a cooldown and lines said in turn.
//   - One bark per frame at most (the highest priority), at most one per `gapMs` overall (the
//     bible's 6 s, audio.barkGapMs), and each trigger at most once per its own cooldownMs.
//   - A trigger that can't speak because of the gap is dropped, except the "while it lasts" ones
//     (idle, quotaMet, boss, stampede, oupaLaai), which try again on later frames; tally lines
//     can ask `waitMs` and retry.
//   - 1.9.2 (D-055): the ten-second call (lastSeconds) is said on the frame the clock reaches
//     lastSeconds, whatever the gap: it cuts the line playing (a fresh bark stops the voice and
//     replaces the bubble) and claims the gap. If it can't go out within lastSecondsLateSeconds
//     (Oupa's comments off, a hunt resumed late) it is never said: a late "Ten seconds!" is wrong.
//   - The director is the only gap clock (the HUD's Phaser time). A secret's own bark (biome
//     content, shown in the HUD banner) always speaks and claims the gap (`secret`), so no generic
//     line follows it within 6 s and the two never share the screen (D-028 review).
// The HUD shows the line as a speech bubble (the subtitle) and asks the AudioDirector to play
// voice/<line> (it plays once a recording is delivered; music ducks under it).
import { MAKALANI_SECRET } from '../../sim/nuts/makalani';
import type { BarkTrigger, Feel, Feesdag } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';

export type BarkTuning = Feel['barks'];
/** D-048: a special day's own lines (feesdae.json barks). */
export type SpecialBarks = Feesdag['barks'];

/** The special-day triggers and the feesdae.json line each one says. */
const SPECIAL_LINE: Partial<Record<BarkTrigger, keyof SpecialBarks>> = {
  feesdagStart: 'start',
  feesdagBat: 'bat',
  feesdagOwl: 'owl',
  lanternsOut: 'lanternsOut',
  feesdagEnd: 'end',
  // D-064 (Christmas): a present opened, all found, a near-miss streak or a long dry spell.
  feesdagPresent: 'present',
  presentsFound: 'presentsFound',
  feesdagDry: 'dry',
  // D-065 (New Year): the countdown started (said as the ten-second call), a big shot in it.
  feesdagCountdown: 'countdown',
  countdownShot: 'countdownShot',
};

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
  /** 1.9.2 (D-055): said now over anything else this frame (the ten-second call). */
  readonly urgent?: true;
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
  /** D-065: New Year's countdown is running (its countdownStarted was seen). */
  private countdownOn = false;
  private quotaSaid = false;
  private quotaPending = false;
  /** Event triggers that hold until said (a boss or the Stampede arrives during the gap). */
  private pending = new Set<BarkTrigger>();
  private bagged = new Set<number>();
  /** v1.6b: Oupa Laai's first auto reload since the last pickup has been announced. */
  private autoSaid = false;
  /** D-048: this hunt's special day lines (null on an ordinary hunt). */
  private special: SpecialBarks | null = null;

  constructor(
    private readonly tuning: BarkTuning,
    /** At most one bark per this many ms (audio.barkGapMs). */
    private readonly gapMs: number,
    /** v1.6b: power-ups that reload by themselves (powerups.json effect.autoReload). */
    private readonly autoReloadIds: ReadonlySet<string> = new Set(),
  ) {}

  /**
   * A new hunt starts at `tick` (per-hunt streaks and once-only lines reset). D-048: a special
   * day's hunt brings its lines; its start line is held until said.
   */
  startHunt(tick: number, special: SpecialBarks | null = null): void {
    this.special = special;
    this.bagRun = 0;
    this.missRun = 0;
    this.lastShotTick = tick;
    this.idleSaid = false;
    this.lastSecondsSaid = false;
    this.countdownOn = false;
    this.quotaSaid = false;
    this.quotaPending = false;
    this.pending = new Set();
    this.bagged = new Set();
    this.autoSaid = false;
  }

  /** D-064: the special day's line for a special-day trigger (undefined: none today). */
  private specialLine(trigger: BarkTrigger): string | undefined {
    const own = SPECIAL_LINE[trigger];
    return own === undefined || this.special === null ? undefined : this.special[own];
  }

  /** D-048: the special day's lines of this hunt (the tally's end line), or null. */
  get specialLines(): SpecialBarks | null {
    return this.special;
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
            // D-064: a special with a dry-spell line says it instead (it outranks missStreak).
            if (this.special?.dry !== undefined) cands.push('feesdagDry');
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
          // D-065: a two-in-one or a whole flock in New Year's countdown is a big shot.
          if (this.countdownOn && (e.bonus === 'wholeFlock' || e.bonus === 'twoFlies'))
            cands.push('countdownShot');
          break;
        case 'scoreAwarded':
          if (this.countdownOn && e.award >= t.countdownShotAward) cands.push('countdownShot');
          break;
        case 'countdownStarted':
          this.countdownOn = true;
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
        // v1.8 (D-050): a tin can kept in the air canChain hits in a row.
        case 'canJuggled':
          if (e.chain === t.canChain) cands.push('canChain');
          break;
        // 1.9.3 (D-056): three makalani nuts popped or juggled out.
        case 'secretTriggered':
          if (e.propId === MAKALANI_SECRET) cands.push('makalani');
          break;
        case 'powerupStarted':
          // An Oupa Laai pickup (or refresh) lets the next auto reload speak again.
          if (this.autoReloadIds.has(e.powerup)) this.autoSaid = false;
          break;
        case 'powerupEnded':
          // Not said by the time it ran out: too late now.
          if (this.autoReloadIds.has(e.powerup)) this.pending.delete('oupaLaai');
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
        // D-048: the Spookjag. Lanterns out is held until said (it is the day's secret).
        case 'spookHit':
          if (e.thing === 'bat') cands.push('feesdagBat');
          // The owl's scold is held until said (a hit inside the gap still gets it).
          else if (e.thing === 'owl') this.pending.add('feesdagOwl');
          break;
        case 'lanternsOut':
          this.pending.add('lanternsOut');
          break;
        // D-064: Christmas's presents. The last one says Presents found! instead (held until said).
        case 'presentOpened':
          if (e.presentsLeft > 0) cands.push('feesdagPresent');
          break;
        case 'presentsFound':
          this.pending.add('presentsFound');
          break;
        case 'feesdagStarted':
          if (this.special !== null) this.pending.add('feesdagStart');
          break;
        default:
          break;
      }
    }
    if (f.quotaReached === true && !this.quotaSaid) this.quotaPending = true;
    if (this.quotaPending) cands.push('quotaMet');
    cands.push(...this.pending);
    if (!this.idleSaid && f.tick - this.lastShotTick >= t.idleSeconds * f.ticksPerSecond) {
      cands.push('idle');
      if (this.special?.dry !== undefined) cands.push('feesdagDry');
    }
    // 1.9.2 (D-055): the ten-second call goes out on time or not at all (no gap, no queue).
    if (
      !this.lastSecondsSaid &&
      f.ticksLeft > 0 &&
      f.ticksLeft <= t.lastSeconds * f.ticksPerSecond
    ) {
      this.lastSecondsSaid = true;
      const latest = (t.lastSeconds - t.lastSecondsLateSeconds) * f.ticksPerSecond;
      if (f.ticksLeft >= latest) {
        // D-065: on New Year the ten-second call is the countdown's own line.
        const which =
          this.specialLine('feesdagCountdown') !== undefined ? 'feesdagCountdown' : 'lastSeconds';
        const call = this.force(which, f.nowMs);
        if (call !== null) return call;
      }
    }

    const bark = this.pick(cands, f.nowMs);
    if (bark?.trigger === 'idle' || bark?.trigger === 'feesdagDry') this.idleSaid = true;
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

  /**
   * v1.7b (D-046): Oupa's word on a power-up picked up for the first time on this save (a line
   * of its own, `bark.pu.<id>`). It speaks now whatever the gap and claims the gap, like a
   * secret's bark: the pickup card is up for only a few seconds.
   */
  claim(line: string, nowMs: number): Bark {
    this.lastAt = nowMs;
    this.lastByTrigger.set('crate', nowMs);
    return { trigger: 'crate', line };
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

  /** 1.9.2 (D-055): says a trigger's next line now, whatever the gap, and claims the gap. */
  private force(trigger: BarkTrigger, nowMs: number): Bark | null {
    const special = this.specialLine(trigger);
    const lines = special !== undefined ? [special] : this.tuning.triggers[trigger].lines;
    const i = this.nextLine.get(trigger) ?? 0;
    const line = lines[i % lines.length];
    if (line === undefined) return null;
    this.nextLine.set(trigger, i + 1);
    this.lastAt = nowMs;
    this.lastByTrigger.set(trigger, nowMs);
    return { trigger, line, urgent: true };
  }

  private pick(cands: readonly BarkTrigger[], nowMs: number): Bark | null {
    if (cands.length === 0 || nowMs - this.lastAt < this.gapMs) return null;
    const ready = cands.filter(
      (c) =>
        nowMs - (this.lastByTrigger.get(c) ?? -Infinity) >= this.tuning.triggers[c].cooldownMs &&
        // A special-day trigger speaks only in that day's hunt, and only if it has that line.
        (SPECIAL_LINE[c] === undefined || this.specialLine(c) !== undefined),
    );
    let best: BarkTrigger | null = null;
    for (const c of ready)
      if (best === null || this.tuning.triggers[c].priority > this.tuning.triggers[best].priority)
        best = c;
    if (best === null) return null;
    const own = SPECIAL_LINE[best];
    const special = this.specialLine(best);
    const lines =
      own === undefined ? this.tuning.triggers[best].lines : special === undefined ? [] : [special];
    const i = this.nextLine.get(best) ?? 0;
    const line = lines[i % lines.length];
    if (line === undefined) return null;
    this.nextLine.set(best, i + 1);
    this.lastAt = nowMs;
    this.lastByTrigger.set(best, nowMs);
    return { trigger: best, line };
  }
}

/** Every bark line in the tuning and the special days (the voice keys the manifest lists). */
export function allBarkLines(t: BarkTuning, specials: readonly SpecialBarks[] = []): string[] {
  const out = new Set<string>();
  for (const cfg of Object.values(t.triggers)) for (const l of cfg.lines) out.add(l);
  for (const s of specials) for (const l of specialLinesOf(s)) out.add(l);
  return [...out].sort();
}

/** D-048/D-064: every line of one special day (the moments its twist rule has). */
export function specialLinesOf(s: SpecialBarks): string[] {
  return [
    s.start,
    s.bat,
    s.owl,
    s.lanternsOut,
    s.present,
    s.presentsFound,
    s.dry,
    s.countdown,
    s.countdownShot,
    s.end,
  ].filter((l): l is string => l !== undefined);
}

/** Hunt-start bark: the first hunt of a UTC day (the save remembers the last hunt's day). */
export function firstHuntToday(lastHuntDay: number | null, today: number): boolean {
  return lastHuntDay !== today;
}
