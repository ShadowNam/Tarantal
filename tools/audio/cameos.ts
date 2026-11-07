// v1.13 (D-075, GDD §11.3g) interim sounds for the veld cameos, made in code (no recordings):
// - cameo_warthog_grunt: a warthog sow's soft grunting as the family trots — three short, low,
//   nasal grunts (a rough pulse at ~100 Hz through a closed, nasal mouth).
// - cameo_beetle_plop: a dung beetle tumbling off its ball — a tiny, soft, rising "plop".
// - cameo_tortoise_tok: a tortoise pulling into its shell — a dry, hollow "tok" of shell on ground.
// - cameo_ostrich_boom: a male ostrich's booming — a short "boo" then a long "boooom", ~60–100 Hz
//   with a hollow throat resonance and enough upper harmonics to carry on a phone speaker.
// - cameo_springbok_whistle: the springbok's alarm — a sharp whistling snort, "fwee", through the nose.
// - cameo_gemsbok_snort: a gemsbok's short alarm snort, the nostrils fluttering.
// - cameo_elephant_trumpet: a far herd's elephant trumpeting — a brassy, rough blare that rises
//   and falls, softened by distance and the open veld.
// Mono, 44.1 kHz; the pack tool normalises each to the effects loudness (art bible §10).
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

export const CAMEO_RATE = 44100;
const SR = CAMEO_RATE;

/** One nasal grunt: f0 its pitch, len its length (s). */
function grunt(r: () => number, f0: number, len: number): Buf {
  const jit = 0.94 + r() * 0.12;
  const pitch = (t: number): number => f0 * jit * (1.08 - (0.16 * t) / len);
  const v = buf(len, SR);
  mix(v, osc('saw', pitch, len, SR), 0, SR, 0.7);
  mix(
    v,
    osc('square', (t) => pitch(t) * 0.5, len, SR),
    0,
    SR,
    0.3,
  );
  mix(v, lowpass(noise(len, SR, r), SR, 900), 0, SR, 0.5);
  // A nasal tract: a low resonance and a narrow nasal one.
  const out = buf(len, SR);
  mix(out, bandpass(v.slice(), SR, 420, 2.2), 0, SR, 1);
  mix(out, bandpass(v.slice(), SR, 1150, 4), 0, SR, 0.45);
  mix(out, lowpass(v, SR, 260), 0, SR, 0.5);
  return shape(out, SR, (t) => Math.min(1, t / 0.012) * Math.sin((Math.PI * t) / len) ** 0.6);
}

function warthogGrunt(): Buf {
  const r = rng(81);
  const out = buf(0.82, SR);
  mix(out, grunt(r, 105, 0.13), 0.01, SR, 1);
  mix(out, grunt(r, 98, 0.11), 0.28, SR, 0.8);
  mix(out, grunt(r, 110, 0.15), 0.55, SR, 0.9);
  return fadeEnds(
    normalise(withReverb(highpass(out, SR, 60), SR, 0.08, 0.6, 0.5), 0.85),
    SR,
    0.002,
    0.04,
  );
}

function beetlePlop(): Buf {
  const r = rng(82);
  const len = 0.22;
  const out = buf(len, SR);
  // The bubble-ish "plop": a quick rising sine.
  const p = osc('sine', glide(320, 980, 0.05), 0.12, SR);
  shape(p, SR, ad(0.002, 0.03));
  mix(out, p, 0.005, SR, 0.8);
  // The soft thud of a tiny body on sand.
  const thud = osc('sine', glide(180, 90, 0.05), 0.08, SR);
  shape(thud, SR, ad(0.001, 0.02));
  mix(out, thud, 0, SR, 0.5);
  const sand = bandpass(noise(0.04, SR, r), SR, 3000, 1);
  shape(sand, SR, ad(0.001, 0.008));
  mix(out, sand, 0, SR, 0.12);
  return fadeEnds(normalise(withReverb(out, SR, 0.05, 0.3, 0.4), 0.7), SR, 0.001, 0.04);
}

function tortoiseTok(): Buf {
  const r = rng(83);
  const len = 0.3;
  const out = buf(len, SR);
  // A hollow shell: a struck, quickly-damped body.
  mix(
    out,
    bar(560, 0.2, SR, [
      [1, 1, 0.028],
      [2.27, 0.45, 0.016],
      [3.9, 0.2, 0.01],
    ]),
    0,
    SR,
    0.8,
  );
  // The dry knock on the ground.
  const knock = bandpass(noise(0.03, SR, r), SR, 2200, 1.5);
  shape(knock, SR, ad(0.0005, 0.005));
  mix(out, knock, 0, SR, 0.5);
  const thump = osc('sine', glide(150, 90, 0.04), 0.07, SR);
  shape(thump, SR, ad(0.001, 0.018));
  mix(out, thump, 0, SR, 0.4);
  // The shell scraping a little as it settles.
  const scrape = bandpass(noise(0.06, SR, r), SR, 1400, 2);
  shape(scrape, SR, (t) => Math.sin((Math.PI * t) / 0.06) * 0.5);
  mix(out, scrape, 0.05, SR, 0.15);
  return fadeEnds(normalise(withReverb(out, SR, 0.06, 0.4, 0.4), 0.85), SR, 0.0005, 0.05);
}

/** One ostrich hoot: a low pulse with upper harmonics through a hollow throat. */
function hoot(r: () => number, f0: number, f1: number, len: number): Buf {
  const pitch = glide(f0, f1, len);
  const v = buf(len, SR);
  mix(v, osc('sine', pitch, len, SR), 0, SR, 1);
  mix(
    v,
    osc('tri', (t) => pitch(t) * 2, len, SR),
    0,
    SR,
    0.35,
  );
  mix(v, osc('saw', pitch, len, SR), 0, SR, 0.18);
  // Saturating the voice gives the phone-speaker harmonics (200–900 Hz).
  saturate(v, 3);
  const breath = lowpass(noise(len, SR, r), SR, 500);
  mix(v, breath, 0, SR, 0.08);
  const out = buf(len, SR);
  mix(out, lowpass(v.slice(), SR, 180), 0, SR, 0.8);
  mix(out, bandpass(v.slice(), SR, 320, 2.5), 0, SR, 2.2);
  mix(out, bandpass(v, SR, 640, 3), 0, SR, 1.4);
  return shape(out, SR, (t) => Math.min(1, t / 0.06) * Math.min(1, (len - t) / (len * 0.4)));
}

function ostrichBoom(): Buf {
  const r = rng(84);
  const out = buf(1.42, SR);
  mix(out, hoot(r, 92, 84, 0.26), 0.02, SR, 0.75);
  mix(out, hoot(r, 88, 62, 0.95), 0.4, SR, 1);
  return fadeEnds(
    normalise(withReverb(highpass(lowpass(out, SR, 1600), SR, 35), SR, 0.15, 0.8, 0.55), 0.9),
    SR,
    0.003,
    0.08,
  );
}

function springbokWhistle(): Buf {
  const r = rng(85);
  const len = 0.48;
  const out = buf(len + 0.02, SR);
  // The nose's snort onset: a short breathy burst.
  const snort = bandpass(noise(0.07, SR, r), SR, 1500, 1.2);
  shape(snort, SR, ad(0.002, 0.02));
  mix(out, snort, 0, SR, 0.6);
  // The whistle: a narrow band of breath plus a thin tone, up then a little down.
  const pitch = (t: number): number =>
    t < 0.1 ? 2100 + (t / 0.1) * 1000 : glide(3100, 2600, len - 0.1)(t - 0.1);
  const tone = osc('sine', pitch, len, SR);
  const breath = bandpass(noise(len, SR, r), SR, pitch, 12);
  const w = buf(len, SR);
  mix(w, tone, 0, SR, 0.4);
  mix(w, breath, 0, SR, 2.2);
  mix(w, bandpass(noise(len, SR, r), SR, 4500, 1.5), 0, SR, 0.08);
  shape(w, SR, (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.2));
  mix(out, w, 0.02, SR, 1);
  return fadeEnds(normalise(withReverb(out, SR, 0.08, 0.6, 0.5), 0.85), SR, 0.001, 0.05);
}

function gemsbokSnort(): Buf {
  const r = rng(86);
  const len = 0.36;
  const n = noise(len, SR, r);
  const out = buf(len + 0.02, SR);
  const body = buf(len, SR);
  mix(body, bandpass(n.slice(), SR, glide(800, 520, len), 1.1), 0, SR, 1);
  mix(body, bandpass(n.slice(), SR, 1900, 2), 0, SR, 0.2);
  mix(body, lowpass(n, SR, 300), 0, SR, 0.6);
  // The nostrils fluttering (~28 Hz), loudest at the start.
  shape(
    body,
    SR,
    (t) =>
      Math.min(1, t / 0.006) *
      Math.exp(-t / 0.12) *
      (0.6 + 0.4 * Math.sin(2 * Math.PI * 28 * t) ** 2),
  );
  mix(out, body, 0, SR, 1);
  return fadeEnds(normalise(withReverb(out, SR, 0.1, 0.6, 0.5), 0.85), SR, 0.001, 0.05);
}

function elephantTrumpet(): Buf {
  const r = rng(87);
  const len = 1.75;
  // Up fast, held with a waver, then falling away.
  const contour = (t: number): number =>
    t < 0.25
      ? 330 + (t / 0.25) * 230
      : t < 1.0
        ? 560 + 18 * Math.sin(2 * Math.PI * 5.5 * t)
        : glide(560, 360, len - 1.0)(t - 1.0);
  const v = buf(len, SR);
  mix(v, osc('saw', contour, len, SR), 0, SR, 0.7);
  mix(
    v,
    osc('square', (t) => contour(t) * 0.5, len, SR),
    0,
    SR,
    0.18,
  );
  // Roughness: the trunk's rattle as a fast, irregular amplitude flutter.
  let a = 1;
  const flutter = new Float32Array(v.length);
  for (let i = 0; i < flutter.length; i++) {
    if (i % 400 === 0) a = 0.65 + r() * 0.35;
    flutter[i] = a;
  }
  lowpass(flutter, SR, 60);
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) * (flutter[i] ?? 1);
  mix(v, bandpass(noise(len, SR, r), SR, 1800, 0.8), 0, SR, 0.2);
  saturate(v, 1.8);
  // A brassy tract: three formants.
  const blare = buf(len, SR);
  mix(blare, bandpass(v.slice(), SR, 850, 2), 0, SR, 1);
  mix(blare, bandpass(v.slice(), SR, 1700, 2.5), 0, SR, 0.8);
  mix(blare, bandpass(v, SR, 2900, 3), 0, SR, 0.4);
  shape(blare, SR, (t) => Math.min(1, t / 0.08) * Math.min(1, (len - t) / 0.45));
  // Far away: the top end rolls off and the veld answers.
  const out = buf(2.15, SR);
  mix(out, lowpass(blare, SR, 3200), 0.02, SR, 1);
  return fadeEnds(
    normalise(withReverb(highpass(out, SR, 150), SR, 0.35, 1.2, 0.65), 0.85),
    SR,
    0.005,
    0.15,
  );
}

const CALLS: Readonly<Record<string, () => Buf>> = {
  cameo_warthog_grunt: warthogGrunt,
  cameo_beetle_plop: beetlePlop,
  cameo_tortoise_tok: tortoiseTok,
  cameo_ostrich_boom: ostrichBoom,
  cameo_springbok_whistle: springbokWhistle,
  cameo_gemsbok_snort: gemsbokSnort,
  cameo_elephant_trumpet: elephantTrumpet,
};

/** The veld cameos' sounds (`sfx/<id>`). */
export const CAMEO_CALLS: readonly string[] = Object.keys(CALLS);

export function renderCameo(id: string): Buf {
  const f = CALLS[id];
  if (f === undefined) throw new Error(`no interim cameo sound for sfx/${id}`);
  return f();
}
