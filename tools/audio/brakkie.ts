// v1.12 (D-069, art bible §10.5) interim sounds for Brakkie, made in code (no recordings):
// - brakkie_bark / brakkie_bark2: a Jack Russell's short, sharp bark ("rruf!") — a breathy noise
//   onset, then a buzzy voiced burst whose pitch jumps up and falls, through the two formants
//   of a small dog's open mouth; the second a little higher and double ("rip-rip").
// - brakkie_yelp: a startled yelp — a quick high squeal that rises and drops away (startled,
//   never a cry of pain: he isn't hurt).
// - brakkie_pant: happy panting after a fetch — six breathy "hah"s, in and out.
// Mono, 44.1 kHz; the pack tool normalises each to the effects loudness (art bible §10).
import {
  ad,
  bandpass,
  buf,
  fadeEnds,
  glide,
  highpass,
  lowpass,
  mix,
  noise,
  normalise,
  osc,
  rng,
  shape,
  withReverb,
  type Buf,
} from './dsp';

export const BRAKKIE_RATE = 44100;
const SR = BRAKKIE_RATE;

/** One bark: f0 its peak pitch, len its length (s). */
function woof(r: () => number, f0: number, len: number): Buf {
  const out = buf(len + 0.05, SR);
  // The breath before the voice.
  mix(out, shape(bandpass(noise(0.03, SR, r), SR, 2200, 1.4), SR, ad(0.003, 0.012)), 0, SR, 0.5);
  // The voice: a buzzy pulse, up then down.
  const pitch = (t: number): number =>
    t < len * 0.25
      ? f0 * (0.8 + (0.2 * t) / (len * 0.25))
      : glide(f0, f0 * 0.62, len * 0.75)(t - len * 0.25);
  const voice = osc('saw', pitch, len, SR);
  const rough = osc('square', (t) => pitch(t) * 0.5, len, SR);
  const v = buf(len, SR);
  mix(v, voice, 0, SR, 0.7);
  mix(v, rough, 0, SR, 0.25);
  mix(v, bandpass(noise(len, SR, r), SR, 1600, 1), 0, SR, 0.25);
  // Two formants of a small open mouth.
  const f1 = bandpass(v, SR, 950, 1.6);
  const f2 = bandpass(v, SR, 2600, 2.2);
  const shaped = buf(len, SR);
  mix(shaped, f1, 0, SR, 1);
  mix(shaped, f2, 0, SR, 0.6);
  shape(shaped, SR, (t) => Math.min(1, t / 0.008) * Math.exp(-t / (len * 0.45)));
  mix(out, shaped, 0.012, SR, 1);
  return out;
}

function bark(): Buf {
  const r = rng(71);
  const out = woof(r, 620, 0.16);
  return fadeEnds(
    normalise(withReverb(highpass(out, SR, 180), SR, 0.12, 0.5, 0.5), 0.9),
    SR,
    0.001,
    0.04,
  );
}

function bark2(): Buf {
  const r = rng(72);
  const out = buf(0.42, SR);
  mix(out, woof(r, 700, 0.12), 0, SR, 1);
  mix(out, woof(r, 680, 0.13), 0.18, SR, 0.9);
  return fadeEnds(
    normalise(withReverb(highpass(out, SR, 180), SR, 0.12, 0.5, 0.5), 0.9),
    SR,
    0.001,
    0.04,
  );
}

function yelp(): Buf {
  const r = rng(73);
  const len = 0.34;
  const pitch = (t: number): number =>
    t < 0.06 ? 900 + (t / 0.06) * 700 : glide(1600, 700, len - 0.06)(t - 0.06);
  const v = buf(len, SR);
  mix(v, osc('saw', pitch, len, SR), 0, SR, 0.6);
  mix(
    v,
    osc('sine', (t) => pitch(t) * 2, len, SR),
    0,
    SR,
    0.3,
  );
  mix(v, bandpass(noise(len, SR, r), SR, 2400, 1.2), 0, SR, 0.15);
  const y = buf(len, SR);
  mix(y, bandpass(v, SR, 1500, 1.2), 0, SR, 1);
  mix(y, bandpass(v, SR, 3200, 2), 0, SR, 0.5);
  shape(y, SR, (t) => Math.min(1, t / 0.01) * Math.min(1, (len - t) / 0.12));
  return fadeEnds(normalise(withReverb(y, SR, 0.1, 0.5, 0.5), 0.85), SR, 0.001, 0.03);
}

function pant(): Buf {
  const r = rng(74);
  const out = buf(1.8, SR);
  for (let i = 0; i < 6; i++) {
    const at = 0.05 + i * 0.27;
    const out1 = i % 2 === 0;
    const len = out1 ? 0.13 : 0.1;
    const breath = bandpass(noise(len, SR, r), SR, out1 ? 1300 : 1700, 1.3);
    shape(breath, SR, (t) => Math.sin((Math.PI * t) / len) ** 2);
    mix(out, breath, at, SR, out1 ? 0.9 : 0.6);
  }
  return fadeEnds(normalise(lowpass(out, SR, 5000), 0.6), SR, 0.002, 0.05);
}

const CALLS: Readonly<Record<string, () => Buf>> = {
  brakkie_bark: bark,
  brakkie_bark2: bark2,
  brakkie_yelp: yelp,
  brakkie_pant: pant,
};

/** Brakkie's sounds (`sfx/<id>`), group `brakkie`. */
export const BRAKKIE_CALLS: readonly string[] = Object.keys(CALLS);

export function renderBrakkie(id: string): Buf {
  const f = CALLS[id];
  if (f === undefined) throw new Error(`no interim Brakkie sound for sfx/${id}`);
  return f();
}
