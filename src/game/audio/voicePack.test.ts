// v1.5 (D-041): Oupa's voice packs load only for the chosen voice language, after the first
// gesture, never with the voice off; every voiced key has a file in every voice language.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAssetIndex, type AssetIndex } from '../assets/assetIndex';
import type { FinalSound } from '../assets/AssetManifest';
import type { AudioDirector } from './AudioDirector';
import { MAX_ATTEMPTS, VoicePacks, voicePackEntries, type VoicePackState } from './voicePack';
import { voiceGroup, voicedLines, voiceLanguageOfGroup } from './voiceLines';
import { VOICE_LANGUAGES } from '../../i18n/i18n';
import { loadContent, loadFeel } from '../../../tools/testContent';

const root = join(import.meta.dirname, '..', '..', '..');
const LINES = voicedLines(loadFeel().barks, loadContent().biomes);
/** Voiced keys with no file in a voice language yet (none today). */
const GAPS: Readonly<Record<string, readonly string[]>> = {};

const entry = (group: string, name: string) => ({
  group,
  origin: 'interim' as const,
  kind: 'voice' as const,
  ogg: { path: `assets/${group}/${name}.ogg`, bytes: 10, hash: '0123456789ab' },
  mp3: { path: `assets/${group}/${name}.mp3`, bytes: 10, hash: '0123456789ab' },
  loop: false,
  lufs: -16,
  peakDb: -1,
});

function fakeIndex(): AssetIndex {
  const audio: AssetIndex['audio'] = {};
  for (const lang of VOICE_LANGUAGES)
    for (const l of ['bark.lekker', 'bark.kos_is_reg'])
      audio[`voice/${lang}/${l}`] = entry(voiceGroup(lang), `${lang}-${l}`);
  audio['sfx/shot'] = { ...entry('common', 'shot'), kind: 'sfx' };
  return {
    ...parseAssetIndex({
      version: 1,
      initialGroups: ['common'],
      images: {},
      layers: {},
      birds: {},
      audio: {},
    }).index,
    audio,
  };
}

function rig(fail: (path: string, n: number) => boolean = () => false) {
  let unlocked = false;
  const waiting: (() => void)[] = [];
  const added: FinalSound[] = [];
  const langs: string[] = [];
  const audio = {
    setVoiceLanguage: (l: string) => langs.push(l),
    onUnlocked: (fn: () => void) => {
      if (unlocked) fn();
      else waiting.push(fn);
    },
    fileFormat: () => 'ogg' as const,
    addRecorded: (f: readonly FinalSound[]) => added.push(...f),
  };
  const fetched: string[] = [];
  const states: [string, VoicePackState][] = [];
  const packs = new VoicePacks(audio as unknown as AudioDirector, fakeIndex(), {
    loadBytes: (p) => {
      fetched.push(p);
      const n = fetched.filter((x) => x === p).length;
      return Promise.resolve(fail(p, n) ? null : new ArrayBuffer(4));
    },
    onState: (l, s) => states.push([l, s]),
  });
  const unlock = (): void => {
    unlocked = true;
    for (const fn of waiting.splice(0)) fn();
  };
  return { packs, fetched, added, langs, states, unlock };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('voice packs (v1.5, D-041)', () => {
  it('fetches only the chosen language, and only after the first gesture', async () => {
    const r = rig();
    r.packs.use('af', true);
    await flush();
    expect(r.fetched).toEqual([]);
    r.unlock();
    await flush();
    expect(r.fetched.sort()).toEqual([
      'assets/voice-af/af-bark.kos_is_reg.ogg',
      'assets/voice-af/af-bark.lekker.ogg',
    ]);
    expect(r.added.map((f) => f.key).sort()).toEqual([
      'voice/af/bark.kos_is_reg',
      'voice/af/bark.lekker',
    ]);
    expect(r.states.at(-1)).toEqual(['af', 'ready']);
  });

  it('a language change fetches the new pack; the voice off fetches nothing', async () => {
    const r = rig();
    r.unlock();
    r.packs.use('en', false);
    await flush();
    expect(r.fetched).toEqual([]);
    expect(r.langs).toEqual(['en']);
    r.packs.use('de', true);
    await flush();
    expect(r.fetched.every((p) => p.startsWith('assets/voice-de/'))).toBe(true);
    r.packs.use('en', true);
    await flush();
    expect(r.fetched.filter((p) => p.startsWith('assets/voice-en/'))).toHaveLength(2);
    expect(r.fetched.some((p) => p.startsWith('assets/voice-af/'))).toBe(false);
  });

  it('a partial failure is not cached: a later bark retries only the failed file, bounded', async () => {
    // The lekker file fails twice, then loads.
    const r = rig((p, n) => p.includes('bark.lekker') && n <= 2);
    r.unlock();
    r.packs.use('af', true);
    await flush();
    expect(r.states.at(-1)).toEqual(['af', 'partial']);
    expect(r.packs.delivered).toBe(1);
    r.packs.retry();
    await flush();
    expect(r.states.at(-1)).toEqual(['af', 'partial']);
    r.packs.retry();
    await flush();
    expect(r.states.at(-1)).toEqual(['af', 'ready']);
    // Only the failed file was fetched again; the good one once.
    expect(r.fetched.filter((p) => p.includes('kos_is_reg'))).toHaveLength(1);
    expect(r.fetched.filter((p) => p.includes('lekker'))).toHaveLength(3);
    expect(r.added.map((f) => f.key).sort()).toEqual([
      'voice/af/bark.kos_is_reg',
      'voice/af/bark.lekker',
    ]);
  });

  it(`a file that keeps failing is fetched at most ${String(MAX_ATTEMPTS)} times`, async () => {
    const r = rig((p) => p.includes('bark.lekker'));
    r.unlock();
    r.packs.use('en', true);
    for (let i = 0; i < 10; i++) {
      await flush();
      r.packs.retry();
    }
    await flush();
    expect(r.fetched.filter((p) => p.includes('lekker'))).toHaveLength(MAX_ATTEMPTS);
    expect(r.states.at(-1)).toEqual(['en', 'partial']);
  });

  it('a voice language change forgets the old one: switching back fetches it again', async () => {
    const r = rig();
    r.unlock();
    r.packs.use('en', true);
    await flush();
    expect(r.packs.delivered).toBe(2);
    r.packs.use('de', true);
    // Nothing of en is tracked any more (and VoicePacks never keeps bytes).
    expect(r.packs.delivered).toBe(0);
    await flush();
    expect(r.packs.delivered).toBe(2);
    r.packs.use('en', true);
    await flush();
    expect(r.fetched.filter((p) => p.startsWith('assets/voice-en/'))).toHaveLength(4);
    // A language left while its fetch is in flight is dropped when it lands.
    r.packs.use('af', true);
    r.packs.use('de', true);
    await flush();
    expect(r.added.filter((f) => f.key.startsWith('voice/af/'))).toHaveLength(0);
  });

  it('a pack groups only its own language', () => {
    const ix = fakeIndex();
    for (const lang of VOICE_LANGUAGES) {
      const keys = voicePackEntries(ix, lang).map(([k]) => k);
      expect(keys.every((k) => k.startsWith(`voice/${lang}/`))).toBe(true);
      expect(voiceLanguageOfGroup(voiceGroup(lang))).toBe(lang);
    }
    expect(voiceLanguageOfGroup('common')).toBeNull();
  });

  it('every voiced key has a file in every voice language (art-source and the asset index)', () => {
    expect(LINES.length).toBe(44);
    expect(LINES).toContain('bark.weavers');
    const index = parseAssetIndex(
      JSON.parse(readFileSync(join(root, 'public', 'assets', 'asset-index.json'), 'utf8')),
    ).index;
    expect(index.initialGroups.some((g) => g.startsWith('voice-'))).toBe(false);
    const missing: string[] = [];
    for (const lang of VOICE_LANGUAGES)
      for (const key of LINES) {
        if (GAPS[lang]?.includes(key)) continue;
        const wav = join(root, 'art-source', 'audio', 'voice', lang, `${key}.wav`);
        const e = index.audio[`voice/${lang}/${key}`];
        if (!existsSync(wav) || e === undefined || e.group !== voiceGroup(lang))
          missing.push(`${lang} ${key}`);
      }
    expect(missing).toEqual([]);
  });
});
