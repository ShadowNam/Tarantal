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
import { loadBytes } from '../assets/finalLoader';
import { MusicMixer, STEMS, StemHold, type MusicSet, type Stem } from './music';
import { createNoise, playSfx, SFX_IDS, type SfxId } from './synth';

const MAX_VOICES = 16;
const MAX_PAN = 0.7;
/** Sounds on the music bus. */
const MUSIC: ReadonlySet<SfxId> = new Set<SfxId>(['sting', 'stampede']);

/** Why audio is muted; any reason mutes. */
/** Plays a synthesised sound into `out` now; returns its length in seconds. */
export type Synth = (ctx: AudioContext, out: AudioNode, noise: AudioBuffer) => number;

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
  /** Fetches another delivered file (the MP3 twin when an Ogg won't decode), or null. */
  readonly fetchBytes: (path: string) => Promise<ArrayBuffer | null>;
}

export const browserAudioEnv = (fileTimeoutMs: number): AudioEnv => ({
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
  fetchBytes: (path) => loadBytes(path, fileTimeoutMs),
});

/** The biome a music or ambience key belongs to (music/<biome>/<stem>, amb/<biome>), else null. */
export function biomeOfKey(key: string): string | null {
  const [type, biome] = key.split('/');
  return (type === 'music' || type === 'amb') && biome !== undefined ? biome : null;
}

export type AudioTuning = Feel['audio'];
export type GunSfx = Feel['guns']['weapons'][string]['sfx'];

const DEFAULT_GUN_SFX: GunSfx = { shot: 'shot', shellLoaded: 'shell', reloadFinished: 'shell' };
const isSfx = (id: string | undefined): id is SfxId =>
  id !== undefined && (SFX_IDS as readonly string[]).includes(id);

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
  /** Music and ambience recordings, compressed (decoded only for the biome on screen). */
  private readonly musicFiles = new Map<string, FinalSound>();
  private readonly decoding = new Set<string>();
  /** Sound keys that play from a decoded recording (read by the test hook). */
  readonly recorded: string[] = [];
  private biome: string | null = null;
  private wantStem: Stem = 'calm';
  private readonly hold: StemHold;
  /** The Oupa line playing (or last played): a new one stops it. */
  private voiceSrc: AudioBufferSourceNode | null = null;
  /** v1.5 (D-041): the voice language whose pack Oupa speaks from (voice/<lang>/<line>). */
  private voiceLang = 'en';
  /** Voice keys said from a recording on this page (test hook; newest last, capped). */
  readonly voicePlayed: string[] = [];
  /** v1.5: a bark whose line hadn't arrived: it plays if the line is decoded by `until`. */
  private waiting: { line: string; until: number } | null = null;
  /** v1.5: told when Oupa speaks a line that isn't loaded (the voice pack retries failures). */
  private missingLine: (() => void) | null = null;
  /** Called once, on the first unlock (the voice pack downloads only once audio can play). */
  private readonly unlockFns: (() => void)[] = [];
  private tallyCounting = false;
  /** v1.1 (D-032): the gun in hand (its own shot and reload sounds, feel.json guns). */
  private weapon = '';

  constructor(
    private readonly tuning: AudioTuning,
    private readonly env: AudioEnv,
    /** weapon id → its sounds (feel.json guns.weapons.<id>.sfx); unknown guns use the shotgun's. */
    private readonly gunSfx: Readonly<Record<string, GunSfx>> = {},
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
        for (const fn of this.unlockFns.splice(0)) fn();
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
    } catch {
      // No audio is better than no game.
      this.ctx = null;
    }
  }

  /** v1.5 (D-041): `fn` runs whenever a bark finds its line not loaded (VoicePacks.retry). */
  onMissingLine(fn: () => void): void {
    this.missingLine = fn;
  }

  /** v1.5 (D-041): runs `fn` once audio has been unlocked by a gesture (now, if it has). */
  onUnlocked(fn: () => void): void {
    if (this.ctx !== null) fn();
    else this.unlockFns.push(fn);
  }

  /**
   * v1.5 (D-041): Oupa speaks this voice language. Another language's decoded lines are released
   * (only one pack is kept in memory); its recordings come from voicePack.ts.
   */
  setVoiceLanguage(lang: string): void {
    if (lang === this.voiceLang) return;
    this.voiceLang = lang;
    const mine = (key: string): boolean =>
      !key.startsWith('voice/') || key.startsWith(`voice/${lang}/`);
    this.pending = this.pending.filter((f) => mine(f.key));
    for (const key of [...this.buffers.keys()]) if (!mine(key)) this.buffers.delete(key);
  }

  get voiceLanguage(): string {
    return this.voiceLang;
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

  /**
   * Delivered recordings. Effects and voices are decoded once (now, or when audio unlocks) and
   * their compressed bytes dropped. Music and ambience keep only their compressed bytes and are
   * decoded for the biome on screen: a decoded 2-minute stereo stem is ~46 MB, so every visited
   * biome's music held at once could get the tab killed on iOS.
   */
  addRecorded(files: readonly FinalSound[]): void {
    const known = new Set([...this.pending.map((f) => f.key), ...this.buffers.keys()]);
    for (const f of files) {
      // v1.5: a voice pack that arrives after the language changed is not kept.
      if (f.key.startsWith('voice/') && !f.key.startsWith(`voice/${this.voiceLang}/`)) continue;
      if (biomeOfKey(f.key) !== null) this.musicFiles.set(f.key, f);
      else if (!known.has(f.key)) this.pending.push(f);
    }
    this.decodePending();
  }

  /** Decodes waiting effects and the current biome's music, then refreshes the music once. */
  private decodePending(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const batch = this.pending;
    this.pending = [];
    for (const f of this.musicFiles.values())
      if (biomeOfKey(f.key) === this.biome && !this.buffers.has(f.key) && !this.decoding.has(f.key))
        batch.push(f);
    if (batch.length === 0) return;
    for (const f of batch) this.decoding.add(f.key);
    // Decode the whole batch, then refresh the music once: refreshing per file would restart the
    // stems (from 0, with a fade) once for every stem that finished.
    void Promise.allSettled(batch.map((f) => this.decode(ctx, f))).then(() => {
      for (const f of batch) this.decoding.delete(f.key);
      this.refreshMusic();
    });
  }

  /** One file; an Ogg the browser can't decode retries as MP3; failing both keeps the fallback. */
  private async decode(ctx: AudioContext, f: FinalSound): Promise<void> {
    let buf: AudioBuffer | null = null;
    try {
      // decodeAudioData detaches its buffer: decode a copy (music may be decoded again later).
      buf = await ctx.decodeAudioData(f.bytes.slice(0));
    } catch {
      const mp3 = f.format === 'ogg' ? await this.env.fetchBytes(f.entry.mp3.path) : null;
      if (mp3 !== null) buf = await ctx.decodeAudioData(mp3).catch(() => null);
    }
    // A biome left while decoding doesn't keep its music.
    const biome = biomeOfKey(f.key);
    if (buf === null || (biome !== null && biome !== this.biome)) return;
    // v1.5: nor does a voice language left while decoding.
    if (f.key.startsWith('voice/') && !f.key.startsWith(`voice/${this.voiceLang}/`)) return;
    this.buffers.set(f.key, buf);
    if (!this.recorded.includes(f.key)) this.recorded.push(f.key);
    // v1.5: the bark waiting for this line plays now, if it's still in time.
    const w = this.waiting;
    if (w !== null && f.key === voiceKey(this.voiceLang, w.line)) {
      this.waiting = null;
      if (this.env.now() <= w.until) this.bark(w.line);
    }
  }

  /** M10: the biome whose music and ambience play (title and hunts). Other biomes' decoded music
   *  is released (their compressed bytes stay, to decode again on a later visit). */
  setBiome(id: string): void {
    if (id === this.biome) return;
    this.biome = id;
    for (const key of [...this.buffers.keys()]) {
      const b = biomeOfKey(key);
      if (b !== null && b !== id) this.buffers.delete(key);
    }
    this.refreshMusic();
    this.decodePending();
  }

  /** M10: a new hunt starts calm, not on the last hunt's stampede stem. */
  resetIntensity(): void {
    this.hold.reset();
    this.wantStem = 'calm';
    this.mixer?.setStem('calm');
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
   * M10: Oupa says `barkKey` (v1.5: from the voice language's pack) if a recording was delivered, never over the tally count-up; the
   * music ducks under it. Returns whether it played. v1.0.1 (D-028 review): how often he speaks
   * is the BarkDirector's call (one gap clock for bubbles and voice, so a secret's bark is never
   * silenced by an earlier generic one); here only one Oupa voice plays at a time — a new line
   * stops the one still playing.
   */
  bark(barkKey: string): boolean {
    const { ctx, voiceBus, duck } = this;
    const key = voiceKey(this.voiceLang, barkKey);
    const buf = this.buffers.get(key);
    // A newer bark replaces one still waiting for its line.
    this.waiting = null;
    if (this.muted || this.tallyCounting) return false;
    // v1.5 (D-041): no voice at all with the voice (or master) volume at 0, and no music duck.
    if (this.volumes.voice <= 0 || this.volumes.master <= 0) return false;
    if (buf === undefined) {
      this.missingLine?.();
      // v1.5: the voice pack may still be on its way (it starts on the first gesture): wait a
      // short, bounded time for this line (feel.json audio.barkWaitMs).
      this.waiting = { line: barkKey, until: this.env.now() + this.tuning.barkWaitMs };
      return false;
    }
    if (ctx === null || voiceBus === null || duck === null) return false;
    try {
      this.voiceSrc?.stop();
    } catch {
      // Already ended.
    }
    const src = ctx.createBufferSource();
    this.voiceSrc = src;
    src.buffer = buf;
    src.connect(voiceBus);
    src.start();
    this.voicePlayed.push(key);
    if (this.voicePlayed.length > 50) this.voicePlayed.shift();
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

  /** v1.4 B (D-039): the angry weavers out of a shot family nest chatter and scold. */
  weavers(pan: number): void {
    if (this.ctx === null || this.muted) return;
    this.play('weavers', pan);
  }

  /** v1.1: the gun in hand (HuntScene, each frame): its reload sounds follow it. */
  setWeapon(id: string): void {
    this.weapon = id;
  }

  private gun(id: string = this.weapon): GunSfx {
    return this.gunSfx[id] ?? DEFAULT_GUN_SFX;
  }

  /** A gun's sound for an event, if it has one. */
  private playGun(
    which: 'shot' | 'reloadStarted' | 'shellLoaded' | 'reloadFinished',
    pan: number,
    weapon?: string,
  ): void {
    const id = this.gun(weapon)[which];
    if (isSfx(id)) this.play(id, pan);
  }

  /** Plays the sounds for a frame's events. panOf maps an event to −1 (left) … +1 (right). */
  handle(events: readonly SimEvent[], panOf: (e: SimEvent) => number): void {
    if (this.ctx === null || this.muted) return;
    let shot = false;
    let sting = false;
    for (const e of events) {
      switch (e.type) {
        case 'shotFired': {
          this.weapon = e.weapon;
          if (!shot) this.playGun('shot', panOf(e), e.weapon);
          shot = true;
          // A crate gun reloads without events: its reload sound follows the shot.
          const g = this.gun(e.weapon);
          if (isSfx(g.afterShot) && e.shellsLeft !== 0) {
            const id = g.afterShot;
            this.env.setTimer(() => {
              if (!this.muted) this.play(id, 0.5);
            }, g.afterShotMs ?? 0);
          }
          break;
        }
        case 'emptyClick':
          this.play('click', 0);
          break;
        case 'reloadStarted':
          this.playGun('reloadStarted', 0.5);
          break;
        case 'shellLoaded':
          this.playGun('shellLoaded', 0.5);
          break;
        case 'reloadFinished':
          this.playGun('reloadFinished', 0.5);
          break;
        case 'targetBagged':
          this.play('poof', panOf(e));
          if (e.behaviour !== 'flying' || Math.random() < 0.5) this.play('kek', panOf(e));
          break;
        case 'penaltyApplied':
        case 'secretPenalty':
          this.play('scratch', 0);
          break;
        case 'meerkatHit':
          // v1.7 (D-044): a shot meerkat; inside the colony's cooldown it costs nothing.
          if (e.points < 0) this.play('scratch', 0);
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
        case 'weaponChanged':
          this.weapon = e.weapon;
          this.play('powerup', 0);
          break;
        case 'powerupStarted':
          this.play('powerup', 0);
          break;
        default:
          break;
      }
    }
  }

  private play(id: SfxId, pan: number): void {
    this.voice(sfxKey(id), pan, MUSIC.has(id) ? this.musicBus : this.sfxBus, (ctx, out, noise) =>
      playSfx(ctx, out, id, noise),
    );
  }

  /** 24 Oct (D-037): a sound a lazy chunk brings (its recording once added, else its synth). */
  playExtra(key: string, pan: number, synth: Synth): void {
    if (this.ctx === null || this.muted) return;
    this.voice(key, pan, this.sfxBus, synth);
  }

  private voice(key: string, pan: number, bus: GainNode | null, synth: Synth): void {
    const { ctx, noise } = this;
    if (ctx === null || bus === null || noise === null || this.voices >= MAX_VOICES) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-MAX_PAN, Math.min(MAX_PAN, pan * MAX_PAN));
    panner.connect(bus);
    this.voices++;
    const buf = this.buffers.get(key);
    let seconds: number;
    if (buf !== undefined) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(panner);
      src.start();
      seconds = buf.duration;
    } else {
      seconds = synth(ctx, panner, noise);
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
