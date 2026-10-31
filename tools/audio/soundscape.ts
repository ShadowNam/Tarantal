// v1.9 (D-066) interim soundscape calls (sfx/amb_*): code-made stand-ins for field recordings of
// each area's birds, insects and weather, at the interim bar (D-035): recognisable rhythm, pitch
// contour and timbre of the real call, nothing quoted from any recording. Mono at 32 kHz (the
// calls sit below 8 kHz; it halves their lazy group). The pack tool normalises them like every
// effect; content/client/soundscape.json sets each call's level and distance in the game.
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
  shape,
  withReverb,
  type Buf,
} from './dsp';

export const SOUNDSCAPE_RATE = 32000;
const SR = SOUNDSCAPE_RATE;

/** A voiced tone: harmonics (ratio, amp) of `f(t)`, under envelope `env(t)`. */
function voiced(
  f: (t: number) => number,
  sec: number,
  harmonics: readonly (readonly [number, number])[],
  env: (t: number) => number,
): Buf {
  const x = buf(sec, SR);
  for (const [k, a] of harmonics)
    mix(
      x,
      osc('sine', (t) => f(t) * k, sec, SR),
      0,
      SR,
      a,
    );
  return shape(x, SR, env);
}

/** A smooth swell 0 → 1 → 0 over `sec` with attack share `a`. */
const swell =
  (sec: number, a = 0.2) =>
  (t: number): number => {
    if (t < 0 || t > sec) return 0;
    const u = t / sec;
    return u < a
      ? Math.sin(((u / a) * Math.PI) / 2)
      : Math.cos((((u - a) / (1 - a)) * Math.PI) / 2);
  };

/** Outdoor air: a little reverb and a soft top, then clean ends. */
function finish(x: Buf, wet = 0.18, size = 1.4): Buf {
  withReverb(x, SR, wet, size, 0.7);
  return fadeEnds(normalise(x, 0.85), SR, 0.003, 0.08);
}

/** Cape turtle dove: the hoarse three-note "work-HAR-der", said three times. */
function capeTurtleDove(): Buf {
  const out = buf(2.1, SR);
  const harm = [
    [1, 1],
    [2, 0.22],
    [3, 0.06],
  ] as const;
  let t = 0.05;
  for (let rep = 0; rep < 3; rep++) {
    const notes: [number, number, number, number][] = [
      // [len, f0, f1, amp]
      [0.11, 500, 480, 0.55],
      [0.26, 590, 520, 1],
      [0.13, 470, 455, 0.6],
    ];
    for (const [len, f0, f1, amp] of notes) {
      const n = voiced(glide(f0, f1, len), len, harm, swell(len, 0.25));
      // The hoarse purr of the stressed note.
      if (amp === 1) shape(n, SR, (u) => 0.75 + 0.25 * Math.sin(2 * Math.PI * 34 * u));
      mix(out, n, t, SR, amp);
      t += len + 0.03;
    }
    t += 0.12;
  }
  return finish(lowpass(out, SR, 2400));
}

/** Laughing dove: a soft, bubbling run of coos that rises and falls. */
function laughingDove(): Buf {
  const out = buf(2.1, SR);
  const pitches = [430, 455, 480, 500, 505, 490, 470, 445, 420];
  let t = 0.05;
  for (const [i, f] of pitches.entries()) {
    const len = i === pitches.length - 1 ? 0.22 : 0.12;
    const n = voiced(
      glide(f, f * 0.96, len),
      len,
      [
        [1, 1],
        [2, 0.12],
      ],
      swell(len, 0.35),
    );
    mix(out, n, t, SR, 0.55 + 0.45 * Math.sin((Math.PI * (i + 1)) / (pitches.length + 1)));
    t += len + 0.05;
  }
  return finish(lowpass(out, SR, 1800), 0.15);
}

/** Hadeda: a far flyover's loud nasal "haa-haa-haa-haaa", dropping as it passes. */
function hadeda(): Buf {
  const out = buf(2.6, SR);
  const notes: [number, number][] = [
    [0.3, 1],
    [0.3, 0.95],
    [0.32, 0.9],
    [0.55, 0.8],
  ];
  let t = 0.05;
  for (const [i, [len, amp]] of notes.entries()) {
    const f0 = 330 - i * 14;
    const n = osc('saw', glide(f0, f0 * 0.82, len), len, SR);
    bandpass(n, SR, 1250, 1.6);
    mix(n, bandpass(osc('saw', glide(f0, f0 * 0.82, len), len, SR), SR, 2600, 3), 0, SR, 0.35);
    shape(n, SR, swell(len, 0.12));
    mix(out, saturate(n, 1.6), t, SR, amp);
    t += len + 0.13;
  }
  return finish(out, 0.25, 1.8);
}

/** Cicada: a shrill pulsed buzz that rises in the heat, then cuts off. */
function cicada(): Buf {
  const sec = 3.7;
  const r = rng(7101);
  const x = bandpass(noise(sec, SR, r), SR, (t) => 4300 + 1400 * Math.min(1, t / 2.6), 9);
  const pulse = (t: number): number => 0.55 + 0.45 * Math.sin(2 * Math.PI * (180 + 40 * t) * t);
  shape(x, SR, (t) => {
    const rise = Math.min(1, (t / 2.8) ** 1.6);
    const cut = t > 3.1 ? Math.exp(-(t - 3.1) / 0.12) : 1;
    return pulse(t) * (0.08 + 0.92 * rise) * cut;
  });
  return fadeEnds(normalise(highpass(x, SR, 2500), 0.8), SR, 0.05, 0.05);
}

/** African fish eagle: the ringing "weee-ah", then "hyo-hyo-hyo". */
function fishEagle(): Buf {
  const out = buf(2.6, SR);
  const ring = [
    [1, 1],
    [2, 0.35],
    [3, 0.12],
  ] as const;
  // weee… (rising, held) …ah (falling)
  mix(out, voiced(glide(1250, 1650, 0.35), 0.38, ring, swell(0.38, 0.4)), 0.05, SR, 0.9);
  mix(out, voiced(glide(1550, 1050, 0.3), 0.32, ring, swell(0.32, 0.15)), 0.43, SR, 1);
  for (let k = 0; k < 4; k++)
    mix(
      out,
      voiced(glide(1450 - k * 40, 1050 - k * 30, 0.14), 0.16, ring, swell(0.16, 0.2)),
      0.95 + k * 0.24,
      SR,
      0.85 - k * 0.1,
    );
  // A wide river: more air on it.
  return finish(out, 0.32, 2);
}

/** Painted reed frogs: a chorus of tinkling, bell-like pings at dusk. */
function reedFrog(): Buf {
  const out = buf(1.9, SR);
  const r = rng(7202);
  for (let k = 0; k < 16; k++) {
    const f = 2600 + r() * 1100;
    const ping = voiced(
      () => f,
      0.12,
      [
        [1, 1],
        [2.7, 0.15],
      ],
      ad(0.002, 0.025),
    );
    mix(out, ping, 0.04 + r() * 1.6, SR, 0.4 + r() * 0.6);
  }
  return finish(out, 0.3, 1.2);
}

/** Hippo: a far-off wheezing grunt series, "huh-huh-huh-HUUUH". */
function hippo(): Buf {
  const out = buf(2.3, SR);
  const r = rng(7303);
  const pulses: [number, number, number][] = [
    [0.05, 0.16, 0.6],
    [0.32, 0.15, 0.7],
    [0.56, 0.14, 0.8],
    [0.78, 0.13, 0.85],
    [0.98, 0.7, 1],
  ];
  for (const [at, len, amp] of pulses) {
    const f0 = len > 0.5 ? 120 : 105;
    const tone = lowpass(osc('saw', glide(f0, f0 * 0.75, len), len, SR), SR, 520);
    mix(tone, lowpass(noise(len, SR, r), SR, 700), 0, SR, 0.45);
    mix(out, saturate(shape(tone, SR, swell(len, 0.2)), 2), at, SR, amp);
  }
  return finish(out, 0.25, 1.6);
}

/** A wind gust: a swelling rush of air with a faint whistle in the grass. */
function windGust(): Buf {
  const sec = 3.4;
  const r = rng(7404);
  const air = lowpass(
    lowpass(noise(sec, SR, r), SR, (t) => 300 + 700 * swell(sec, 0.45)(t)),
    SR,
    1200,
  );
  shape(air, SR, swell(sec, 0.45));
  const whistle = bandpass(noise(sec, SR, r), SR, (t) => 1500 + 500 * swell(sec, 0.5)(t), 14);
  shape(whistle, SR, (t) => swell(sec, 0.5)(t) ** 2);
  mix(air, whistle, 0, SR, 0.25);
  return fadeEnds(normalise(air, 0.8), SR, 0.1, 0.2);
}

/** A windpomp: the rod's two creaks (up and down stroke) and a soft clank of the head. */
function windpomp(): Buf {
  const out = buf(2.3, SR);
  const r = rng(7505);
  const creak = (f0: number, f1: number, len: number): Buf => {
    const x = osc(
      'saw',
      (t) => glide(f0, f1, len)(t) * (1 + 0.04 * Math.sin(2 * Math.PI * 23 * t)),
      len,
      SR,
    );
    bandpass(x, SR, (t) => glide(f0 * 2, f1 * 2, len)(t), 6);
    // The stick-slip of dry metal.
    shape(
      x,
      SR,
      (t) => swell(len, 0.3)(t) * (0.6 + 0.4 * (Math.sin(2 * Math.PI * 41 * t) > 0 ? 1 : 0)),
    );
    return x;
  };
  mix(out, creak(620, 760, 0.55), 0.05, SR, 0.9);
  mix(out, creak(780, 590, 0.6), 1.0, SR, 0.8);
  const clank = bandpass(noise(0.18, SR, r), SR, 1900, 8);
  shape(clank, SR, ad(0.001, 0.04));
  mix(out, clank, 1.65, SR, 0.6);
  return finish(out, 0.22, 1.5);
}

/** A sheep far off: a wavering "meeeh". */
function sheep(): Buf {
  const len = 1.1;
  const f = (t: number): number =>
    glide(310, 280, len)(t) * (1 + 0.035 * Math.sin(2 * Math.PI * 7 * t));
  const src = osc('saw', f, len, SR);
  const a = bandpass(src.slice(), SR, 720, 4);
  const b = bandpass(src.slice(), SR, 1850, 5);
  mix(a, b, 0, SR, 0.6);
  shape(a, SR, swell(len, 0.15));
  const out = buf(1.3, SR);
  mix(out, a, 0.05, SR, 1);
  return finish(out, 0.2, 1.5);
}

/** Barking geckos: dry clicking "tck-tck-tck" runs, a second one answering further off. */
function barkingGecko(): Buf {
  const out = buf(1.5, SR);
  const r = rng(7606);
  const click = (gain: number, hz: number, at: number): void => {
    const c = bandpass(noise(0.03, SR, r), SR, hz, 4);
    mix(
      c,
      shape(osc('sine', glide(hz * 0.6, hz * 0.4, 0.02), 0.03, SR), SR, ad(0.001, 0.006)),
      0,
      SR,
      0.5,
    );
    shape(c, SR, ad(0.0005, 0.007));
    mix(out, c, at, SR, gain);
  };
  for (let k = 0; k < 7; k++) click(1, 2400, 0.04 + k * 0.105);
  for (let k = 0; k < 5; k++) click(0.45, 2100, 0.86 + k * 0.11);
  return finish(out, 0.22, 1.3);
}

/** A korhaan: the rasping, frog-like "kraak-kraak" of a bustard in the grass. */
function korhaan(): Buf {
  const out = buf(1.7, SR);
  const croak = (at: number, len: number, amp: number): void => {
    const x = osc('saw', glide(230, 190, len), len, SR);
    bandpass(x, SR, 950, 2.2);
    shape(x, SR, (t) => swell(len, 0.15)(t) * (Math.sin(2 * Math.PI * 38 * t) > -0.2 ? 1 : 0.15));
    mix(out, saturate(x, 2.2), at, SR, amp);
  };
  croak(0.05, 0.36, 1);
  croak(0.55, 0.36, 0.95);
  croak(1.05, 0.42, 0.85);
  return finish(out, 0.2, 1.4);
}

/** A francolin at dawn: a harsh, accelerating "kwee-kwee-kwi-kwerrr". */
function francolin(): Buf {
  const out = buf(1.8, SR);
  let t = 0.05;
  const gaps = [0.2, 0.17, 0.14, 0.12, 0.11];
  for (let k = 0; k < 6; k++) {
    const last = k === 5;
    const len = last ? 0.38 : 0.12;
    const x = osc('saw', glide(1250 - k * 30, last ? 820 : 1000, len), len, SR);
    bandpass(x, SR, 1700, 2.5);
    // A rough edge (rasp) on every note, most on the last.
    shape(
      x,
      SR,
      (u) => swell(len, 0.2)(u) * (0.7 + 0.3 * Math.sin(2 * Math.PI * (last ? 55 : 80) * u)),
    );
    mix(out, saturate(x, 1.8), t, SR, 0.7 + k * 0.05);
    t += len + (gaps[k] ?? 0.1);
  }
  return finish(out, 0.22, 1.4);
}

/** A grey go-away-bird far off: the nasal, falling "kweh-h", twice. */
function goAwayBird(): Buf {
  const out = buf(1.4, SR);
  for (const [at, amp] of [
    [0.05, 1],
    [0.62, 0.85],
  ] as const) {
    const len = 0.45;
    const x = osc('saw', glide(640, 430, len), len, SR);
    bandpass(x, SR, 1300, 2);
    mix(x, bandpass(osc('saw', glide(640, 430, len), len, SR), SR, 2700, 4), 0, SR, 0.3);
    shape(x, SR, swell(len, 0.1));
    mix(out, saturate(x, 1.5), at, SR, amp);
  }
  return finish(out, 0.25, 1.6);
}

// --- v1.10 (D-067) Reënbui: the first summer storm and the flying ants -----------------------

/** Distant thunder rolling in: a soft crackle, then a low, rolling rumble that swells twice. */
function reenbuiThunder(): Buf {
  const sec = 4.6;
  const r = rng(8101);
  const rumble = lowpass(lowpass(noise(sec, SR, r), SR, 160), SR, 220);
  shape(rumble, SR, (t) => {
    const roll = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.9 * t + 1.2);
    return (
      roll * swell(sec, 0.22)(t) * (t < 2.2 ? 1 : 0.75 + 0.25 * swell(sec - 2.2, 0.3)(t - 2.2))
    );
  });
  const crack = bandpass(noise(0.9, SR, r), SR, 900, 1.2);
  shape(crack, SR, ad(0.02, 0.22, 0.9));
  const out = buf(sec, SR);
  mix(out, rumble, 0, SR, 1);
  mix(out, lowpass(crack, SR, 1800), 0.15, SR, 0.25);
  return finish(normalise(out, 0.85), 0.3, 2.2);
}

/** One fat drop: on the sinkdak (a short metallic tick with a ring) or on the dust (a soft pat). */
function drop(r: () => number, onRoof: boolean): Buf {
  const len = onRoof ? 0.22 : 0.12;
  const x = noise(len, SR, r);
  if (onRoof) {
    const f = 2600 + r() * 2400;
    bandpass(x, SR, f, 7);
    mix(x, bandpass(noise(len, SR, r), SR, 1150 + r() * 300, 18), 0, SR, 0.5);
    shape(x, SR, ad(0.001, 0.045, len));
  } else {
    lowpass(x, SR, 700 + r() * 500);
    shape(x, SR, ad(0.002, 0.03, len));
  }
  return x;
}

/** The first fat drops: a few, then more, on the iron roof and the dust. */
function reenbuiDrops(): Buf {
  const sec = 3.2;
  const r = rng(8202);
  const out = buf(sec, SR);
  for (let t = 0.05; t < sec - 0.25;) {
    mix(out, drop(r, r() < 0.55), t, SR, 0.6 + r() * 0.4);
    // Ever closer together: 0.45 s apart at first, 0.06 s at the end.
    t += 0.06 + 0.4 * (1 - t / sec) ** 2 * (0.6 + r() * 0.8);
  }
  return finish(normalise(out, 0.8), 0.12, 0.9);
}

/** The rain on a sinkdak and on the dust: a steady hiss full of ticks, in and out soft. */
function reenbuiRain(): Buf {
  const sec = 10.2;
  const r = rng(8303);
  const hiss = highpass(lowpass(noise(sec, SR, r), SR, 7000), SR, 900);
  const body = lowpass(noise(sec, SR, r), SR, 500);
  const out = buf(sec, SR);
  mix(out, hiss, 0, SR, 0.35);
  mix(out, body, 0, SR, 0.25);
  for (let t = 0; t < sec - 0.25; t += 0.012 + r() * 0.03)
    mix(out, drop(r, r() < 0.6), t, SR, 0.18 + r() * 0.22);
  shape(out, SR, (t) => Math.min(1, t / 1.4) * Math.min(1, (sec - t) / 2.2));
  return finish(normalise(out, 0.8), 0.15, 1.2);
}

/** The swarm's soft buzz: thousands of small wings, a warm drone with a flutter. */
function reenbuiBuzz(): Buf {
  const sec = 6.2;
  const r = rng(8404);
  const out = buf(sec, SR);
  for (let k = 0; k < 9; k++) {
    const f0 = 170 + r() * 110;
    const flutter = 18 + r() * 14;
    const ph = r() * Math.PI * 2;
    const x = osc('saw', (t) => f0 * (1 + 0.012 * Math.sin(2 * Math.PI * 0.7 * t + ph)), sec, SR);
    bandpass(x, SR, 520 + r() * 260, 1.4);
    shape(x, SR, (t) => 0.55 + 0.45 * Math.sin(2 * Math.PI * flutter * t + ph));
    mix(out, x, 0, SR, 0.12);
  }
  mix(out, bandpass(noise(sec, SR, r), SR, 2400, 2), 0, SR, 0.05);
  shape(out, SR, swell(sec, 0.25));
  return finish(normalise(out, 0.7), 0.1, 1);
}

/** Excited birds at the feast: guineafowl "kek-kek" chatter and quick small-bird chirps. */
function reenbuiBirds(): Buf {
  const sec = 2.6;
  const r = rng(8505);
  const out = buf(sec, SR);
  // Guineafowl chatter: harsh, rattling "kek" notes in quick runs.
  for (let t = 0.05; t < 1.9; t += 0.09 + r() * 0.07) {
    const len = 0.06;
    const x = osc('saw', glide(1100 + r() * 200, 900, len), len, SR);
    bandpass(x, SR, 1800, 2.5);
    shape(x, SR, ad(0.004, 0.025, len));
    mix(out, saturate(x, 2), t, SR, 0.55 + r() * 0.3);
  }
  // Small birds darting in: high, quick up-slurred chirps.
  for (let k = 0; k < 7; k++) {
    const at = 0.2 + r() * 2.1;
    const len = 0.07 + r() * 0.05;
    const f0 = 3200 + r() * 1400;
    mix(
      out,
      voiced(
        glide(f0, f0 * 1.35, len),
        len,
        [
          [1, 1],
          [2, 0.2],
        ],
        swell(len, 0.2),
      ),
      at,
      SR,
      0.35,
    );
  }
  return finish(normalise(out, 0.8), 0.2, 1.3);
}

const CALLS: Readonly<Record<string, () => Buf>> = {
  amb_cape_turtle_dove: capeTurtleDove,
  amb_laughing_dove: laughingDove,
  amb_hadeda: hadeda,
  amb_cicada: cicada,
  amb_fish_eagle: fishEagle,
  amb_reed_frog: reedFrog,
  amb_hippo: hippo,
  amb_wind_gust: windGust,
  amb_windpomp: windpomp,
  amb_sheep: sheep,
  amb_barking_gecko: barkingGecko,
  amb_korhaan: korhaan,
  amb_francolin: francolin,
  amb_go_away_bird: goAwayBird,
  amb_reenbui_thunder: reenbuiThunder,
  amb_reenbui_drops: reenbuiDrops,
  amb_reenbui_rain: reenbuiRain,
  amb_reenbui_buzz: reenbuiBuzz,
  amb_reenbui_birds: reenbuiBirds,
};

/** The interim soundscape calls (file names under audio/sfx/). */
export const SOUNDSCAPE_CALLS: readonly string[] = Object.keys(CALLS);

export function renderCall(id: string): Buf {
  const f = CALLS[id];
  if (f === undefined) throw new Error(`no interim soundscape call sfx/${id}`);
  return f();
}
