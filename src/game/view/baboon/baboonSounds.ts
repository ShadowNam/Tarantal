// v1.8b (D-062, art bible §10) The baboons' sounds through the AudioDirector (playExtra): a
// delivered recording under the key wins, else these small synths (in the lazy BaboonView chunk).
// The lookout's two-note "wa-hoo" bark, a hit raider's screech, the raids' own sounds (the tap's
// water, a crunch of fruit or mielie, the throw's whoosh, the moon's rude raspberry, the chase's
// yelps) and the thump of a bagged one.
import type { RaidAction } from '../../../content/schemas';
import type { Synth } from '../../audio/AudioDirector';

export const BABOON_SOUNDS = {
  bark: 'sfx/baboon_bark',
  screech: 'sfx/baboon_screech',
  thump: 'sfx/baboon_thump',
  splash: 'sfx/baboon_splash',
  crunch: 'sfx/baboon_crunch',
  whoosh: 'sfx/baboon_whoosh',
  raspberry: 'sfx/baboon_raspberry',
  yelp: 'sfx/baboon_yelp',
} as const;
export type BaboonSound = keyof typeof BABOON_SOUNDS;

/** The sound a raid's action makes when the raider gets to it. */
export const RAID_SOUND: Readonly<Record<RaidAction, BaboonSound>> = {
  hat: 'screech',
  fruit: 'crunch',
  tap: 'splash',
  mielie: 'crunch',
  throw: 'whoosh',
  moon: 'raspberry',
  chase: 'yelp',
};

function voiced(
  ctx: AudioContext,
  out: AudioNode,
  f0: number,
  f1: number,
  formant: number,
  peak: number,
  len: number,
  delay = 0,
  type: OscillatorType = 'sawtooth',
): void {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
  f.type = 'bandpass';
  f.frequency.value = formant;
  f.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + len * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(f).connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.02);
}

function noisy(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  hz: number,
  q: number,
  peak: number,
  len: number,
  delay = 0,
): void {
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noise;
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

export const BABOON_SYNTH: Readonly<Record<BaboonSound, Synth>> = {
  // "Wa-hoo!": a short rising bark, then a longer falling one.
  bark: (ctx, out) => {
    voiced(ctx, out, 260, 420, 900, 0.28, 0.16);
    voiced(ctx, out, 400, 210, 700, 0.3, 0.42, 0.2);
    return 0.7;
  },
  screech: (ctx, out, noise) => {
    voiced(ctx, out, 900, 1300, 1800, 0.18, 0.35);
    noisy(ctx, out, noise, 2600, 1.4, 0.12, 0.3);
    return 0.4;
  },
  thump: (ctx, out, noise) => {
    voiced(ctx, out, 120, 55, 200, 0.4, 0.22, 0, 'sine');
    noisy(ctx, out, noise, 500, 0.9, 0.2, 0.25);
    return 0.3;
  },
  splash: (ctx, out, noise) => {
    noisy(ctx, out, noise, 1800, 0.6, 0.22, 0.9);
    noisy(ctx, out, noise, 3200, 1.2, 0.08, 0.6, 0.15);
    return 1;
  },
  crunch: (ctx, out, noise) => {
    for (let i = 0; i < 3; i++) noisy(ctx, out, noise, 1400 + i * 300, 2, 0.18, 0.07, i * 0.11);
    return 0.4;
  },
  whoosh: (ctx, out, noise) => {
    noisy(ctx, out, noise, 900, 0.8, 0.2, 0.35);
    return 0.4;
  },
  raspberry: (ctx, out, noise) => {
    voiced(ctx, out, 95, 80, 420, 0.3, 0.55, 0, 'square');
    noisy(ctx, out, noise, 700, 1, 0.06, 0.5);
    return 0.6;
  },
  yelp: (ctx, out) => {
    for (let i = 0; i < 3; i++) voiced(ctx, out, 520, 330, 1100, 0.2, 0.14, i * 0.17);
    return 0.6;
  },
};
