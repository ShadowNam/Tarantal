// v1.9 (D-066) the veld soundscape's scheduler (Tech §7.1, art bible §10.2): one-shot calls of the
// area's birds, insects and weather over its ambience bed, scheduled on sim time. Pure: no Web
// Audio, no clock, no Math.random. The schedule (which call is due at which tick, its pan) is a
// function of (seed, area, light, title) alone — a presentation-only generator, never a sim
// stream — so the same hunt sounds the same; what actually plays also depends on the sink (muted,
// not unlocked, not decoded) and on the rules kept here by construction: at most `maxVoices`
// soundscape voices at once, at least `minGapMs` between call starts, a call more than `lateMs`
// late is skipped, and a call that `warns` a penalty creature stays quiet around its event.
// Allocation-free per step: every array is sized when the director is made.
import type { Soundscape } from '../../content/schemas';
import { TICKS_PER_SECOND } from '../../sim/clock';

export type Distance = 'near' | 'mid' | 'far';

/** What became of a due call. */
export type CallOutcome =
  | 'played'
  | 'locked' // no audio yet (before the first gesture)
  | 'muted' // hidden tab, pause, ad, effects volume 0
  | 'missing' // its recording isn't decoded (yet)
  | 'voices' // no soundscape voice free, or the game needs its voices
  | 'quiet' // a penalty creature's event is near: its own call is the warning
  | 'gap' // too soon after the last call
  | 'late'; // its moment passed (a slow frame, a held or hidden hunt)

/** The call being offered to the sink (one reused object: copy what you keep). */
export interface SoundscapeCall {
  key: string;
  /** The tick it was due. */
  tick: number;
  /** The tick of the frame that offers it. */
  at: number;
  distance: Distance;
  /** Screen pan −1 … +1 (the director scales it to ±0.7). */
  pan: number;
  /** Level in dB (the entry's, its distance's and the haze's). */
  levelDb: number;
  /** Low-pass in Hz (0 = none). */
  lowpassHz: number;
  /** Sim ticks the voice is held. */
  lengthTicks: number;
  /** The penalty creature it sounds like, else null. */
  warns: string | null;
}

export interface SoundscapeSink {
  /** Plays the call now: 'played', or why not ('locked', 'muted', 'missing', 'voices'). */
  play(call: Readonly<SoundscapeCall>): CallOutcome;
  /** True while calls that sound like `creature` must stay quiet at `tick`. */
  quiet(creature: string, tick: number): boolean;
}

/** The area and moment the soundscape plays. */
export interface SoundscapeScene {
  readonly area: string;
  /** The light whose time-of-day factors apply (resolveSoundscapeLight). */
  readonly light: string;
  /** dB from the map's haze lights (≤ 0). */
  readonly hazeDb: number;
  /** The hunt's seed (the title: soundscape.titleSeed). */
  readonly seed: number;
  /** The title plays the area at titleRateMul. */
  readonly title: boolean;
  /** Schedule start tick. */
  readonly startTick: number;
}

/** One offered call, for the test hook. */
export interface SoundscapeLogEntry {
  key: string;
  tick: number;
  at: number;
  distance: Distance;
  /** Final stereo pan (±0.7). */
  pan: number;
  outcome: CallOutcome;
}

/** The director's stereo spread (AudioDirector MAX_PAN). */
export const SOUNDSCAPE_MAX_PAN = 0.7;
/** Calls kept in the hook's log (newest last). */
export const SOUNDSCAPE_LOG_SIZE = 96;
/** Due calls handled per call per step at most (a long stall skips the rest as late). */
const MAX_DUE_PER_STEP = 32;

const msToTicks = (ms: number): number => (ms * TICKS_PER_SECOND) / 1000;

/** FNV-1a of the scene (its own copy: importing the sim's rng module from this lazy chunk split
 *  that module out of the first download's chunk). */
function hash(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One step of mulberry32 on state[i] (presentation only; the sim has its own streams). */
function draw(state: Uint32Array, i: number): number {
  const a = ((state[i] ?? 0) + 0x6d2b79f5) >>> 0;
  state[i] = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * The light whose time-of-day factors apply, and the haze: the first of `lights` (the map's
 * lights as drawn) that every profile has a factor for; a special day's light has none, so the
 * map's own (`mapLights`) comes next, then `defaultLight`. Hazes add their hazeDb.
 */
export function resolveSoundscapeLight(
  sc: Pick<Soundscape, 'profiles' | 'hazeDb' | 'defaultLight'>,
  lights: readonly string[],
  mapLights: readonly string[],
): { light: string; hazeDb: number } {
  const profiles = Object.values(sc.profiles);
  const timeOfDay = (l: string): boolean => profiles.every((p) => p[l] !== undefined);
  const light = lights.find(timeOfDay) ?? mapLights.find(timeOfDay) ?? sc.defaultLight;
  let hazeDb = 0;
  for (const l of lights) hazeDb += sc.hazeDb[l] ?? 0;
  return { light, hazeDb };
}

export class SoundscapeDirector {
  private readonly cap: number;
  /** Per area entry (index into the current area's list). */
  private readonly next: Float64Array;
  private readonly mean: Float64Array;
  private readonly order: Int32Array;
  private readonly voiceEnd: Float64Array;
  private count = 0;
  private entries: Soundscape['areas'][string] = [];
  /** One generator per area entry: each call's timeline is independent of the others' (and so
   *  of the order a long frame handles them in). */
  private readonly rng: Uint32Array;
  private lastStart = -Infinity;
  private readonly minGap: number;
  private readonly late: number;
  private readonly call: SoundscapeCall = {
    key: '',
    tick: 0,
    at: 0,
    distance: 'mid',
    pan: 0,
    levelDb: 0,
    lowpassHz: 0,
    lengthTicks: 0,
    warns: null,
  };
  private scene: SoundscapeScene | null = null;
  /** Ring of offered calls (test hook only; null in production). */
  readonly log: SoundscapeLogEntry[] | null;
  /** Offered calls since the scene started (each outcome counted). */
  readonly counts: Record<CallOutcome, number> = {
    played: 0,
    locked: 0,
    muted: 0,
    missing: 0,
    voices: 0,
    quiet: 0,
    gap: 0,
    late: 0,
  };

  constructor(
    private readonly sc: Soundscape,
    withLog = false,
  ) {
    this.cap = Math.max(1, ...Object.values(sc.areas).map((a) => a.length));
    this.next = new Float64Array(this.cap);
    this.mean = new Float64Array(this.cap);
    this.order = new Int32Array(this.cap);
    this.voiceEnd = new Float64Array(sc.maxVoices);
    this.rng = new Uint32Array(this.cap);
    this.minGap = msToTicks(sc.minGapMs);
    this.late = msToTicks(sc.lateMs);
    this.log = withLog ? [] : null;
  }

  get current(): SoundscapeScene | null {
    return this.scene;
  }

  /** Starts the area's schedule (an unknown area plays nothing). */
  start(scene: SoundscapeScene): void {
    this.scene = scene;
    const sc = this.sc;
    this.entries = sc.areas[scene.area] ?? [];
    this.count = Math.min(this.cap, this.entries.length);
    const base = `${scene.area}|${scene.light}|${scene.title ? 'title' : 'hunt'}`;
    for (let i = 0; i < this.count; i++) this.rng[i] = hash(`${base}|${i}`, scene.seed >>> 0);
    this.lastStart = -Infinity;
    this.voiceEnd.fill(-Infinity);
    for (const k of Object.keys(this.counts) as CallOutcome[]) this.counts[k] = 0;
    if (this.log !== null) this.log.length = 0;
    const rateMul = scene.title ? sc.titleRateMul : 1;
    for (let i = 0; i < this.count; i++) {
      const e = this.entries[i];
      const factor = e === undefined ? 0 : (sc.profiles[e.profile]?.[scene.light] ?? 0);
      const perMinute = (e?.perMinute ?? 0) * factor * rateMul;
      this.mean[i] = perMinute > 0 ? (60 * TICKS_PER_SECOND) / perMinute : Infinity;
      // The first call of each kind somewhere inside its first mean gap.
      this.next[i] = scene.startTick + draw(this.rng, i) * (this.mean[i] ?? Infinity);
    }
    // Higher weight first; ties keep content order.
    for (let i = 0; i < this.count; i++) this.order[i] = i;
    const w = (i: number): number => this.entries[i]?.weight ?? 0;
    const ord = Array.from(this.order.subarray(0, this.count)).sort((a, b) => w(b) - w(a) || a - b);
    ord.forEach((v, i) => (this.order[i] = v));
  }

  /** Stops (nothing is offered until the next start). */
  stop(): void {
    this.scene = null;
    this.count = 0;
  }

  /** The gap to the next call of entry i: its mean ± jitter (≥ 1 tick). */
  private gap(i: number): number {
    const j = this.sc.jitter;
    return Math.max(1, (this.mean[i] ?? Infinity) * (1 + j * (2 * draw(this.rng, i) - 1)));
  }

  /**
   * Offers every call due by `tick` to the sink (in weight order). Returns how many were offered
   * (each costs the sink at most one play). Call once per frame with the hunt's (or title's) tick.
   */
  step(tick: number, sink: SoundscapeSink): number {
    let offered = 0;
    for (let o = 0; o < this.count; o++) {
      const i = this.order[o] ?? 0;
      for (let n = 0; n < MAX_DUE_PER_STEP && (this.next[i] ?? Infinity) <= tick; n++) {
        const due = this.next[i] ?? 0;
        // Every draw happens whatever the outcome: the timeline never depends on the sink.
        const pan = draw(this.rng, i) * 2 - 1;
        this.next[i] = due + this.gap(i);
        this.offer(i, due, tick, pan, sink);
        offered++;
      }
      // A stall longer than MAX_DUE_PER_STEP gaps: start again from now.
      if ((this.next[i] ?? Infinity) <= tick) this.next[i] = tick + this.gap(i);
    }
    return offered;
  }

  private offer(i: number, due: number, tick: number, pan: number, sink: SoundscapeSink): void {
    const sc = this.sc;
    const e = this.entries[i];
    const def = e === undefined ? undefined : sc.calls[e.call];
    if (e === undefined || def === undefined) return;
    const dist = sc.distances[e.distance];
    const c = this.call;
    c.key = def.sound;
    c.tick = due;
    c.at = tick;
    c.distance = e.distance;
    c.pan = pan;
    c.levelDb = e.levelDb + dist.levelDb + (this.scene?.hazeDb ?? 0);
    c.lowpassHz = dist.lowpassHz;
    c.lengthTicks = msToTicks(def.lengthMs);
    c.warns = def.warns ?? null;
    let outcome: CallOutcome;
    let voice = -1;
    if (tick - due > this.late) outcome = 'late';
    else if (c.warns !== null && sink.quiet(c.warns, tick)) outcome = 'quiet';
    else if (tick - this.lastStart < this.minGap) outcome = 'gap';
    else {
      for (let v = 0; v < this.voiceEnd.length; v++)
        if ((this.voiceEnd[v] ?? Infinity) <= tick) {
          voice = v;
          break;
        }
      outcome = voice < 0 ? 'voices' : sink.play(c);
    }
    if (outcome === 'played') {
      this.voiceEnd[voice] = tick + c.lengthTicks;
      this.lastStart = tick;
    }
    this.counts[outcome]++;
    this.record(c, outcome);
  }

  private record(c: SoundscapeCall, outcome: CallOutcome): void {
    const log = this.log;
    if (log === null) return;
    const entry: SoundscapeLogEntry = {
      key: c.key,
      tick: Math.round(c.tick),
      at: c.at,
      distance: c.distance,
      pan: Math.round(c.pan * SOUNDSCAPE_MAX_PAN * 1000) / 1000,
      outcome,
    };
    if (log.length < SOUNDSCAPE_LOG_SIZE) log.push(entry);
    else {
      // Newest last: shift out the oldest (test builds only).
      log.shift();
      log.push(entry);
    }
  }

  /** Soundscape voices busy at `tick` (≤ maxVoices by construction). */
  voicesAt(tick: number): number {
    let n = 0;
    for (const end of this.voiceEnd) if (end > tick) n++;
    return n;
  }
}
