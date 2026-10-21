// All game audio goes through here (Tech §7). Starts only after a user gesture, mutes on
// visibilitychange, on pause and during ads (platform adapter), pans by screen x (±0.7),
// and caps simultaneous voices at 16. Reacts only to typed sim events. M10: four buses under the
// master — SFX (+ ambience), music, voice — each with its Settings volume (art bible §10). A sound
// with a delivered recording (asset index) plays the decoded file; the synth stays the fallback
// for every other sound. Each biome's music stems crossfade by intensity (music.ts) and duck
// under Oupa's barks; with no music delivered there is none, and the synth stings stay.
import type { Feel } from '../../content/schemas';
import type { SimEvent } from '../../sim/events';
import { ambienceKey, musicKey, sfxKey, voiceKey, type FinalSound } from '../assets/AssetManifest';
import { MusicMixer, STEMS, StemHold, type MusicSet, type Stem } from './music';
import { createNoise, playSfx, type SfxId } from './synth';

const MAX_VOICES = 16;
const MAX_PAN = 0.7;
/** Sounds on the music bus. */
const MUSIC: ReadonlySet<SfxId> = new Set<SfxId>(['sting', 'stampede']);

/** Why audio is muted; any reason mutes. */
export type MuteReason = 'pause' | 'ad' | 'menu' | 'portal';

export interface Volumes {
  readonly master: number;
  readonly sfx: number;
  readonly music: number;
  readonly voice: number;
}

/** What the director needs from the page (tests pass fakes). */
export interface AudioEnv {
  readonly createContext: () => AudioContext | null;
  readonly onVisibility: (fn: (hidden: boolean) => void) => void;
  /** Wall-clock ms (bark spacing, stem hold). */
  readonly now: () => number;
  readonly setTimer: (fn: () => void, ms: number) => void;
  readonly canPlay: (mime: string) => string;
}

export const browserAudioEnv = (): AudioEnv => ({
  createContext: () => {
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    return Ctor === undefined ? null : new Ctor();
  },
  onVisibility: (fn) => {
    document.addEventListener('visibilitychange', () => {
      fn(document.visibilityState === 'hidden');
    });
  },
  now: () => performance.now(),
  setTimer: (fn, ms) => {
    window.setTimeout(fn, ms);
  },
  canPlay: (mime) => document.createElement('audio').canPlayType(mime),
});

export type AudioTuning = Feel['audio'];

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  /** Between the music mixer and the music bus: the bark duck. */
  private duck: GainNode | null = null;
  private mixer: MusicMixer | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private hidden = false;
  private readonly muteReasons = new Set<MuteReason>();
  private volumes: Volumes = { master: 1, sfx: 1, music: 1, voice: 1 };
  /** Delivered files waiting for an AudioContext to decode them. */
  private pending: FinalSound[] = [];
  private readonly buffers = new Map<string, AudioBuffer>();
  /** Sound keys that play from a decoded recording (read by the test hook). */
  readonly recorded: string[] = [];
  private biome: string | null = null;
  private wantStem: Stem = 'calm';
  private readonly hold: StemHold;
  private lastBarkAt = -Infinity;
  private tallyCounting = false;

  constructor(
    private readonly tuning: AudioTuning,
    private readonly env: AudioEnv = browserAudioEnv(),
  ) {
    this.hold = new StemHold(tuning.stemHoldMs);
    env.onVisibility((hidden) => {
      this.hidden = hidden;
      this.applyGain();
      // Both can reject (no audio device, policy); a silent game is fine.
      if (hidden) this.ctx?.suspend().catch(() => undefined);
      else this.ctx?.resume().catch(() => undefined);
    });
  }

  /** Call from inside a user-gesture handler (iOS needs the resume there). */
  unlock(): void {
    try {
      if (this.ctx === null) {
        const ctx = this.env.createContext();
        if (ctx === null) return;
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        const bus = (): GainNode => {
          const g = ctx.createGain();
          // Safe: master was created just above.
          g.connect(this.master as GainNode);
          return g;
        };
        this.sfxBus = bus();
        this.musicBus = bus();
        this.voiceBus = bus();
        this.duck = ctx.createGain();
        this.duck.connect(this.musicBus);
        this.mixer = new MusicMixer(ctx, this.duck, this.sfxBus, this.tuning);
        this.noise = createNoise(ctx);
        this.applyGain();
        this.decodePending();
        this.refreshMusic();
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
    } catch {
      // No audio is better than no game.
      this.ctx = null;
    }
  }

  /** The recorded format this browser plays: Ogg Vorbis where sure, else MP3 (Safari). */
  fileFormat(): 'ogg' | 'mp3' | null {
    try {
      if (this.env.canPlay('audio/ogg; codecs="vorbis"') === 'probably') return 'ogg';
      return this.env.canPlay('audio/mpeg') !== '' ? 'mp3' : null;
    } catch {
      return null;
    }
  }

  /** Delivered recordings (decoded now, or once audio is unlocked). */
  addRecorded(files: readonly FinalSound[]): void {
    const known = new Set([...this.pending.map((f) => f.key), ...this.buffers.keys()]);
    this.pending.push(...files.filter((f) => !known.has(f.key)));
    this.decodePending();
  }

  private decodePending(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    for (const f of this.pending) {
      // decodeAudioData detaches its buffer: decode a copy so a second context could retry.
      ctx.decodeAudioData(f.bytes.slice(0)).then(
        (buf) => {
          this.buffers.set(f.key, buf);
          this.recorded.push(f.key);
          this.refreshMusic();
        },
        // A file the browser can't decode keeps the synth (or silence, for music).
        () => undefined,
      );
    }
    this.pending = [];
  }

  /** M10: the biome whose music and ambience play (title and hunts). */
  setBiome(id: string): void {
    this.biome = id;
    this.refreshMusic();
  }

  /** M10: the intensity the moment calls for (music.ts stemFor); rising is immediate. */
  setIntensity(want: Stem): void {
    this.wantStem = this.hold.next(want, this.env.now());
    this.mixer?.setStem(this.wantStem);
  }

  /** M10: the tally is counting up (no barks over it, art bible §10). */
  setTallyCounting(on: boolean): void {
    this.tallyCounting = on;
  }

  /** What the music plays now (test hook): biome and stem, or null. */
  get music(): { id: string; stem: Stem | null } | null {
    return this.mixer?.state ?? null;
  }

  private refreshMusic(): void {
    const mixer = this.mixer;
    const id = this.biome;
    if (mixer === null || id === null) return;
    const stems: Partial<Record<Stem, AudioBuffer>> = {};
    for (const s of STEMS) {
      const b = this.buffers.get(musicKey(id, s));
      if (b !== undefined) stems[s] = b;
    }
    const set: MusicSet = { stems, ambience: this.buffers.get(ambienceKey(id)) ?? null };
    mixer.setStem(this.wantStem);
    mixer.play(id, set);
  }

  /**
   * M10: Oupa says `barkKey` if a recording was delivered: at most one per barkGapMs and never
   * over the tally count-up; the music ducks under it. Returns whether it played.
   */
  bark(barkKey: string): boolean {
    const { ctx, voiceBus, duck } = this;
    const buf = this.buffers.get(voiceKey(barkKey));
    if (ctx === null || voiceBus === null || duck === null || buf === undefined) return false;
    const now = this.env.now();
    if (this.muted || this.tallyCounting || now - this.lastBarkAt < this.tuning.barkGapMs)
      return false;
    this.lastBarkAt = now;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceBus);
    src.start();
    const t = ctx.currentTime;
    const low = 10 ** (this.tuning.duckDb / 20);
    const attack = this.tuning.duckAttackMs / 1000;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(duck.gain.value, t);
    duck.gain.linearRampToValueAtTime(low, t + attack);
    duck.gain.setValueAtTime(low, t + Math.max(attack, buf.duration));
    duck.gain.linearRampToValueAtTime(
      1,
      t + Math.max(attack, buf.duration) + this.tuning.duckReleaseMs / 1000,
    );
    return true;
  }

  setMuted(reason: MuteReason, on: boolean): void {
    if (on) this.muteReasons.add(reason);
    else this.muteReasons.delete(reason);
    this.applyGain();
  }

  get muted(): boolean {
    return this.muteReasons.size > 0 || this.hidden;
  }

  /** Settings volumes, 0..1 each. */
  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyGain();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** M10: menu and tally sounds that aren't sim events (GDD §17 tally ticks and stamp thud). */
  ui(id: 'tick' | 'thud'): void {
    if (this.ctx === null || this.muted) return;
    if (id === 'tick') this.play('tick', 0);
    else this.play('thud', 0);
  }

  /** Plays the sounds for a frame's events. panOf maps an event to −1 (left) … +1 (right). */
  handle(events: readonly SimEvent[], panOf: (e: SimEvent) => number): void {
    if (this.ctx === null || this.muted) return;
    let shot = false;
    let sting = false;
    for (const e of events) {
      switch (e.type) {
        case 'shotFired':
          if (!shot) this.play('shot', panOf(e));
          shot = true;
          break;
        case 'emptyClick':
          this.play('click', 0);
          break;
        case 'shellLoaded':
        case 'reloadFinished':
          this.play('shell', 0.5);
          break;
        case 'targetBagged':
          this.play('poof', panOf(e));
          if (e.behaviour !== 'flying' || Math.random() < 0.5) this.play('kek', panOf(e));
          break;
        case 'penaltyApplied':
        case 'secretPenalty':
          this.play('scratch', 0);
          break;
        case 'stampedeStarted':
          this.play('stampede', 0);
          break;
        case 'flockStateChanged':
          if (e.to === 'alert') this.play('kek', panOf(e));
          else if (e.to === 'flush') {
            this.play('kekAlarm', panOf(e));
            if (!sting) this.play('sting', 0);
            sting = true;
          }
          break;
        case 'gadgetUsed':
          this.play('vuvuzela', -0.6);
          break;
        case 'flockWiped':
          this.play('stamp', panOf(e));
          break;
        case 'secretPartHit':
          this.play('ting', panOf(e));
          break;
        case 'secretTriggered':
          this.play('secret', panOf(e));
          break;
        case 'worldEvent':
          // Secret events have their own sound; scheduled ones already sound via their birds.
          if (e.event === 'carAlarm') this.play('alarm', 0);
          else if (e.event === 'reservoirFlush') this.play('splash', 0);
          else if (e.event === 'dustDevil') this.play('whoosh', 0);
          break;
        case 'armorKnocked':
          this.play('clang', panOf(e));
          break;
        case 'birdCalled':
          this.play('kwe', panOf(e));
          break;
        case 'crateOpened':
          this.play('crate', 0);
          break;
        case 'powerupStarted':
        case 'weaponChanged':
          this.play('powerup', 0);
          break;
        default:
          break;
      }
    }
  }

  private play(id: SfxId, pan: number): void {
    const { ctx, noise } = this;
    const bus = MUSIC.has(id) ? this.musicBus : this.sfxBus;
    if (ctx === null || bus === null || noise === null || this.voices >= MAX_VOICES) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-MAX_PAN, Math.min(MAX_PAN, pan * MAX_PAN));
    panner.connect(bus);
    this.voices++;
    const buf = this.buffers.get(sfxKey(id));
    let seconds: number;
    if (buf !== undefined) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(panner);
      src.start();
      seconds = buf.duration;
    } else {
      seconds = playSfx(ctx, panner, id, noise);
    }
    this.env.setTimer(
      () => {
        this.voices--;
        panner.disconnect();
      },
      seconds * 1000 + 50,
    );
  }

  private applyGain(): void {
    if (this.master === null || this.ctx === null) return;
    const now = this.ctx.currentTime;
    const m = this.muted ? 0 : this.tuning.masterLevel * this.volumes.master;
    this.master.gain.setValueAtTime(m, now);
    this.sfxBus?.gain.setValueAtTime(this.volumes.sfx, now);
    this.musicBus?.gain.setValueAtTime(this.volumes.music, now);
    this.voiceBus?.gain.setValueAtTime(this.volumes.voice, now);
  }

  /** The master gain the director has set (test hook: 0 while muted; null before unlock). A
   *  suspended context doesn't update the param's own value, so this reports the target. */
  get masterGain(): number | null {
    if (this.master === null) return null;
    return this.muted ? 0 : this.tuning.masterLevel * this.volumes.master;
  }
}
