// All game audio goes through here (Tech §7). Starts only after a user gesture, mutes on
// visibilitychange (and later on pause/ads via the platform adapter), pans by screen x (±0.7),
// and caps simultaneous voices at 16. Reacts only to typed sim events.
import type { SimEvent } from '../../sim/events';
import { createNoise, playSfx, type SfxId } from './synth';

const MAX_VOICES = 16;
const MAX_PAN = 0.7;

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private hidden = false;
  private muted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      this.applyGain();
      if (this.hidden) void this.ctx?.suspend();
      else void this.ctx?.resume();
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
        this.noise = createNoise(this.ctx);
        this.applyGain();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      // No audio is better than no game.
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Plays the sounds for a frame's events. panOf maps an event to −1 (left) … +1 (right). */
  handle(events: readonly SimEvent[], panOf: (e: SimEvent) => number): void {
    if (this.ctx === null || this.hidden) return;
    let shot = false;
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
          this.play('scratch', 0);
          break;
        case 'stampedeStarted':
          this.play('stampede', 0);
          break;
        default:
          break;
      }
    }
  }

  private play(id: SfxId, pan: number): void {
    const { ctx, master, noise } = this;
    if (ctx === null || master === null || noise === null || this.voices >= MAX_VOICES) return;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-MAX_PAN, Math.min(MAX_PAN, pan * MAX_PAN));
    panner.connect(master);
    this.voices++;
    const seconds = playSfx(ctx, panner, id, noise);
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
    this.master.gain.setValueAtTime(this.muted || this.hidden ? 0 : 0.6, this.ctx.currentTime);
  }
}
