// v1.1 interim sound effects (D-032): one code-made master per `sfx/<id>` key, built from the DSP
// kit (dsp.ts) to sound like the thing — a 12-gauge's crack and boom with an outdoor slap-back,
// the air rifle's pfft, the slingshot's rubber thwup, the guineafowl's harsh "kek" — not a beep.
// Mono, 44.1 kHz; the pack tool normalises each to −14 LUFS / −1 dBTP (art bible §10).
import {
  ad,
  bandpass,
  bar,
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

export const SFX_RATE = 44100;
const SR = SFX_RATE;

/** A gunshot: noise crack + low boom + body, then an outdoor slap-back echo and short tail. */
function gunshot(o: {
  seed: number;
  crack: number;
  boomHz: number;
  boom: number;
  bodyHz: number;
  tail: number;
  len: number;
  echo: number;
}): Buf {
  const r = rng(o.seed);
  const out = buf(o.len, SR);
  const crack = shape(highpass(noise(0.06, SR, r), SR, 1800), SR, ad(0.0005, 0.008));
  mix(out, crack, 0, SR, o.crack);
  const body = shape(
    lowpass(noise(0.5, SR, r), SR, (t) => o.bodyHz * Math.exp(-t * 9) + 180),
    SR,
    ad(0.001, 0.07),
  );
  mix(out, body, 0, SR, 1);
  const boom = shape(osc('sine', glide(o.boomHz, 38, 0.25), 0.5, SR), SR, ad(0.002, 0.09));
  mix(out, boom, 0, SR, o.boom);
  // Slap-back off the koppies, darker and later.
  const echo = lowpass(Float32Array.from(out.subarray(0, Math.round(0.3 * SR))), SR, 900);
  mix(out, echo, 0.22, SR, o.echo);
  withReverb(out, SR, o.tail, 1.4, 0.82);
  return fadeEnds(saturate(normalise(out), 1.6), SR, 0.0005, 0.08);
}

/** A short metallic or wooden click (hammer, latch, tick). */
function click(seed: number, hz: number, len = 0.03, q = 8): Buf {
  const r = rng(seed);
  const x = bandpass(noise(len, SR, r), SR, hz, q);
  return shape(x, SR, ad(0.0003, len / 4));
}

/** One guineafowl "kek": a harsh, nasal, slightly falling burst. */
function kekCall(seed: number, f0: number): Buf {
  const r = rng(seed);
  const len = 0.07;
  const x = osc('saw', glide(f0, f0 * 0.82, len), len, SR);
  const n = noise(len, SR, r);
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * 0.8 + (n[i] ?? 0) * 0.35;
  bandpass(x, SR, 1700, 2.2);
  return shape(saturate(x, 2), SR, ad(0.004, 0.025, len));
}

const SFX: Readonly<Record<string, () => Buf>> = {
  // --- guns -------------------------------------------------------------------------------
  shot: () =>
    gunshot({
      seed: 1,
      crack: 0.9,
      boomHz: 110,
      boom: 0.9,
      bodyHz: 3200,
      tail: 0.35,
      len: 1.1,
      echo: 0.28,
    }),
  shotPomp: () =>
    gunshot({
      seed: 2,
      crack: 1,
      boomHz: 125,
      boom: 0.8,
      bodyHz: 3800,
      tail: 0.3,
      len: 1,
      echo: 0.25,
    }),
  shotVoorlaaier: () => {
    // Black powder: a deep, rolling boom, crackle, and a long smoky tail.
    const x = gunshot({
      seed: 3,
      crack: 0.6,
      boomHz: 80,
      boom: 1.3,
      bodyHz: 1800,
      tail: 0.6,
      len: 1.8,
      echo: 0.4,
    });
    const r = rng(33);
    for (let k = 0; k < 14; k++)
      mix(x, click(300 + k, 900 + r() * 2000, 0.02, 3), 0.05 + r() * 0.5, SR, 0.25 * r());
    return normalise(x);
  },
  shotWindbuks: () => {
    // Spring-air rifle: a sharp pfft of air, the spring's low thunk and twang.
    const r = rng(4);
    const out = buf(0.4, SR);
    mix(
      out,
      shape(bandpass(noise(0.12, SR, r), SR, glide(4200, 1800, 0.1), 1.2), SR, ad(0.001, 0.025)),
      0,
      SR,
      1,
    );
    mix(out, shape(osc('sine', glide(160, 70, 0.08), 0.15, SR), SR, ad(0.001, 0.03)), 0, SR, 0.7);
    mix(
      out,
      shape(
        osc('tri', () => 620, 0.3, SR),
        SR,
        ad(0.002, 0.06),
      ),
      0.01,
      SR,
      0.12,
    );
    return fadeEnds(normalise(out), SR);
  },
  shotKettie: () => {
    // Slingshot: rubber bands snap forward (thwup) and slap the fork.
    const r = rng(5);
    const out = buf(0.35, SR);
    mix(
      out,
      shape(lowpass(osc('saw', glide(260, 90, 0.09), 0.12, SR), SR, 1400), SR, ad(0.002, 0.03)),
      0,
      SR,
      1,
    );
    mix(
      out,
      shape(bandpass(noise(0.05, SR, r), SR, 2400, 1.5), SR, ad(0.0005, 0.008)),
      0.018,
      SR,
      0.7,
    );
    mix(
      out,
      shape(bandpass(noise(0.2, SR, r), SR, glide(1200, 500, 0.2), 1), SR, ad(0.01, 0.05)),
      0.02,
      SR,
      0.25,
    );
    return fadeEnds(normalise(out), SR);
  },
  shotMielie: () => {
    // Mielie-Masjien: a compressed-air "pok" and a kernel rattle.
    const r = rng(6);
    const out = buf(0.2, SR);
    mix(out, shape(osc('sine', glide(420, 140, 0.05), 0.08, SR), SR, ad(0.001, 0.018)), 0, SR, 1);
    mix(out, shape(bandpass(noise(0.08, SR, r), SR, 1600, 1.4), SR, ad(0.0008, 0.015)), 0, SR, 0.6);
    mix(out, click(61, 3200, 0.02, 6), 0.03, SR, 0.3);
    return fadeEnds(normalise(out), SR);
  },
  click: () => {
    // Dry fire: the hammer falls on an empty chamber.
    const out = buf(0.15, SR);
    mix(out, click(7, 3500, 0.02, 10), 0, SR, 1);
    mix(out, click(8, 1400, 0.04, 6), 0.006, SR, 0.6);
    return fadeEnds(normalise(out), SR);
  },
  shell: () => {
    // A shell pushed into the chamber: plastic slide, brass seat.
    const r = rng(9);
    const out = buf(0.3, SR);
    mix(
      out,
      shape(
        bandpass(noise(0.12, SR, r), SR, 2600, 1.2),
        SR,
        (t) => Math.min(1, t / 0.08) * (t < 0.1 ? 1 : 0),
      ),
      0,
      SR,
      0.35,
    );
    mix(out, click(10, 2200, 0.04, 9), 0.11, SR, 1);
    mix(out, click(11, 900, 0.05, 5), 0.112, SR, 0.5);
    return fadeEnds(normalise(out), SR);
  },
  rackPomp: () => {
    // Pump action: ka-chunk, back and forward.
    const r = rng(12);
    const out = buf(0.45, SR);
    for (const [at, hz] of [
      [0, 1500],
      [0.16, 1100],
    ] as const) {
      mix(out, shape(bandpass(noise(0.08, SR, r), SR, 2200, 1), SR, ad(0.002, 0.02)), at, SR, 0.5);
      mix(out, click(13 + at * 100, hz, 0.05, 7), at + 0.04, SR, 1);
    }
    return fadeEnds(normalise(out), SR);
  },
  cockWindbuks: () => {
    // Break-barrel: the barrel breaks (clack), the spring compresses, a pellet goes in, it locks.
    const r = rng(14);
    const out = buf(0.5, SR);
    mix(out, click(15, 1300, 0.05, 6), 0, SR, 1);
    mix(
      out,
      shape(bandpass(noise(0.18, SR, r), SR, glide(500, 1400, 0.18), 3), SR, (t) =>
        t < 0.18 ? 0.6 : 0,
      ),
      0.06,
      SR,
      0.5,
    );
    mix(out, click(16, 4200, 0.015, 12), 0.28, SR, 0.4);
    mix(out, click(17, 1600, 0.05, 6), 0.38, SR, 1);
    return fadeEnds(normalise(out), SR);
  },
  shotTweeTwee: () =>
    // v1.3: a .22 rimfire — a sharp, small crack with little boom and a short slap-back.
    gunshot({
      seed: 21,
      crack: 1.1,
      boomHz: 150,
      boom: 0.25,
      bodyHz: 3600,
      tail: 0.18,
      len: 0.7,
      echo: 0.18,
    }),
  shotLangloop: () =>
    // v1.4: a full-bore rifle — a hard supersonic crack, a deep boom, and a long echo rolling
    // back off the far ridge (it carries to every flock).
    gunshot({
      seed: 31,
      crack: 1.4,
      boomHz: 70,
      boom: 0.85,
      bodyHz: 2400,
      tail: 0.55,
      len: 1.6,
      echo: 0.42,
    }),
  bolt: () => {
    // v1.3: the bolt worked: lift (clack), draw back (slide), push home, turn down (lock).
    const r = rng(22);
    const out = buf(0.42, SR);
    mix(out, click(23, 1500, 0.04, 6), 0, SR, 0.9);
    mix(out, shape(bandpass(noise(0.07, SR, r), SR, 2600, 2), SR, ad(0.004, 0.03)), 0.05, SR, 0.4);
    mix(out, click(24, 3400, 0.02, 10), 0.13, SR, 0.5);
    mix(out, shape(bandpass(noise(0.06, SR, r), SR, 2200, 2), SR, ad(0.004, 0.025)), 0.2, SR, 0.4);
    mix(out, click(25, 1300, 0.05, 6), 0.3, SR, 1);
    return fadeEnds(normalise(out), SR);
  },
  ramrod: () => {
    // Muzzle-loader: ramrod scrapes down the barrel twice, taps home.
    const r = rng(18);
    const out = buf(1, SR);
    for (const at of [0, 0.36]) {
      mix(
        out,
        shape(bandpass(noise(0.3, SR, r), SR, glide(2400, 900, 0.3), 2), SR, (t) =>
          Math.sin(Math.PI * Math.min(1, t / 0.3)),
        ),
        at,
        SR,
        0.6,
      );
      mix(out, click(19 + at * 10, 700, 0.06, 4), at + 0.28, SR, 1);
    }
    mix(out, click(21, 2600, 0.03, 10), 0.8, SR, 0.5);
    return fadeEnds(normalise(out), SR);
  },
  // --- birds and hits ---------------------------------------------------------------------
  poof: () => {
    const r = rng(22);
    const x = shape(
      bandpass(noise(0.35, SR, r), SR, glide(700, 2600, 0.25), 1.1),
      SR,
      ad(0.015, 0.08),
    );
    return fadeEnds(normalise(x), SR);
  },
  kek: () => {
    const out = buf(0.35, SR);
    for (let k = 0; k < 3; k++) mix(out, kekCall(23 + k, 1250 + k * 30), k * 0.095, SR, 1);
    return fadeEnds(normalise(withReverb(out, SR, 0.15, 0.8)), SR);
  },
  kekAlarm: () => {
    // The whole flock at once: overlapping, jittered keks from several birds.
    const r = rng(26);
    const out = buf(0.9, SR);
    for (let k = 0; k < 16; k++)
      mix(out, kekCall(27 + k, 1100 + r() * 400), r() * 0.7, SR, 0.5 + r() * 0.5);
    return fadeEnds(normalise(withReverb(out, SR, 0.2, 0.9)), SR);
  },
  kwe: () => {
    // Grey go-away bird: a nasal, falling "kweh … kweh".
    const out = buf(0.75, SR);
    for (const at of [0, 0.36]) {
      const x = osc('saw', glide(780, 470, 0.26), 0.28, SR);
      bandpass(x, SR, 1100, 1.6);
      mix(out, shape(x, SR, ad(0.02, 0.09, 0.28)), at, SR, 1);
    }
    return fadeEnds(normalise(withReverb(out, SR, 0.2, 1)), SR);
  },
  clang: () => {
    // A cast-iron potjie hit: inharmonic partials ringing out.
    const x = bar(420, 1, SR, [
      [1, 1, 0.35],
      [2.32, 0.6, 0.25],
      [4.25, 0.4, 0.15],
      [6.63, 0.25, 0.08],
    ]);
    mix(x, click(31, 3000, 0.02, 4), 0, SR, 0.6);
    return fadeEnds(normalise(x), SR);
  },
  ting: () =>
    fadeEnds(
      normalise(
        bar(2100, 0.45, SR, [
          [1, 1, 0.14],
          [2.76, 0.4, 0.07],
          [5.4, 0.2, 0.03],
        ]),
      ),
      SR,
    ),
  splash: () => {
    const r = rng(32);
    const out = buf(0.9, SR);
    mix(
      out,
      shape(
        lowpass(noise(0.8, SR, r), SR, (t) => 3500 * Math.exp(-t * 3) + 300),
        SR,
        ad(0.01, 0.18),
      ),
      0,
      SR,
      1,
    );
    for (let k = 0; k < 10; k++) {
      const f = 500 + r() * 900;
      mix(
        out,
        shape(osc('sine', glide(f, f * 1.8, 0.05), 0.06, SR), SR, ad(0.002, 0.015)),
        0.08 + r() * 0.5,
        SR,
        0.25,
      );
    }
    return fadeEnds(normalise(out), SR);
  },
  whoosh: () => {
    const r = rng(34);
    const x = bandpass(
      noise(1.1, SR, r),
      SR,
      (t) => 300 + 1100 * Math.sin(Math.PI * Math.min(1, t / 1.1)),
      1.2,
    );
    return fadeEnds(normalise(shape(x, SR, (t) => Math.sin(Math.PI * Math.min(1, t / 1.1)))), SR);
  },
  crate: () => {
    // A wooden crate cracks open: splintering knock and a board clatter.
    const r = rng(35);
    const out = buf(0.4, SR);
    mix(
      out,
      bar(190, 0.3, SR, [
        [1, 1, 0.05],
        [2.7, 0.5, 0.03],
        [5.1, 0.3, 0.02],
      ]),
      0,
      SR,
      1,
    );
    mix(out, shape(bandpass(noise(0.2, SR, r), SR, 2000, 0.9), SR, ad(0.001, 0.03)), 0, SR, 0.7);
    mix(
      out,
      bar(260, 0.2, SR, [
        [1, 1, 0.04],
        [3.1, 0.4, 0.02],
      ]),
      0.12,
      SR,
      0.5,
    );
    return fadeEnds(normalise(out), SR);
  },
  scratch: () => {
    // Penalty: a record scratch (back-forth pitched noise).
    const r = rng(36);
    const x = bandpass(noise(0.35, SR, r), SR, (t) => 600 + 1600 * Math.abs(Math.sin(t * 18)), 4);
    mix(
      x,
      shape(
        osc('saw', (t) => 180 + 220 * Math.abs(Math.sin(t * 18)), 0.35, SR),
        SR,
        ad(0.005, 0.12),
      ),
      0,
      SR,
      0.3,
    );
    return fadeEnds(normalise(shape(x, SR, ad(0.005, 0.12))), SR);
  },
  vuvuzela: () => {
    // The B♭ horn: a buzzy saw with lip vibrato through a brassy formant.
    const x = osc('saw', (t) => 233 * (1 + 0.012 * Math.sin(t * 2 * Math.PI * 5.5)), 1, SR);
    bandpass(x, SR, 900, 0.8);
    saturate(x, 2.5);
    return fadeEnds(
      normalise(
        shape(x, SR, (t) => Math.min(1, t / 0.06) * (t > 0.85 ? Math.max(0, (1 - t) / 0.15) : 1)),
      ),
      SR,
    );
  },
  alarm: () => {
    // The bakkie's alarm: two-tone siren through a small horn.
    const x = osc('square', (t) => (Math.floor(t / 0.2) % 2 === 0 ? 880 : 660), 1.7, SR);
    bandpass(x, SR, 1200, 1.2);
    return fadeEnds(normalise(x), SR);
  },
  stampede: () => {
    // Hundreds of feet: random low thumps over a rumble (music bus).
    const r = rng(37);
    const out = buf(1.6, SR);
    mix(
      out,
      shape(lowpass(noise(1.6, SR, r), SR, 160), SR, (t) => Math.min(1, t / 0.3)),
      0,
      SR,
      1.2,
    );
    for (let k = 0; k < 40; k++)
      mix(
        out,
        shape(osc('sine', glide(90 + r() * 40, 45, 0.06), 0.1, SR), SR, ad(0.002, 0.03)),
        r() * 1.5,
        SR,
        0.4,
      );
    return fadeEnds(normalise(out), SR);
  },
  stamp: () => {
    // Whole-flock rubber stamp: a felt thud and a small bell.
    const out = buf(0.6, SR);
    mix(out, shape(osc('sine', glide(140, 50, 0.12), 0.2, SR), SR, ad(0.002, 0.05)), 0, SR, 1);
    mix(
      out,
      bar(1320, 0.5, SR, [
        [1, 1, 0.15],
        [2.76, 0.3, 0.06],
      ]),
      0.1,
      SR,
      0.3,
    );
    return fadeEnds(normalise(out), SR);
  },
  thud: () =>
    fadeEnds(normalise(shape(osc('sine', glide(110, 45, 0.15), 0.3, SR), SR, ad(0.002, 0.07))), SR),
  tick: () => fadeEnds(normalise(click(38, 2800, 0.025, 9)), SR),
  // --- stingers (music bus) ---------------------------------------------------------------
  sting: () => marimbaRun([67, 71, 74, 79], 0.07, 0.6),
  secret: () => marimbaRun([72, 76, 79, 84, 88], 0.08, 0.8),
  powerup: () => marimbaRun([76, 81, 88], 0.06, 0.45),
  // --- 24 Oct update (D-037): the Skietbaan's hit sounds (group "range", lazy) -------------
  range_thwack: () => {
    // A pellet through stiff card on a wooden frame: a papery snap and a dull knock.
    const out = buf(0.22, SR);
    mix(out, click(41, 2400, 0.03, 2), 0, SR, 0.9);
    mix(
      out,
      shape(osc('sine', glide(190, 120, 0.08), 0.12, SR), SR, ad(0.002, 0.03)),
      0.004,
      SR,
      0.7,
    );
    return fadeEnds(normalise(out), SR);
  },
  range_ding: () => {
    // A steel gong plate: a bright strike over long inharmonic partials.
    const x = bar(880, 1.4, SR, [
      [1, 1, 0.5],
      [2.41, 0.55, 0.32],
      [3.93, 0.35, 0.2],
      [5.4, 0.2, 0.12],
    ]);
    mix(x, click(42, 4200, 0.015, 3), 0, SR, 0.5);
    return fadeEnds(normalise(x), SR);
  },
  range_hit: () => {
    // A pellet on feathers: a soft thump with a puff.
    const r = rng(43);
    const out = buf(0.2, SR);
    mix(out, shape(osc('sine', glide(150, 70, 0.08), 0.12, SR), SR, ad(0.002, 0.035)), 0, SR, 0.9);
    mix(
      out,
      shape(bandpass(noise(0.15, SR, r), SR, 1500, 1.4), SR, ad(0.004, 0.04)),
      0.005,
      SR,
      0.5,
    );
    return fadeEnds(normalise(out), SR);
  },
};

/** A quick marimba arpeggio (stingers). */
function marimbaRun(notes: readonly number[], step: number, len: number): Buf {
  const out = buf(len, SR);
  notes.forEach((m, k) => {
    const f = 440 * 2 ** ((m - 69) / 12);
    mix(
      out,
      bar(f, 0.4, SR, [
        [1, 1, 0.12],
        [3.9, 0.3, 0.04],
        [9.2, 0.1, 0.015],
      ]),
      k * step,
      SR,
      1,
    );
  });
  return fadeEnds(normalise(withReverb(out, SR, 0.25, 0.9)), SR);
}

export const INTERIM_SFX: readonly string[] = Object.keys(SFX);

export function renderSfx(id: string): Buf {
  const f = SFX[id];
  if (f === undefined) throw new Error(`no interim sound for sfx/${id}`);
  return f();
}
