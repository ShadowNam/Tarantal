// v1.7 (D-044): the meerkats' sounds through the AudioDirector: the recording from the desert
// asset group once it has arrived, else these small synths (so a build without delivered files
// still chirps). Soft chirps when a head pops up, the sentinel's alarm bark, digging, and the
// Familiefoto's camera click.
import type { AudioDirector, Synth } from './AudioDirector';
import { MEERKAT_SOUNDS, type MeerkatSound } from '../assets/desertAssets';

function tone(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  f0: number,
  f1: number,
  peak: number,
  len: number,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + len);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + len + 0.02);
}

function hiss(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  at: number,
  hz: number,
  peak: number,
  len: number,
): void {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  s.connect(f).connect(g).connect(out);
  s.start(at);
  s.stop(at + len + 0.02);
}

const SYNTH: Record<MeerkatSound, Synth> = {
  // Two soft rising peeps.
  chirp: (ctx, out) => {
    const t = ctx.currentTime;
    tone(ctx, out, t, 2300, 3100, 0.12, 0.07);
    tone(ctx, out, t + 0.1, 2500, 3300, 0.1, 0.06);
    return 0.2;
  },
  // A harsh double bark.
  alarm: (ctx, out, noise) => {
    const t = ctx.currentTime;
    for (const d of [0, 0.16]) {
      tone(ctx, out, t + d, 900, 620, 0.3, 0.11);
      hiss(ctx, out, noise, t + d, 1800, 0.25, 0.09);
    }
    return 0.32;
  },
  // Paws scratching sand.
  dig: (ctx, out, noise) => {
    const t = ctx.currentTime;
    for (const d of [0, 0.09, 0.2]) hiss(ctx, out, noise, t + d, 3200, 0.12, 0.05);
    return 0.27;
  },
  // A soft shutter: a click and a short whirr.
  click: (ctx, out, noise) => {
    const t = ctx.currentTime;
    hiss(ctx, out, noise, t, 4200, 0.35, 0.03);
    hiss(ctx, out, noise, t + 0.05, 1500, 0.12, 0.12);
    return 0.2;
  },
};

export function playMeerkatSound(audio: AudioDirector, id: MeerkatSound, pan: number): void {
  audio.playExtra(MEERKAT_SOUNDS[id], pan, SYNTH[id]);
}
