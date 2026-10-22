// Loudness for the audio pipeline (M10, art bible §10, Tech §10): integrated loudness per
// ITU-R BS.1770-4 (K-weighting, 400 ms blocks with 75 % overlap, −70 LUFS absolute and −10 LU
// relative gates) and true peak (4× oversampled), plus the gain that meets a target. Pure.
import type { Pcm } from './wav';

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * The two K-weighting stages for a sample rate, designed as in libebur128 (bilinear transform with
 * pre-warping). At 48 kHz they equal the BS.1770-4 table coefficients.
 */
function kWeighting(fs: number): readonly [Biquad, Biquad] {
  // Stage 1: high shelf, +4 dB above ~1.7 kHz (head acoustics).
  const f1 = 1681.974450955533;
  const g1 = 3.999843853973347;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f1) / fs);
  const vh = 10 ** (g1 / 20);
  const vb = vh ** 0.4996667741545416;
  const d1 = 1 + k1 / q1 + k1 * k1;
  const shelf: Biquad = {
    b0: (vh + (vb * k1) / q1 + k1 * k1) / d1,
    b1: (2 * (k1 * k1 - vh)) / d1,
    b2: (vh - (vb * k1) / q1 + k1 * k1) / d1,
    a1: (2 * (k1 * k1 - 1)) / d1,
    a2: (1 - k1 / q1 + k1 * k1) / d1,
  };
  // Stage 2: high pass at ~38 Hz (RLB weighting).
  const f2 = 38.13547087602444;
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f2) / fs);
  const d2 = 1 + k2 / q2 + k2 * k2;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k2 * k2 - 1)) / d2,
    a2: (1 - k2 / q2 + k2 * k2) / d2,
  };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] ?? 0;
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    y[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return y;
}

const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;
const lufsOf = (meanSquare: number): number => -0.691 + 10 * Math.log10(meanSquare);

/** Integrated loudness in LUFS (−Infinity for silence). Sounds under 400 ms are one block. */
export function integratedLufs(pcm: Pcm): number {
  const [shelf, hp] = kWeighting(pcm.sampleRate);
  const weighted = pcm.channels.map((ch) => filter(filter(ch, shelf), hp));
  const n = weighted[0]?.length ?? 0;
  const block = Math.round(0.4 * pcm.sampleRate);
  const step = Math.round(0.1 * pcm.sampleRate);
  const blocks: number[] = [];
  const power = (from: number, to: number): number => {
    let sum = 0;
    // Left/right/centre weight 1 (BS.1770); surround channels aren't used here.
    for (const ch of weighted) for (let i = from; i < to; i++) sum += (ch[i] ?? 0) ** 2;
    return sum / Math.max(1, to - from);
  };
  if (n < block) blocks.push(power(0, n));
  else for (let at = 0; at + block <= n; at += step) blocks.push(power(at, at + block));
  const loud = blocks.filter((z) => z > 0 && lufsOf(z) > ABSOLUTE_GATE);
  if (loud.length === 0) return -Infinity;
  const mean = (zs: readonly number[]): number => zs.reduce((a, z) => a + z, 0) / zs.length;
  const gate = lufsOf(mean(loud)) + RELATIVE_GATE;
  const kept = loud.filter((z) => lufsOf(z) > gate);
  return lufsOf(mean(kept.length > 0 ? kept : loud));
}

/** True peak in dBTP: the sample peak of a 4× Catmull-Rom oversampling (close to BS.1770 Annex 2). */
export function truePeakDb(pcm: Pcm): number {
  let peak = 0;
  for (const ch of pcm.channels) {
    for (let i = 0; i < ch.length; i++) {
      const p0 = ch[i - 1] ?? ch[i] ?? 0;
      const p1 = ch[i] ?? 0;
      const p2 = ch[i + 1] ?? p1;
      const p3 = ch[i + 2] ?? p2;
      peak = Math.max(peak, Math.abs(p1));
      for (const t of [0.25, 0.5, 0.75]) {
        const v =
          0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
        peak = Math.max(peak, Math.abs(v));
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * Gain in dB that brings a sound to `targetLufs`, lowered if needed so its true peak stays at or
 * under `ceilingDb`. Silence gets 0.
 */
export function normaliseGainDb(pcm: Pcm, targetLufs: number, ceilingDb: number): number {
  const lufs = integratedLufs(pcm);
  if (!Number.isFinite(lufs)) return 0;
  const peak = truePeakDb(pcm);
  return Math.min(targetLufs - lufs, ceilingDb - peak);
}

export function applyGain(pcm: Pcm, gainDb: number): Pcm {
  const k = 10 ** (gainDb / 20);
  return { sampleRate: pcm.sampleRate, channels: pcm.channels.map((ch) => ch.map((v) => v * k)) };
}
