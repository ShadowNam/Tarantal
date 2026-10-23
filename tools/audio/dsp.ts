// v1.1 interim audio (D-032): a tiny, deterministic DSP kit for code-made sound effects, music
// stems and ambience beds. Mono Float32 buffers; seeded noise (same input → same samples → same
// encoded bytes and hashes). No dependencies. The pack tool normalises loudness afterwards
// (art bible §10), so levels here only need to be sane.

export type Buf = Float32Array;

/** mulberry32: small seeded PRNG in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const buf = (sec: number, sr: number): Buf =>
  new Float32Array(Math.max(1, Math.ceil(sec * sr)));

/** Mixes `src` into `dst` at `atSec`, scaled by `gain`. Out-of-range samples are dropped. */
export function mix(dst: Buf, src: Buf, atSec: number, sr: number, gain = 1): void {
  const o = Math.round(atSec * sr);
  for (let i = 0; i < src.length; i++) {
    const j = o + i;
    if (j >= 0 && j < dst.length) dst[j] = (dst[j] ?? 0) + (src[i] ?? 0) * gain;
  }
}

/** Mixes `src` into a loop of `dst`'s length: what runs past the end wraps to the start. */
export function mixLoop(dst: Buf, src: Buf, atSec: number, sr: number, gain = 1): void {
  const o = Math.round(atSec * sr);
  const n = dst.length;
  for (let i = 0; i < src.length; i++) {
    const j = (((o + i) % n) + n) % n;
    dst[j] = (dst[j] ?? 0) + (src[i] ?? 0) * gain;
  }
}

/** Multiplies by an envelope function of time (s). */
export function shape(x: Buf, sr: number, f: (t: number) => number): Buf {
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * f(i / sr);
  return x;
}

/** Attack (linear) then exponential decay with time constant `tau`, cut at `len` (s). */
export const ad =
  (attack: number, tau: number, len = Infinity) =>
  (t: number): number => {
    if (t > len) return 0;
    if (t < attack) return t / Math.max(1e-6, attack);
    return Math.exp(-(t - attack) / tau);
  };

export function noise(sec: number, sr: number, r: () => number): Buf {
  const x = buf(sec, sr);
  for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  return x;
}

export type Wave = 'sine' | 'saw' | 'square' | 'tri';

/** An oscillator whose frequency follows `freq(t)` (Hz). */
export function osc(wave: Wave, freq: (t: number) => number, sec: number, sr: number): Buf {
  const x = buf(sec, sr);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    ph += freq(i / sr) / sr;
    ph -= Math.floor(ph);
    x[i] =
      wave === 'sine'
        ? Math.sin(ph * 2 * Math.PI)
        : wave === 'saw'
          ? ph * 2 - 1
          : wave === 'square'
            ? ph < 0.5
              ? 1
              : -1
            : 1 - 4 * Math.abs(ph - 0.5);
  }
  return x;
}

/** Exponential glide from f0 to f1 over `sec`. */
export const glide =
  (f0: number, f1: number, sec: number) =>
  (t: number): number =>
    f0 * (f1 / f0) ** Math.min(1, t / sec);

/** One-pole low-pass at `fc(t)` Hz. */
export function lowpass(x: Buf, sr: number, fc: number | ((t: number) => number)): Buf {
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const f = typeof fc === 'number' ? fc : fc(i / sr);
    const a = 1 - Math.exp((-2 * Math.PI * f) / sr);
    y += a * ((x[i] ?? 0) - y);
    x[i] = y;
  }
  return x;
}

/** One-pole high-pass. */
export function highpass(x: Buf, sr: number, fc: number): Buf {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let prevX = 0;
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] ?? 0;
    y = a * (y + v - prevX);
    prevX = v;
    x[i] = y;
  }
  return x;
}

/** RBJ band-pass (constant peak gain) at `fc(t)` with quality `q`; coefficients every 16 samples. */
export function bandpass(x: Buf, sr: number, fc: number | ((t: number) => number), q: number): Buf {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let b0 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 16 === 0) {
      const f = Math.min(sr * 0.45, typeof fc === 'number' ? fc : fc(i / sr));
      const w = (2 * Math.PI * f) / sr;
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0;
      b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w)) / a0;
      a2 = (1 - alpha) / a0;
    }
    const v = x[i] ?? 0;
    const y = b0 * v + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Karplus-Strong plucked string (guitar, banjo, kalimba-ish with high damping). */
export function pluck(
  freq: number,
  sec: number,
  sr: number,
  r: () => number,
  damp = 0.996,
  bright = 0.5,
): Buf {
  const n = Math.max(2, Math.round(sr / freq));
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = r() * 2 - 1;
  // Soften the excitation (a pick vs a thumb).
  for (let k = 0; k < 3 - Math.round(bright * 2); k++)
    for (let i = 1; i < n; i++) line[i] = ((line[i] ?? 0) + (line[i - 1] ?? 0)) / 2;
  const x = buf(sec, sr);
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = line[p] ?? 0;
    const b = line[(p + 1) % n] ?? 0;
    x[i] = a;
    line[p] = ((a + b) / 2) * damp;
    p = (p + 1) % n;
  }
  return shape(x, sr, ad(0.002, sec / 2.5));
}

/** Struck bar (marimba, kalimba): a few decaying sine partials. */
export function bar(
  freq: number,
  sec: number,
  sr: number,
  partials: readonly [number, number, number][],
): Buf {
  const x = buf(sec, sr);
  for (const [ratio, amp, tau] of partials) {
    const p = shape(
      osc('sine', () => freq * ratio, sec, sr),
      sr,
      ad(0.003, tau),
    );
    mix(x, p, 0, sr, amp);
  }
  return x;
}

/** Schroeder reverb (4 combs + 2 all-passes), wet only. `size` scales the delays. */
export function reverb(x: Buf, sr: number, size = 1, decay = 0.8): Buf {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round((d * size * sr) / 44100));
  const out = new Float32Array(x.length);
  for (const d of combs) {
    const line = new Float32Array(d);
    let p = 0;
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const y = line[p] ?? 0;
      lp = y * 0.6 + lp * 0.4;
      line[p] = (x[i] ?? 0) + lp * decay;
      p = (p + 1) % d;
      out[i] = (out[i] ?? 0) + y / combs.length;
    }
  }
  for (const d0 of [225, 556]) {
    const d = Math.round((d0 * size * sr) / 44100);
    const line = new Float32Array(d);
    let p = 0;
    for (let i = 0; i < out.length; i++) {
      const bufv = line[p] ?? 0;
      const v = out[i] ?? 0;
      const y = -v + bufv;
      line[p] = v + bufv * 0.5;
      out[i] = y;
      p = (p + 1) % d;
    }
  }
  return out;
}

/** Adds a reverb of itself at `wet`. Lengthen `x` first if the tail should ring out. */
export function withReverb(x: Buf, sr: number, wet: number, size = 1, decay = 0.8): Buf {
  const r = reverb(x, sr, size, decay);
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) + (r[i] ?? 0) * wet;
  return x;
}

/** Gentle tanh saturation. */
export function saturate(x: Buf, drive: number): Buf {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh((x[i] ?? 0) * drive) / Math.tanh(drive);
  return x;
}

export function scale(x: Buf, g: number): Buf {
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * g;
  return x;
}

/** Peak-normalises to `peak` (the pack tool sets the real loudness later). */
export function normalise(x: Buf, peak = 0.9): Buf {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m > 0 ? scale(x, peak / m) : x;
}

/** Short fades at both ends (no clicks on one-shots). */
export function fadeEnds(x: Buf, sr: number, inSec = 0.002, outSec = 0.02): Buf {
  const a = Math.round(inSec * sr);
  const b = Math.round(outSec * sr);
  for (let i = 0; i < a && i < x.length; i++) x[i] = (x[i] ?? 0) * (i / a);
  for (let i = 0; i < b && i < x.length; i++) {
    const j = x.length - 1 - i;
    x[j] = (x[j] ?? 0) * (i / b);
  }
  return x;
}

/** Equal-tempered note frequency: midi 69 = A4. */
export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
