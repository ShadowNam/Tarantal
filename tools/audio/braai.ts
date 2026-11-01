// v1.11 (D-068, art bible §10.4) interim sounds for Die Braai, made in code (no recordings):
// - braai_fire: the bed under the braai tally — a wood fire's soft roar, its crackles and pops,
//   and a few field crickets chirping at different rates; a seamless loop.
// - braai_guitar: a soft, original fingerpicked figure on a nylon-string guitar (G, Em, C, D at
//   an easy 72 bpm; four bars, no quoted tune), a seamless loop under Oupa's story.
// - braai_nightjar: a far fiery-necked nightjar's "Good Lord, deliver us" — two clear whistles,
//   then a quavering phrase falling away — through a long night reverb.
// - braai_vastrap: Oupa's vastrap sting — a quick original oom-pa phrase on a concertina (two
//   detuned reeds, the bellows' tremolo) over a bass and a "pa" chord.
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
  mixLoop,
  mtof,
  noise,
  normalise,
  osc,
  pluck,
  rng,
  shape,
  withReverb,
  type Buf,
} from './dsp';

export const BRAAI_RATE = 44100;
const SR = BRAAI_RATE;

/** Folds a buffer `xf` s longer than the loop into a seamless loop of `sec` s (equal power). */
function loopify(x: Buf, sec: number, xf: number): Buf {
  const n = Math.round(sec * SR);
  const m = Math.round(xf * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] ?? 0;
  for (let i = 0; i < m; i++) {
    const a = i / m;
    out[i] =
      (x[i] ?? 0) * Math.sin((a * Math.PI) / 2) + (x[n + i] ?? 0) * Math.cos((a * Math.PI) / 2);
  }
  return out;
}

/** One crackle: a tiny burst of bright noise (a pop when `big`). */
function crackle(r: () => number, big: boolean): Buf {
  const len = big ? 0.05 : 0.012 + r() * 0.012;
  const hz = big ? 1400 + r() * 1200 : 2400 + r() * 3600;
  return shape(
    bandpass(noise(len, SR, r), SR, hz, big ? 2 : 4),
    SR,
    ad(0.0004, big ? 0.012 : 0.004),
  );
}

/** A field cricket's chirp: three pulses of a ~4.6 kHz tone. */
function chirp(hz: number): Buf {
  const out = buf(0.16, SR);
  for (let k = 0; k < 3; k++)
    mix(
      out,
      shape(
        osc('sine', () => hz, 0.03, SR),
        SR,
        ad(0.004, 0.012),
      ),
      k * 0.045,
      SR,
      1,
    );
  return out;
}

function fire(): Buf {
  const sec = 10;
  const xf = 1.5;
  const r = rng(6107);
  const raw = buf(sec + xf, SR);
  // The roar: low noise, gently breathing.
  const roar = lowpass(noise(sec + xf, SR, r), SR, 260);
  shape(roar, SR, (t) => 0.7 + 0.3 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1));
  mix(raw, roar, 0, SR, 0.9);
  mix(raw, highpass(lowpass(noise(sec + xf, SR, r), SR, 3000), SR, 1200), 0, SR, 0.03);
  const out = loopify(raw, sec, xf);
  // Crackles and pops, wrapped so the loop has no gap.
  for (let t = 0; t < sec; t += 0.02 + r() * 0.16)
    mixLoop(out, crackle(r, r() < 0.06), t, SR, 0.25 + r() * 0.5);
  // Crickets: three of them, near and far, each at its own rate.
  for (const [hz, every, gain, start] of [
    [4600, 0.82, 0.05, 0.1],
    [4350, 1.07, 0.03, 0.4],
    [4900, 0.66, 0.018, 0.25],
  ] as const)
    for (let t = start; t < sec; t += every) mixLoop(out, chirp(hz), t, SR, gain);
  return normalise(out, 0.7);
}

/** A nylon string: a soft Karplus–Strong pluck, darker for the bass. */
function nylon(m: number, sec: number, r: () => number, bright = 0.35): Buf {
  const x = pluck(mtof(m), sec, SR, r, 0.997, bright);
  return lowpass(x, SR, 2600);
}

function guitar(): Buf {
  const bpm = 72;
  const beat = 60 / bpm;
  const bars = 4;
  const sec = bars * 4 * beat;
  const r = rng(7219);
  const out = buf(sec, SR);
  // G, Em, C, D: bass, then a gentle pattern of eighths over the chord (an original figure).
  const chords: readonly (readonly [number, readonly number[]])[] = [
    [43, [55, 59, 62, 67]],
    [40, [55, 59, 64, 67]],
    [48, [55, 60, 64, 67]],
    [50, [54, 57, 62, 66]],
  ];
  const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
  chords.forEach(([bass, tones], bar) => {
    const at = bar * 4 * beat;
    mixLoop(out, nylon(bass, 3.2, r, 0.2), at, SR, 0.55);
    mixLoop(out, nylon(bass + 7, 2.2, r, 0.2), at + 2 * beat, SR, 0.3);
    pattern.forEach((k, i) => {
      const m = tones[k] ?? 60;
      // A little human timing: the eighths lean, never on the grid.
      const t = at + i * 0.5 * beat + (r() - 0.5) * 0.012;
      mixLoop(out, nylon(m, 1.8, r), t, SR, 0.22 + (i % 2 === 0 ? 0.06 : 0));
    });
    // A melody note on the last beat leading into the next chord.
    mixLoop(out, nylon((tones[3] ?? 67) + 2, 1.4, r, 0.5), at + 3.5 * beat, SR, 0.2);
  });
  return normalise(withReverb(out, SR, 0.18, 1.1, 0.7), 0.6);
}

/** A whistle at a frequency curve with a vibrato (the nightjar's liquid note). */
function whistle(f: (t: number) => number, sec: number, trem: number): Buf {
  const x = osc('sine', (t) => f(t) * (1 + 0.012 * Math.sin(t * 2 * Math.PI * 9)), sec, SR);
  return shape(
    x,
    SR,
    (t) =>
      Math.min(1, t / 0.03) *
      Math.min(1, (sec - t) / 0.05) *
      (trem > 0 ? 0.55 + 0.45 * Math.sin(t * 2 * Math.PI * trem) : 1),
  );
}

function nightjar(): Buf {
  const out = buf(3.6, SR);
  // "Good" — "Lord": two clear notes.
  mix(out, whistle(glide(2050, 2150, 0.3), 0.32, 0), 0.1, SR, 0.8);
  mix(out, whistle(glide(1900, 1800, 0.28), 0.3, 0), 0.5, SR, 0.8);
  // "de-li-ver us": a quavering phrase, each note lower.
  const notes = [1820, 1680, 1520, 1360];
  notes.forEach((hz, i) => {
    mix(out, whistle(glide(hz, hz * 0.94, 0.26), 0.26, 28), 0.92 + i * 0.3, SR, 0.7 - i * 0.08);
  });
  // Far off: dull, in a long night reverb.
  const far = lowpass(out, SR, 3200);
  return fadeEnds(normalise(withReverb(far, SR, 0.5, 1.6, 0.85), 0.5), SR, 0.002, 0.3);
}

/** A concertina note: two slightly detuned reeds, a bellows tremolo. */
function reed(m: number, sec: number): Buf {
  const f = mtof(m);
  const x = buf(sec, SR);
  mix(
    x,
    osc('saw', () => f, sec, SR),
    0,
    SR,
    0.5,
  );
  mix(
    x,
    osc('square', () => f * 1.004, sec, SR),
    0,
    SR,
    0.3,
  );
  const y = bandpass(x, SR, f * 3, 0.8);
  return shape(
    y,
    SR,
    (t) =>
      Math.min(1, t / 0.015) * Math.min(1, (sec - t) / 0.03) * (0.85 + 0.15 * Math.sin(t * 38)),
  );
}

function vastrap(): Buf {
  const beat = 0.2;
  const out = buf(3, SR);
  // An original, quick oom-pa phrase in C: up the triad, a turn, home.
  const melody: readonly (readonly [number, number])[] = [
    [72, 1],
    [76, 1],
    [79, 1],
    [77, 0.5],
    [76, 0.5],
    [74, 1],
    [77, 1],
    [76, 1],
    [72, 2],
  ];
  let t = 0;
  for (const [m, b] of melody) {
    mix(out, reed(m, b * beat * 0.92), t * beat, SR, 0.5);
    t += b;
  }
  // Oom (bass) on the beats, pa (a chord) between.
  for (let k = 0; k < 10; k++) {
    const at = k * beat;
    if (k % 2 === 0) mix(out, reed(k < 6 ? 48 : 43, beat * 0.8), at, SR, 0.35);
    else
      for (const m of k < 6 ? [60, 64, 67] : [59, 62, 67])
        mix(out, reed(m, beat * 0.5), at, SR, 0.12);
  }
  mix(out, reed(48, 0.5), 10 * beat, SR, 0.35);
  return fadeEnds(normalise(withReverb(out, SR, 0.15, 0.8, 0.6), 0.85), SR, 0.002, 0.2);
}

const CALLS: Readonly<Record<string, () => Buf>> = {
  braai_fire: fire,
  braai_guitar: guitar,
  braai_nightjar: nightjar,
  braai_vastrap: vastrap,
};

/** The braai's sounds (`sfx/<id>`), group `braai`. */
export const BRAAI_CALLS: readonly string[] = Object.keys(CALLS);

export function renderBraai(id: string): Buf {
  const f = CALLS[id];
  if (f === undefined) throw new Error(`no interim braai sound for sfx/${id}`);
  return f();
}
