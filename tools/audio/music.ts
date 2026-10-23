// v1.1 interim music and ambience (D-032): per biome, three music stems (calm / build / stampede)
// of the same length and tempo — 8 bars at 120 bpm, 16 s, seamless loops — that the MusicMixer
// crossfades by intensity, plus one ambience bed (16 s loop). Each biome has its own instrument
// and key (Karoo: fingerpicked guitar in D; Bushveld: marimba in G; Kalahari: kalimba in A minor
// pentatonic; Okavango: guitar and marimba in F). Mono at 32 kHz to keep each biome's lazy chunk
// small (Tech §15); the pack tool normalises music to −16 and ambience to −20 LUFS.
import {
  ad,
  bandpass,
  bar,
  buf,
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
  reverb,
  rng,
  saturate,
  shape,
  type Buf,
} from './dsp';

/** Music stems at 22.05 kHz, ambience at 16 kHz (16 s): enough for interim beds, and it keeps each
 *  biome's lazy chunk inside 1.5 MB (Tech §15). */
export const MUSIC_RATE = 22050;
export const AMB_RATE = 16000;
const SR = MUSIC_RATE;
export const BPM = 120;
const BEAT = 60 / BPM;
export const LOOP_SEC = 16;
export const AMB_SEC = 16;
export const STEM_IDS = ['calm', 'build', 'stampede'] as const;
export type StemId = (typeof STEM_IDS)[number];

type Lead = 'guitar' | 'marimba' | 'kalimba' | 'guitarMarimba';
interface Style {
  readonly root: number;
  /** Four chords (scale-degree semitone sets from the root), two bars each. */
  readonly chords: readonly (readonly number[])[];
  readonly lead: Lead;
  readonly seed: number;
}

const STYLES: Readonly<Record<string, Style>> = {
  // I – V – vi – IV in D: a warm farm-porch guitar.
  'karoo-autumn': {
    root: 50,
    chords: [
      [0, 4, 7],
      [7, 11, 14],
      [9, 12, 16],
      [5, 9, 12],
    ],
    lead: 'guitar',
    seed: 101,
  },
  // I – IV – I – V in G on marimba.
  'bushveld-winter': {
    root: 55,
    chords: [
      [0, 4, 7],
      [5, 9, 12],
      [0, 4, 7],
      [7, 11, 14],
    ],
    lead: 'marimba',
    seed: 202,
  },
  // i – VII – VI – VII in A minor, kalimba.
  'kalahari-summer': {
    root: 57,
    chords: [
      [0, 3, 7],
      [-2, 2, 5],
      [-4, 0, 3],
      [-2, 2, 5],
    ],
    lead: 'kalimba',
    seed: 303,
  },
  // I – vi – IV – V in F, guitar with marimba answers.
  'okavango-spring': {
    root: 53,
    chords: [
      [0, 4, 7],
      [9, 12, 16],
      [5, 9, 12],
      [7, 11, 14],
    ],
    lead: 'guitarMarimba',
    seed: 404,
  },
};

export const MUSIC_BIOMES: readonly string[] = Object.keys(STYLES);

function note(lead: Exclude<Lead, 'guitarMarimba'>, m: number, r: () => number, len = 1.6): Buf {
  const f = mtof(m);
  if (lead === 'guitar') return pluck(f, len, SR, r, 0.9965, 0.6);
  if (lead === 'marimba')
    return bar(f, len * 0.6, SR, [
      [1, 1, 0.28],
      [3.93, 0.32, 0.06],
      [9.2, 0.08, 0.02],
    ]);
  return bar(f, len, SR, [
    [1, 1, 0.45],
    [2.0, 0.12, 0.12],
    [5.4, 0.22, 0.04],
  ]);
}

const kick = (): Buf => shape(osc('sine', glide(120, 44, 0.12), 0.3, SR), SR, ad(0.002, 0.08));
const shaker = (r: () => number, amp = 1): Buf =>
  shape(highpass(noise(0.07, SR, r), SR, 5000), SR, ad(0.006, 0.02)).map((v) => v * amp);
const drum = (r: () => number, hz: number): Buf => {
  const x = shape(osc('sine', glide(hz, hz * 0.62, 0.08), 0.25, SR), SR, ad(0.002, 0.06));
  mix(x, shape(bandpass(noise(0.05, SR, r), SR, 1800, 1), SR, ad(0.001, 0.01)), 0, SR, 0.4);
  return x;
};
const clap = (r: () => number): Buf => {
  const x = buf(0.2, SR);
  for (const at of [0, 0.011, 0.022])
    mix(x, shape(bandpass(noise(0.15, SR, r), SR, 1400, 1.2), SR, ad(0.001, 0.03)), at, SR, 0.7);
  return x;
};
const bass = (m: number, len: number): Buf =>
  lowpass(
    shape(
      osc('tri', () => mtof(m), len, SR),
      SR,
      ad(0.006, len * 0.5, len),
    ),
    SR,
    900,
  );

/** A wet-only reverb of a loop, folded so its tail wraps seamlessly. */
function loopReverb(x: Buf, size: number): Buf {
  const twice = new Float32Array(x.length * 2);
  twice.set(x, 0);
  twice.set(x, x.length);
  return reverb(twice, SR, size, 0.78).subarray(x.length);
}

/** One stem of a biome's music: a 16 s seamless loop. */
export function renderStem(biome: string, stem: StemId): Buf {
  const s = STYLES[biome];
  if (s === undefined) throw new Error(`no interim music style for ${biome}`);
  const r = rng(s.seed + STEM_IDS.indexOf(stem) * 7);
  const out = buf(LOOP_SEC, SR);
  const lead = s.lead === 'guitarMarimba' ? 'guitar' : s.lead;
  const fast = stem === 'stampede';
  const bars = 8;
  for (let b = 0; b < bars; b++) {
    const chord = s.chords[Math.floor(b / 2)] ?? [0, 4, 7];
    const t0 = b * 4 * BEAT;
    // Lead: an 8th-note arpeggio (16ths in the Stampede), root – 5th – 3rd – octave …
    const pattern = [0, 2, 1, 2, 0, 2, 1, 2].map((k) => chord[k % chord.length] ?? 0);
    const steps = fast ? 16 : 8;
    for (let k = 0; k < steps; k++) {
      const deg = pattern[k % pattern.length] ?? 0;
      const oct = fast && k % 4 === 3 ? 12 : k % 8 === 4 ? 12 : 0;
      const at = t0 + (k * 4 * BEAT) / steps + (r() - 0.5) * 0.008;
      mixLoop(
        out,
        note(lead, s.root + 12 + deg + oct, r, fast ? 0.8 : 1.6),
        at,
        SR,
        0.5 + r() * 0.15,
      );
    }
    if (s.lead === 'guitarMarimba' && b % 2 === 1)
      for (const [k, deg] of [chord[2], chord[1], chord[0]].entries())
        mixLoop(
          out,
          note('marimba', s.root + 24 + (deg ?? 0), r),
          t0 + (4 + k) * (BEAT / 2),
          SR,
          0.35,
        );
    // A soft low root under the calm stem; bass, shaker and drums join in the build.
    if (stem === 'calm') {
      mixLoop(out, note(lead, s.root + (chord[0] ?? 0), r, 3), t0, SR, 0.35);
      continue;
    }
    for (let beat = 0; beat < 4; beat++) {
      const at = t0 + beat * BEAT;
      const deg = beat === 2 ? (chord[2] ?? 7) - 12 : (chord[0] ?? 0);
      mixLoop(out, bass(s.root - 12 + deg, fast ? BEAT * 0.45 : BEAT * 0.9), at, SR, 0.55);
      if (fast)
        mixLoop(out, bass(s.root - 12 + (chord[0] ?? 0), BEAT * 0.4), at + BEAT / 2, SR, 0.4);
      if (beat % 2 === 0 || fast) mixLoop(out, kick(), at, SR, fast ? 0.8 : 0.6);
      if (beat % 2 === 1) mixLoop(out, fast ? clap(r) : drum(r, 260), at, SR, fast ? 0.45 : 0.35);
      const per = fast ? 4 : 2;
      for (let k = 0; k < per; k++)
        mixLoop(
          out,
          shaker(r, k % 2 === 0 ? 1 : 0.6),
          at + (k * BEAT) / per,
          SR,
          fast ? 0.22 : 0.16,
        );
      if (fast && beat === 3) mixLoop(out, drum(r, 180), at + BEAT / 2, SR, 0.4);
    }
  }
  const wet = loopReverb(out, s.lead === 'guitar' ? 1.1 : 1.3);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (wet[i] ?? 0) * 0.28;
  // Gentle saturation tames the plucks' peaks so the stem reaches −16 LUFS under −1 dBTP.
  return normalise(saturate(normalise(out), 2.2), 0.8);
}

// ------------------------------------------------------------------------------- ambience

const AR = AMB_RATE;

/** Seamless filtered noise bed: rendered long, the tail crossfaded into the head. */
function bed(sec: number, r: () => number, filter: (x: Buf) => Buf): Buf {
  const fade = 2;
  const long = filter(noise(sec + fade, AR, r));
  const out = long.slice(0, Math.round(sec * AR));
  const n = Math.round(fade * AR);
  const off = Math.round(sec * AR);
  for (let i = 0; i < n; i++) {
    const a = i / n;
    out[i] = (out[i] ?? 0) * a + (long[off + i] ?? 0) * (1 - a);
  }
  return out;
}

/** A slow swell that fits the loop exactly (whole cycles per loop). */
const swell =
  (sec: number, cycles: readonly number[], depth: number) =>
  (t: number): number =>
    1 -
    depth +
    depth *
      (0.5 +
        (0.5 * cycles.reduce((a, c, k) => a + Math.sin((2 * Math.PI * c * t) / sec + k * 1.7), 0)) /
          cycles.length);

function chirp(r: () => number, f: number): Buf {
  const len = 0.06 + r() * 0.08;
  return shape(
    osc('sine', glide(f, f * (0.7 + r() * 0.8), len), len, AR),
    AR,
    ad(0.005, len / 3, len),
  );
}

/** One bird phrase: 2–5 chirps. */
function birdPhrase(r: () => number, base: number): Buf {
  const out = buf(1, AR);
  const n = 2 + Math.floor(r() * 4);
  for (let k = 0; k < n; k++)
    mix(out, chirp(r, base * (0.9 + r() * 0.4)), k * (0.09 + r() * 0.06), AR, 0.6);
  return out;
}

function croak(r: () => number): Buf {
  const len = 0.18;
  const x = osc('saw', () => 95 + r() * 20, len, AR);
  bandpass(x, AR, 600, 2);
  return shape(
    x,
    AR,
    (t) => (Math.floor(t * 60) % 2 === 0 ? 1 : 0.3) * Math.sin((Math.PI * t) / len),
  );
}

export function renderAmbience(biome: string): Buf {
  const r = rng(900 + MUSIC_BIOMES.indexOf(biome));
  const L = AMB_SEC;
  const out = buf(L, AR);
  const wind = (cutoff: number, amp: number, cycles: readonly number[]) => {
    mix(
      out,
      shape(
        bed(L, r, (x) => lowpass(lowpass(x, AR, cutoff), AR, cutoff)),
        AR,
        swell(L, cycles, 0.7),
      ),
      0,
      AR,
      amp,
    );
  };
  const birds = (n: number, base: number, amp: number) => {
    for (let k = 0; k < n; k++)
      mixLoop(out, birdPhrase(r, base * (0.8 + r() * 0.5)), r() * L, AR, amp * (0.4 + r() * 0.6));
  };
  const insects = (hz: number, amp: number, rate: number) => {
    const x = bed(L, r, (y) => bandpass(y, AR, hz, 6));
    mix(
      out,
      shape(x, AR, (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t)),
      0,
      AR,
      amp,
    );
  };
  switch (biome) {
    case 'karoo-autumn':
      wind(500, 1, [1, 2, 3]);
      birds(7, 2600, 0.12);
      break;
    case 'bushveld-winter':
      wind(380, 0.8, [1, 3]);
      insects(4200, 0.12, 30);
      birds(10, 2200, 0.14);
      break;
    case 'kalahari-summer':
      wind(700, 1.1, [1, 2, 4]);
      insects(5600, 0.2, 45);
      birds(3, 3000, 0.08);
      break;
    case 'okavango-spring': {
      // Water lapping: low swells; frogs; reed birds.
      mix(
        out,
        shape(
          bed(L, r, (x) => lowpass(bandpass(x, AR, 420, 0.7), AR, 900)),
          AR,
          swell(L, [5, 7, 11], 0.85),
        ),
        0,
        AR,
        1,
      );
      for (let k = 0; k < 18; k++) mixLoop(out, croak(r), r() * L, AR, 0.25 + r() * 0.2);
      birds(9, 2400, 0.12);
      break;
    }
    default:
      throw new Error(`no interim ambience for ${biome}`);
  }
  return normalise(out, 0.8);
}
