// `npm run audio:voice` (v1.5, D-041): Oupa's interim voice packs, one per voice language, made
// offline with open-source text-to-speech (tools/audio/voice_tts.py; engines, licences and setup
// in docs/06 §5 and D-041). Writes art-source/audio/voice/<lang>/<bark key>.wav, each with a
// `{ "origin": "interim", "source": … }` sidecar, exactly like a voice actor's delivery; then run
// `npm run assets:pack`. A WAV without an interim sidecar is a human recording and is never
// overwritten (delete it and its sidecar to go back to the interim line).
//   --lang en|af|de     one language      --only bark.x,bark.y   some lines
//   --batch 12          lines per Python process
//   TTS_PYTHON=<venv>/bin/python   the Python with the TTS packages (default: python3)
//   TTS_MODELS=<dir>               where the models are downloaded (default: tmp/tts-models)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { voicedLines } from '../../src/game/audio/voiceLines';
import { VOICE_LANGUAGES, type VoiceLanguage } from '../../src/i18n/i18n';
import { loadContent, loadFeel } from '../testContent';

const root = join(import.meta.dirname, '..', '..');
const out = join(root, 'art-source', 'audio', 'voice');
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const langs = (arg('--lang')?.split(',') ?? [...VOICE_LANGUAGES]) as VoiceLanguage[];
const only = arg('--only')?.split(',');

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

const lines = voicedLines(
  loadFeel().barks,
  loadContent().biomes,
  loadContent().birds.meerkats,
  loadContent().feesdae.specials.map((f) => f.barks),
).filter((l) => only === undefined || only.includes(l));
const jobs: { lang: string; key: string; text: string; out: string }[] = [];
for (const lang of langs) {
  if (!(VOICE_LANGUAGES as readonly string[]).includes(lang)) throw new Error(`no voice ${lang}`);
  const table = JSON.parse(
    readFileSync(join(root, 'src', 'i18n', `${lang}.json`), 'utf8'),
  ) as Record<string, string>;
  for (const key of lines) {
    const text = table[key];
    if (text === undefined) throw new Error(`${lang}.json has no ${key}`);
    const wav = join(out, lang, `${key}.wav`);
    if (!ours(wav)) {
      console.warn(`skip audio/voice/${lang}/${key}.wav: a human recording is there`);
      continue;
    }
    jobs.push({ lang, key, text, out: wav });
  }
}
const tmp = join(root, 'tmp');
mkdirSync(tmp, { recursive: true });
// One Python process per batch: the German model's memory grows line by line, and a whole
// language in one process has been killed on a busy box.
const batch = Number(arg('--batch') ?? '12');
const t0 = Date.now();
for (let at = 0; at < jobs.length; at += batch) {
  const jobsFile = join(tmp, 'voice-jobs.json');
  writeFileSync(jobsFile, JSON.stringify(jobs.slice(at, at + batch), null, 2));
  const r = spawnSync(
    process.env['TTS_PYTHON'] ?? 'python3',
    [
      join(import.meta.dirname, 'voice_tts.py'),
      jobsFile,
      join(import.meta.dirname, 'voice.config.json'),
      process.env['TTS_MODELS'] ?? join(tmp, 'tts-models'),
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log(`audio:voice — ${jobs.length} lines in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
