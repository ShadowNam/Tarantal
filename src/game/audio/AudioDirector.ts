// All game audio goes through here (Tech §7). Starts only after a user gesture, mutes on
// visibilitychange, on pause and during ads (platform adapter), pans by screen x (±0.7),
// and caps simultaneous voices at 16. Reacts only to typed sim events. Two buses under the
// master: SFX and music (the flush sting and the Stampede cue until music stems land, M10),
// each with its Settings volume. M10: a sound with a delivered recording (asset index) plays the
// decoded file; the synth stays the fallback for every other sound.
import type { SimEvent } from '../../sim/events';
import { sfxKey, type FinalSound } from '../assets/AssetManifest';
import { createNoise, playSfx, type SfxId } from './synth';

const MAX_VOICES = 16;
const MAX_PAN = 0.7;
/** Master level at full volume (headroom for the placeholder synth). */
const MASTER_LEVEL = 0.6;
/** Sounds on the music bus. */
const MUSIC: ReadonlySet<SfxId> = new Set<SfxId>(['sting', 'stampede']);

/** Why audio is muted; any reason mutes. */
export type MuteReason = 'pause' | 'ad' | 'menu' | 'portal';

export interface Volumes {
  readonly master: number;
  readonly sfx: number;
  readonly music: number;
}

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private hidden = false;
  private readonly muteReasons = new Set<MuteReason>();
  private volumes: Volumes = { master: 1, sfx: 1, music: 1 };
  /** Delivered files waiting for an AudioContext to decode them. */
  private pending: FinalSound[] = [];
  private readonly buffers = new Map<string, AudioBuffer>();
  /** Sound keys that play from a decoded recording (read by the test hook). */
  readonly recorded: string[] = [];

  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      this.applyGain();
      // Both can reject (no audio device, policy); a silent game is fine.
      if (this.hidden) this.ctx?.suspend().catch(() => undefined);
      else this.ctx?.resume().catch(() => undefined);
    });
  }

  /** Call from inside a user-gesture handler (iOS needs the resume there). */
  unlock(): void {
    try {
      if (this.ctx === null) {
        const Ctor = window.AudioContext as typeof AudioContext | undefined;
        if (Ctor === undefined) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.noise = createNoise(this.ctx);
        this.applyGain();
        this.decodePending();
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
      const a = document.createElement('audio');
      if (a.canPlayType('audio/ogg; codecs="vorbis"') === 'probably') return 'ogg';
      return a.canPlayType('audio/mpeg') !== '' ? 'mp3' : null;
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
        },
        // A file the browser can't decode keeps the synth.
        () => undefined,
      );
    }
    this.pending = [];
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
    window.setTimeout(
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
    this.master.gain.setValueAtTime(this.muted ? 0 : MASTER_LEVEL * this.volumes.master, now);
    this.sfxBus?.gain.setValueAtTime(this.volumes.sfx, now);
    this.musicBus?.gain.setValueAtTime(this.volumes.music, now);
  }
}
