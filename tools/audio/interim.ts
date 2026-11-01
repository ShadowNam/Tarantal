// `npm run audio:interim` (v1.1, D-032): writes the interim (code-made) sound effects, music stems
// and ambience beds into art-source/audio/ exactly like a sound designer's delivery (docs/06 §5),
// each WAV with a `<name>.json` sidecar `{ "origin": "interim" }`. Then run `npm run assets:pack`.
// A WAV without an interim sidecar is a human delivery and is never overwritten: delete it and
// its sidecar to go back to the interim one, or drop a recording in to replace it.
//   --only sfx|music|ambience|soundscape|braai   one part
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeWav } from '../assets/wav';
import { INTERIM_SFX, renderSfx, SFX_RATE } from './sfx';
import { AMB_RATE, MUSIC_BIOMES, MUSIC_RATE, renderAmbience, renderStem, STEM_IDS } from './music';
import { renderCall, SOUNDSCAPE_CALLS, SOUNDSCAPE_RATE } from './soundscape';
import { BRAAI_CALLS, BRAAI_RATE, renderBraai } from './braai';
import type { Buf } from './dsp';

const root = join(import.meta.dirname, '..', '..');
const audio = join(root, 'art-source', 'audio');
const i = process.argv.indexOf('--only');
const only = i >= 0 ? process.argv[i + 1] : undefined;
const wants = (part: string): boolean => only === undefined || only === part;

/** True when the WAV may be (re)written: absent, or an earlier interim one. */
function ours(wav: string): boolean {
  if (!existsSync(wav)) return true;
  const side = wav.replace(/\.wav$/, '.json');
  if (!existsSync(side)) return false;
  try {
    return (JSON.parse(readFileSync(side, 'utf8')) as { origin?: string }).origin === 'interim';
  } catch {
    return false;
  }
}

let n = 0;
function put(rel: string, x: Buf, rate: number): void {
  const wav = join(audio, rel);
  if (!ours(wav)) {
    console.warn(`skip audio/${rel}: a human delivery is there`);
    return;
  }
  mkdirSync(dirname(wav), { recursive: true });
  writeFileSync(wav, writeWav({ sampleRate: rate, channels: [x] }));
  writeFileSync(wav.replace(/\.wav$/, '.json'), '{ "origin": "interim" }\n');
  console.log(`audio/${rel}  ${(x.length / rate).toFixed(2)} s`);
  n++;
}

const t0 = Date.now();
if (wants('sfx')) for (const id of INTERIM_SFX) put(`sfx/${id}.wav`, renderSfx(id), SFX_RATE);
// v1.9 (D-066): the soundscape's one-shot calls (sfx/amb_*, lazy group `soundscape`).
if (wants('soundscape'))
  for (const id of SOUNDSCAPE_CALLS) put(`sfx/${id}.wav`, renderCall(id), SOUNDSCAPE_RATE);
// v1.11 (D-068): the braai's bed, guitar, nightjar and vastrap sting (sfx/braai_*, group `braai`).
if (wants('braai')) for (const id of BRAAI_CALLS) put(`sfx/${id}.wav`, renderBraai(id), BRAAI_RATE);
if (wants('music'))
  for (const b of MUSIC_BIOMES)
    for (const s of STEM_IDS) put(`music/${b}/${s}.wav`, renderStem(b, s), MUSIC_RATE);
if (wants('ambience'))
  for (const b of MUSIC_BIOMES) put(`ambience/${b}.wav`, renderAmbience(b), AMB_RATE);
console.log(`audio:interim — ${n} files in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
