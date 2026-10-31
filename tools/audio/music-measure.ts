// v1.9 (D-066) helper: renders every interim music stem and prints its encoded size (Ogg / MP3 at
// the pack's music quality), loudness after the pack's normalisation and true peak — the numbers
// the size and mix rules are checked against. `npx tsx tools/audio/music-measure.ts [biome]`
import { encodeMp3, encodeOgg } from '../assets/encode';
import { applyGain, integratedLufs, normaliseGainDb, truePeakDb } from '../assets/loudness';
import { LOUDNESS, TRUE_PEAK_CEILING_DB } from '../assets/targets';
import { MUSIC_BIOMES, MUSIC_RATE, renderStem, STEM_IDS } from './music';

const only = process.argv[2];
let total = 0;
for (const b of MUSIC_BIOMES) {
  if (only !== undefined && b !== only) continue;
  let biome = 0;
  for (const s of STEM_IDS) {
    const pcm = { sampleRate: MUSIC_RATE, channels: [renderStem(b, s)] };
    const norm = applyGain(pcm, normaliseGainDb(pcm, LOUDNESS.music, TRUE_PEAK_CEILING_DB));
    const ogg = (await encodeOgg(norm, 'music')).length;
    const mp3 = (await encodeMp3(norm, 'music')).length;
    biome += ogg + mp3;
    console.log(
      `${b.padEnd(16)} ${s.padEnd(9)} ogg ${(ogg / 1024).toFixed(1).padStart(6)} KB  mp3 ${(mp3 / 1024).toFixed(1).padStart(6)} KB  ${integratedLufs(norm).toFixed(1)} LUFS  ${truePeakDb(norm).toFixed(1)} dBTP`,
    );
  }
  total += biome;
  console.log(`${b.padEnd(16)} total ${(biome / 1024).toFixed(1)} KB`);
}
console.log(`all ${(total / 1024).toFixed(1)} KB`);
