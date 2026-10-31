// v1.1 interim music and ambience (D-032): per biome, three music stems (calm / build / stampede)
// of the same length and tempo — 8 bars at 120 bpm, 16 s, seamless loops — that the MusicMixer
// crossfades by intensity, plus one ambience bed (16 s loop). Each biome has its own instrument
// and key (Karoo: fingerpicked guitar in D; Bushveld: marimba in G; Kalahari: kalimba in A minor
// pentatonic; Okavango: guitar and marimba in F). Mono at 32 kHz to keep each biome's lazy chunk
// small (Tech §15); the pack tool normalises music to −16 and ambience to −20 LUFS.
// v1.9 (D-066, art bible §10): Southern African instrument parts in the same keys and tempo — a
// pennywhistle lead (the kwela voice) over an mbira (thumb-piano) ostinato in the calm stem, a
// marimba line joining in the build, hand drums (a djembe/ngoma-style groove) on top of the
// brushed snare in the Stampede. Each area has its own colour (`Colour`): Okavango and Bushveld
// marimba-forward, Kalahari and Namibië sparse drum-and-mbira (hand drums from the build on),
// Karoo mostly kwela with a light marimba. All original material: phrases are built from each
// area's chords with its own seed, no tune quoted.
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
/** v1.9 (D-066): how loud each Southern African part is in an area (0 = none). */
interface Colour {
  /** The pennywhistle lead (calm: every other phrase; build and Stampede: all). */
  readonly whistle: number;
  /** The mbira ostinato (calm full, build lighter, Stampede lighter still). */
  readonly mbira: number;
  /** The marimba line (build and Stampede). */
  readonly marimba: number;
  /** The hand drums (Stampede; from the build on where `drumsInBuild`). */
  readonly drums: number;
  readonly drumsInBuild: boolean;
  /** The arpeggio lead's level under the new parts (it was 0.5–0.65). */
  readonly lead: number;
  /** The shaker's level (noise is the costliest thing to encode: Karoo's is thinned). */
  readonly shaker: number;
}
interface Style {
  readonly root: number;
  /** Four chords (scale-degree semitone sets from the root), two bars each. */
  readonly chords: readonly (readonly number[])[];
  readonly lead: Lead;
  readonly seed: number;
  readonly colour: Colour;
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
    colour: {
      whistle: 0.42,
      mbira: 0.14,
      marimba: 0.16,
      drums: 0.22,
      drumsInBuild: false,
      lead: 0.42,
      shaker: 0.6,
    },
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
    colour: {
      whistle: 0.36,
      mbira: 0.24,
      marimba: 0.34,
      drums: 0.36,
      drumsInBuild: false,
      lead: 0.4,
      shaker: 1,
    },
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
    colour: {
      whistle: 0.3,
      mbira: 0.34,
      marimba: 0.12,
      drums: 0.42,
      drumsInBuild: true,
      lead: 0.36,
      shaker: 0.8,
    },
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
    colour: {
      whistle: 0.36,
      mbira: 0.22,
      marimba: 0.34,
      drums: 0.36,
      drumsInBuild: false,
      lead: 0.38,
      shaker: 1,
    },
  },
  // v1.4 B (D-039): i – iv – VII – i in D minor, slow kalimba over the open pan.
  namibie: {
    root: 50,
    chords: [
      [0, 3, 7],
      [5, 8, 12],
      [-2, 2, 5],
      [0, 3, 7],
    ],
    lead: 'kalimba',
    seed: 505,
    colour: {
      whistle: 0.28,
      mbira: 0.34,
      marimba: 0.1,
      drums: 0.4,
      drumsInBuild: true,
      lead: 0.34,
      shaker: 0.7,
    },
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

// --- v1.9 (D-066) Southern African voices --------------------------------------------------

/** Mbira (thumb piano): a struck tine's inharmonic partials and the bottle-cap buzz. */
function mbiraNote(m: number, r: () => number): Buf {
  const x = bar(mtof(m), 1.1, SR, [
    [1, 1, 0.42],
    [3.03, 0.2, 0.06],
    [6.4, 0.06, 0.02],
  ]);
  const buzz = shape(bandpass(noise(0.18, SR, r), SR, 3000, 2.5), SR, ad(0.001, 0.05));
  mix(x, buzz, 0, SR, 0.05);
  return x;
}

/** Marimba: the struck wooden bar (as the Bushveld lead). */
const marimbaNote = (m: number, len = 0.9): Buf =>
  bar(mtof(m), len, SR, [
    [1, 1, 0.26],
    [3.93, 0.3, 0.05],
    [9.2, 0.06, 0.015],
  ]);

/** Pennywhistle: a breathy, slightly sharp-attack tin whistle with a kwela flick up into the
 *  note and a vibrato that blooms on long notes. */
function whistleNote(m: number, len: number, r: () => number, flick: boolean): Buf {
  const f0 = mtof(m);
  const sec = len + 0.06;
  const f = (t: number): number =>
    f0 *
    (1 + 0.006 * Math.min(1, t / 0.3) * Math.sin(2 * Math.PI * 5.6 * t)) *
    (flick && t < 0.05 ? 2 ** (-(1 - t / 0.05) / 12) : 1);
  const x = osc('sine', f, sec, SR);
  mix(
    x,
    osc('sine', (t) => f(t) * 2, sec, SR),
    0,
    SR,
    0.07,
  );
  mix(x, bandpass(noise(sec, SR, r), SR, f0, 6), 0, SR, 0.5);
  return shape(x, SR, (t) =>
    t < 0.015 ? t / 0.015 : t > len ? Math.max(0, 1 - (t - len) / 0.06) : 1 - 0.15 * (t / len),
  );
}

/** Hand drum (djembe / ngoma): the open bass, the tone at the rim, the slap. */
function handDrum(kind: 'bass' | 'tone' | 'slap', r: () => number): Buf {
  if (kind === 'bass') {
    const x = shape(osc('sine', glide(96, 58, 0.14), 0.32, SR), SR, ad(0.002, 0.11));
    mix(x, shape(lowpass(noise(0.05, SR, r), SR, 400), SR, ad(0.001, 0.012)), 0, SR, 0.5);
    return x;
  }
  if (kind === 'tone') {
    const x = shape(osc('sine', glide(250, 205, 0.05), 0.2, SR), SR, ad(0.001, 0.06));
    mix(x, shape(bandpass(noise(0.05, SR, r), SR, 900, 1.5), SR, ad(0.001, 0.015)), 0, SR, 0.35);
    return x;
  }
  const x = shape(bandpass(noise(0.08, SR, r), SR, 2500, 1.2), SR, ad(0.0005, 0.022));
  mix(
    x,
    shape(
      osc('sine', () => 390, 0.05, SR),
      SR,
      ad(0.001, 0.015),
    ),
    0,
    SR,
    0.4,
  );
  return x;
}

/** Major or minor pentatonic over the root, from the first chord's third. */
const pentatonic = (chords: Style['chords']): readonly number[] =>
  chords[0]?.includes(3) === true ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];

/** Whistle phrase rhythms over one chord (two bars = 8 beats): [start, length] in beats. */
const PHRASES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0, 1],
    [1, 0.5],
    [1.5, 0.5],
    [2, 1],
    [3.5, 0.5],
    [4, 1.5],
    [6, 1],
    [7, 0.75],
  ],
  [
    [0, 0.5],
    [0.5, 0.5],
    [1, 1],
    [2.5, 0.5],
    [3, 1],
    [4, 0.5],
    [4.5, 0.5],
    [5, 1],
    [6.5, 1.25],
  ],
  [
    [0, 1.5],
    [1.5, 0.5],
    [2, 0.5],
    [2.5, 1.5],
    [4, 1],
    [5, 1],
    [6, 1.75],
  ],
];

/** The pennywhistle, mbira, marimba and hand-drum parts of one stem (mixed into `out`). */
function localParts(out: Buf, s: Style, stem: StemId): void {
  const c = s.colour;
  const r = rng(s.seed * 31 + 1009 + STEM_IDS.indexOf(stem));
  const scale = pentatonic(s.chords);
  const fast = stem === 'stampede';
  // Melody RNG apart from the rest: the same tune in every stem of an area.
  const tune = rng(s.seed * 17 + 77);
  const phraseOf = s.chords.map(() => PHRASES[Math.floor(tune() * PHRASES.length)] ?? []);
  for (let ci = 0; ci < s.chords.length; ci++) {
    const chord = s.chords[ci] ?? [0, 4, 7];
    const t0 = ci * 8 * BEAT;
    // Pennywhistle: a stepwise pentatonic line that starts and ends on chord tones.
    if (c.whistle > 0 && (stem !== 'calm' || ci % 2 === 1)) {
      const notes = phraseOf[ci] ?? [];
      let deg = scale.indexOf((chord[ci % 2 === 0 ? 2 : 1] ?? 0) % 12);
      if (deg < 0) deg = 2;
      let oct = 0;
      notes.forEach(([at, len], k) => {
        if (k === notes.length - 1) deg = Math.max(0, scale.indexOf((chord[0] ?? 0) % 12));
        const m = s.root + 24 + 12 * oct + (scale[deg] ?? 0);
        mixLoop(
          out,
          whistleNote(m, len * BEAT * 0.92, r, k === 0 || len >= 1),
          t0 + at * BEAT,
          SR,
          c.whistle,
        );
        const step = Math.floor(tune() * 5) - 2;
        deg += step === 0 ? 1 : step;
        while (deg < 0) {
          deg += scale.length;
          oct--;
        }
        while (deg >= scale.length) {
          deg -= scale.length;
          oct++;
        }
        oct = Math.max(-1, Math.min(0, oct));
      });
    }
    for (let b = 0; b < 2; b++) {
      const tb = t0 + b * 4 * BEAT;
      // Mbira: two interlocking lines on the eighths — the low one on the beat, the high one off.
      const mb = stem === 'calm' ? c.mbira : stem === 'build' ? c.mbira * 0.7 : c.mbira * 0.45;
      if (mb > 0)
        for (let k = 0; k < 8; k++) {
          const low = k % 2 === 0;
          const tone = low ? (chord[(k / 2) % 2 === 0 ? 0 : 2] ?? 0) : (chord[(k + b) % 3] ?? 0);
          mixLoop(
            out,
            mbiraNote(s.root + (low ? 12 : 24) + tone, r),
            tb + k * (BEAT / 2),
            SR,
            mb * (low ? 0.9 : 0.7),
          );
        }
      // Marimba: a 3-3-2 line on the eighths, up the chord in the first bar, down in the second.
      if (c.marimba > 0 && stem !== 'calm')
        [0, 3, 6].forEach((k, i) => {
          const tones = b === 0 ? [chord[0], chord[1], chord[2]] : [chord[2], chord[1], chord[0]];
          mixLoop(
            out,
            marimbaNote(s.root + 12 + (tones[i] ?? 0) + (fast && i === 2 ? 12 : 0)),
            tb + k * (BEAT / 2),
            SR,
            c.marimba,
          );
        });
      // Hand drums: a 16-step ngoma-style groove over the kit (bass, tones, slaps).
      if (c.drums > 0 && (fast || (stem === 'build' && c.drumsInBuild))) {
        const lvl = fast ? c.drums : c.drums * 0.6;
        const groove: readonly (readonly [number, 'bass' | 'tone' | 'slap'])[] = fast
          ? [
              [0, 'bass'],
              [2, 'slap'],
              [3, 'tone'],
              [4, 'tone'],
              [6, 'bass'],
              [7, 'slap'],
              [10, 'slap'],
              [11, 'tone'],
              [12, 'tone'],
              [14, 'slap'],
              [15, 'slap'],
            ]
          : [
              [0, 'bass'],
              [3, 'tone'],
              [6, 'bass'],
              [10, 'slap'],
              [12, 'tone'],
            ];
        for (const [step, kind] of groove)
          mixLoop(
            out,
            handDrum(kind, r),
            tb + step * (BEAT / 4) + (r() - 0.5) * 0.006,
            SR,
            lvl * (kind === 'slap' ? 0.7 : 1),
          );
      }
    }
  }
}

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
        // v1.9: under the new parts (the same draw, so the rest of the stem is unchanged).
        (0.5 + r() * 0.15) * (s.colour.lead / 0.55),
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
          (fast ? 0.22 : 0.16) * s.colour.shaker,
        );
      if (fast && beat === 3) mixLoop(out, drum(r, 180), at + BEAT / 2, SR, 0.4);
    }
  }
  // v1.9 (D-066): the pennywhistle, mbira, marimba and hand drums.
  localParts(out, s, stem);
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
    case 'namibie':
      // The open pan: a wide, thin wind, a few larks far off, a faint dry-grass rustle.
      wind(620, 0.9, [1, 2]);
      insects(6200, 0.07, 22);
      birds(4, 3400, 0.07);
      break;
    default:
      throw new Error(`no interim ambience for ${biome}`);
  }
  return normalise(out, 0.8);
}
