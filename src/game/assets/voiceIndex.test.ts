// v1.8b (D-062): the voice half of the asset index — the pack tool moves every voice pack's entry
// (Oupa's and the special days') out of the first download's index; merged back, nothing is lost;
// the voice packs fetch it on their first load and then load the language's lines from it.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseAssetIndex } from './assetIndex';
import { isVoiceGroup, mergeVoiceIndex, parseVoiceIndex, splitVoiceIndex } from './voiceIndex';
import { VoicePacks } from '../audio/voicePack';
import type { AudioDirector } from '../audio/AudioDirector';
import type { FinalSound } from './AssetManifest';

const root = join(import.meta.dirname, '..', '..', '..');
const read = (p: string): unknown => JSON.parse(readFileSync(join(root, 'public', p), 'utf8'));

describe('voice index (D-062)', () => {
  it('the first download index has no voice entry; the voice half has them all', () => {
    const { index, error } = parseAssetIndex(read('assets/asset-index.json'));
    expect(error).toBeNull();
    expect(Object.values(index.audio).some((e) => isVoiceGroup(e.group))).toBe(false);
    const voice = parseVoiceIndex(read('assets/asset-index-voice.json'));
    expect(voice).not.toBeNull();
    const keys = Object.keys(voice?.audio ?? {});
    expect(keys.length).toBeGreaterThan(100);
    expect(keys).toContain('voice/en/guide.baboon.raid_hat');
    expect(Object.values(voice?.audio ?? {}).every((e) => isVoiceGroup(e.group))).toBe(true);
  });

  it('split and merge are inverse', () => {
    const { index } = parseAssetIndex(read('assets/asset-index.json'));
    const voice = parseVoiceIndex(read('assets/asset-index-voice.json'));
    if (voice === null) throw new Error('no voice index');
    const full = mergeVoiceIndex(index, voice);
    const again = splitVoiceIndex(full);
    expect(Object.keys(again.index.audio).sort()).toEqual(Object.keys(index.audio).sort());
    expect(Object.keys(again.voice.audio).sort()).toEqual(Object.keys(voice.audio).sort());
  });

  it('a voice pack fetches the voice half once, then its lines', async () => {
    const { index } = parseAssetIndex(read('assets/asset-index.json'));
    const voice = parseVoiceIndex(read('assets/asset-index-voice.json'));
    let asked = 0;
    const added: FinalSound[] = [];
    const audio = {
      setVoiceLanguage: () => undefined,
      onUnlocked: (fn: () => void) => {
        fn();
      },
      fileFormat: () => 'ogg' as const,
      addRecorded: (f: readonly FinalSound[]) => added.push(...f),
    };
    const packs = new VoicePacks(audio as unknown as AudioDirector, index, {
      loadBytes: () => Promise.resolve(new ArrayBuffer(4)),
      voiceIndex: () => {
        asked++;
        return Promise.resolve(voice);
      },
    });
    packs.use('en', true);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(asked).toBe(1);
    expect(added.some((f) => f.key === 'voice/en/guide.baboon.bagged')).toBe(true);
    expect(added.every((f) => f.key.startsWith('voice/en/'))).toBe(true);
  });

  it('an index without any audio (none delivered) loads no voice at all', async () => {
    const { index } = parseAssetIndex(read('assets/asset-index.json'));
    let asked = 0;
    const added: FinalSound[] = [];
    const audio = {
      setVoiceLanguage: () => undefined,
      onUnlocked: (fn: () => void) => {
        fn();
      },
      fileFormat: () => 'ogg' as const,
      addRecorded: (f: readonly FinalSound[]) => added.push(...f),
    };
    const packs = new VoicePacks(
      audio as unknown as AudioDirector,
      { ...index, audio: {} },
      {
        loadBytes: () => Promise.resolve(new ArrayBuffer(4)),
        voiceIndex: () => {
          asked++;
          return Promise.resolve(parseVoiceIndex(read('assets/asset-index-voice.json')));
        },
      },
    );
    packs.use('en', true);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(asked).toBe(0);
    expect(added).toEqual([]);
  });
});
