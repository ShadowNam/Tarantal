// v1.16 (D-078, art bible §10, docs/06) the chacma baboons' own calls, made in code (no recordings,
// no downloads):
// - baboon_wahoo: the adult male's loud two-syllable alarm bark "wa-HOO" — a short harsh rising
//   "wa", then a longer, louder falling "hoo" through the low open-mouth formants of a big male,
//   with its echo off the koppies (two late, dull repeats).
// - baboon_grunt: the troop's contact grunts — two or three low, breathy "ugh"s.
// - baboon_squeal: a youngster's squeal — high, wavering and screechy.
// - baboon_scream: the short scream of a raider scared off — harsh, noisy, high then cracking.
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
  saturate,
  scale,
  shape,
  withReverb,
  type Buf,
} from './dsp';

export const BABOON_RATE = 44100;
const SR = BABOON_RATE;

/** One voiced syllable: pitch over time, formants (Hz, gain), breath, and its length (s). */
function syllable(
  r: () => number,
  pitch: (t: number) => number,
  len: number,
  formants: readonly (readonly [number, number])[],
  breath: number,
  drive: number,
): Buf {
  const v = buf(len, SR);
  mix(v, osc('saw', pitch, len, SR), 0, SR, 0.7);
  // The rough, barking edge: a sub-octave pulse and noise in the throat.
  mix(
    v,
    osc('square', (t) => pitch(t) * 0.5, len, SR),
    0,
    SR,
    0.25,
  );
  mix(v, bandpass(noise(len, SR, r), SR, 1200, 0.8), 0, SR, breath);
  const out = buf(len, SR);
  for (const [f, g] of formants) mix(out, bandpass(v, SR, f, 2), 0, SR, g);
  return saturate(out, drive);
}

function wahoo(): Buf {
  const r = rng(301);
  const out = buf(2.1, SR);
  // "wa": short, rising, harsh.
  const wa = syllable(
    r,
    (t) => 190 + (t / 0.11) * 90,
    0.11,
    [
      [650, 1],
      [1150, 0.6],
      [2400, 0.2],
    ],
    0.25,
    2.2,
  );
  shape(wa, SR, ad(0.008, 0.1));
  // "HOO": longer, louder, falling, rounder (lower formants).
  const hooLen = 0.42;
  const hoo = syllable(
    r,
    (t) => glide(330, 170, hooLen)(t) * (1 + 0.015 * Math.sin(t * 2 * Math.PI * 9)),
    hooLen,
    [
      [480, 1],
      [880, 0.55],
      [2200, 0.15],
    ],
    0.18,
    2.6,
  );
  shape(hoo, SR, (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.22));
  const call = buf(0.62, SR);
  mix(call, wa, 0, SR, 0.85);
  mix(call, hoo, 0.13, SR, 1);
  mix(out, call, 0, SR, 1);
  // The koppies answer: two late, duller repeats.
  mix(out, lowpass(call, SR, 1400), 0.42, SR, 0.28);
  mix(out, lowpass(call, SR, 900), 0.95, SR, 0.12);
  return fadeEnds(
    normalise(withReverb(highpass(out, SR, 110), SR, 0.22, 1.4, 0.7), 0.9),
    SR,
    0.002,
    0.2,
  );
}

function grunt(): Buf {
  const r = rng(302);
  const out = buf(1.1, SR);
  const gaps = [0, 0.32, 0.6];
  gaps.forEach((at, i) => {
    const len = 0.13 + 0.03 * i;
    const g = syllable(
      r,
      (t) => glide(118 - i * 6, 92, len)(t),
      len,
      [
        [380, 1],
        [760, 0.4],
      ],
      0.4,
      1.6,
    );
    shape(g, SR, ad(0.012, len - 0.012));
    mix(out, g, at, SR, i === 2 ? 0.6 : 0.9);
  });
  return fadeEnds(normalise(lowpass(out, SR, 2600), 0.8), SR, 0.002, 0.05);
}

function squeal(): Buf {
  const r = rng(303);
  const len = 0.7;
  const pitch = (t: number): number =>
    (t < 0.08 ? 900 + (t / 0.08) * 700 : glide(1600, 1150, len - 0.08)(t - 0.08)) *
    (1 + 0.06 * Math.sin(t * 2 * Math.PI * 13));
  const v = buf(len, SR);
  mix(v, osc('saw', pitch, len, SR), 0, SR, 0.55);
  mix(
    v,
    osc('sine', (t) => pitch(t) * 2, len, SR),
    0,
    SR,
    0.25,
  );
  mix(v, bandpass(noise(len, SR, r), SR, 3000, 1.2), 0, SR, 0.15);
  const y = buf(len, SR);
  mix(y, bandpass(v, SR, 1700, 1.4), 0, SR, 1);
  mix(y, bandpass(v, SR, 3400, 2), 0, SR, 0.5);
  shape(y, SR, (t) => Math.min(1, t / 0.015) * Math.min(1, (len - t) / 0.2));
  return fadeEnds(normalise(withReverb(y, SR, 0.12, 0.8, 0.6), 0.75), SR, 0.002, 0.05);
}

function scream(): Buf {
  const r = rng(304);
  const len = 0.65;
  const pitch = (t: number): number =>
    t < 0.12 ? 700 + (t / 0.12) * 500 : glide(1200, 620, len - 0.12)(t - 0.12);
  const v = syllable(
    r,
    pitch,
    len,
    [
      [1100, 1],
      [2300, 0.7],
      [3600, 0.25],
    ],
    0.5,
    3.2,
  );
  shape(v, SR, (t) => Math.min(1, t / 0.01) * Math.min(1, (len - t) / 0.25));
  // The voice cracks into noise at the end.
  const crack = bandpass(noise(0.2, SR, r), SR, 2400, 1);
  shape(crack, SR, ad(0.01, 0.19));
  const out = buf(len + 0.3, SR);
  mix(out, v, 0, SR, 1);
  mix(out, scale(crack, 0.5), len - 0.2, SR, 1);
  return fadeEnds(normalise(withReverb(out, SR, 0.14, 0.9, 0.6), 0.85), SR, 0.002, 0.06);
}

const CALLS: Readonly<Record<string, () => Buf>> = {
  baboon_wahoo: wahoo,
  baboon_grunt: grunt,
  baboon_squeal: squeal,
  baboon_scream: scream,
};

/** The baboons' calls (`sfx/<id>`), in the baboons' lazy group. */
export const BABOON_CALL_IDS: readonly string[] = Object.keys(CALLS);

export function renderBaboon(id: string): Buf {
  const f = CALLS[id];
  if (f === undefined) throw new Error(`no interim baboon sound for sfx/${id}`);
  return f();
}
