// v1.9 (D-066): the interim music stems with their Southern African parts — seamless loops (no
// click at the seam: the step across it is no bigger than the largest step inside the 10 ms on
// either side, and those 10 ms match in RMS within 12 dB, a downbeat starting the loop), and each
// stem within ±1 LU of the −16 LUFS music target under −1 dBTP after the pack's normalisation.
import { describe, expect, it } from 'vitest';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from '../assets/loudness';
import { LOUDNESS, TRUE_PEAK_CEILING_DB } from '../assets/targets';
import { MUSIC_BIOMES, MUSIC_RATE, renderStem, STEM_IDS } from './music';

const rms = (a: Float32Array): number => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

describe('interim music stems (D-066)', () => {
  for (const biome of MUSIC_BIOMES)
    it(`${biome}: seamless loops at −16 LUFS, ≤ −1 dBTP`, { timeout: 120_000 }, () => {
      for (const stem of STEM_IDS) {
        const x = renderStem(biome, stem);
        const n = x.length;
        const w = Math.round(0.01 * MUSIC_RATE);
        const first = x.subarray(0, w);
        const last = x.subarray(n - w);
        let inside = 0;
        for (let i = 1; i < w; i++)
          inside = Math.max(
            inside,
            Math.abs((first[i] ?? 0) - (first[i - 1] ?? 0)),
            Math.abs((last[i] ?? 0) - (last[i - 1] ?? 0)),
          );
        const seam = Math.abs((x[0] ?? 0) - (x[n - 1] ?? 0));
        expect(seam, `${stem} seam`).toBeLessThanOrEqual(inside);
        expect(Math.abs(20 * Math.log10(rms(first) / rms(last))), `${stem} RMS`).toBeLessThan(12);
        const pcm = { sampleRate: MUSIC_RATE, channels: [x] };
        const norm = applyGain(pcm, normaliseGainDb(pcm, LOUDNESS.music, TRUE_PEAK_CEILING_DB));
        expect(Math.abs(integratedLufs(norm) - LOUDNESS.music), `${stem} LUFS`).toBeLessThanOrEqual(
          1,
        );
        expect(truePeakDb(norm), `${stem} dBTP`).toBeLessThanOrEqual(TRUE_PEAK_CEILING_DB + 0.05);
      }
    });
});
