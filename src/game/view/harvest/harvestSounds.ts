// v1.8c (D-063, art bible §10) The Harvest's sounds through the AudioDirector (playExtra): a
// delivered recording under the key wins, else these small synths (in the lazy HarvestView chunk).
// The wire snapping when the fence breaks, a warthog's grunt (coming in, hit), the thump of a
// bagged one, the workers' hammering (a few knocks now and then), the crop meter's warning and a
// short harvest jingle when the fence is whole.
import type { Synth } from '../../audio/AudioDirector';

export const HARVEST_SOUNDS = {
  snap: 'sfx/harvest_snap',
  grunt: 'sfx/harvest_grunt',
  squeal: 'sfx/harvest_squeal',
  thump: 'sfx/harvest_thump',
  hammer: 'sfx/harvest_hammer',
  warn: 'sfx/harvest_warn',
  jingle: 'sfx/harvest_jingle',
} as const;
export type HarvestSound = keyof typeof HARVEST_SOUNDS;

function tone(
  ctx: AudioContext,
  out: AudioNode,
  f0: number,
  f1: number,
  peak: number,
  len: number,
  delay = 0,
  type: OscillatorType = 'sawtooth',
  formant = 0,
): void {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, len * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  if (formant > 0) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = formant;
    f.Q.value = 2.2;
    o.connect(f).connect(g).connect(out);
  } else o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

function noise(
  ctx: AudioContext,
  out: AudioNode,
  buf: AudioBuffer,
  hz: number,
  q: number,
  peak: number,
  len: number,
  delay = 0,
): void {
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = hz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  s.connect(f).connect(g).connect(out);
  s.start(t0);
  s.stop(t0 + len + 0.02);
}

export const HARVEST_SYNTH: Readonly<Record<HarvestSound, Synth>> = {
  // A taut wire letting go: a bright crack, then a falling metallic twang.
  snap: (ctx, out, buf) => {
    noise(ctx, out, buf, 4200, 1.5, 0.3, 0.06);
    tone(ctx, out, 1400, 180, 0.16, 0.55, 0.02, 'triangle');
    return 0.6;
  },
  // A warthog's grunt: two short low snorts.
  grunt: (ctx, out, buf) => {
    tone(ctx, out, 150, 95, 0.32, 0.16, 0, 'sawtooth', 380);
    tone(ctx, out, 140, 90, 0.28, 0.2, 0.2, 'sawtooth', 340);
    noise(ctx, out, buf, 600, 1.2, 0.08, 0.3);
    return 0.45;
  },
  // A piglet's squeal.
  squeal: (ctx, out) => {
    tone(ctx, out, 900, 1500, 0.16, 0.22, 0, 'sawtooth', 1600);
    return 0.25;
  },
  thump: (ctx, out, buf) => {
    tone(ctx, out, 110, 50, 0.4, 0.24, 0, 'sine');
    noise(ctx, out, buf, 450, 0.9, 0.2, 0.25);
    return 0.3;
  },
  // Two knocks of a hammer on a post.
  hammer: (ctx, out, buf) => {
    for (let i = 0; i < 2; i++) {
      noise(ctx, out, buf, 1900, 3, 0.22, 0.05, i * 0.32);
      tone(ctx, out, 320, 240, 0.12, 0.08, i * 0.32, 'square', 700);
    }
    return 0.7;
  },
  // The crop meter's warning: two falling beeps (never loud).
  warn: (ctx, out) => {
    tone(ctx, out, 880, 860, 0.12, 0.16, 0, 'square', 1200);
    tone(ctx, out, 660, 640, 0.12, 0.22, 0.2, 'square', 1000);
    return 0.45;
  },
  // A short harvest jingle: four rising notes on a plucked string, the last one held.
  jingle: (ctx, out) => {
    const notes = [392, 494, 587, 784];
    notes.forEach((f, i) => {
      tone(ctx, out, f, f, 0.16, i === notes.length - 1 ? 0.7 : 0.18, i * 0.14, 'triangle');
    });
    return 1.1;
  },
};
