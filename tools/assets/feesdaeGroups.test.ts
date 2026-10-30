// D-064: each special's files are a lazy group of their own — a Halloween hunt never downloads
// Christmas's art, sounds or lines, and the other way round. Halloween keeps its first keys
// ("feesdae", "feesdae-voice-<lang>"); Christmas's are "feesdae-christmas" and
// "feesdae-voice-christmas-<lang>". Checked in the catalog and in the packed asset index.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { specialLinesOf } from '../../src/game/audio/barks';
import { specialVoiceGroup } from '../../src/game/audio/voiceLines';
import {
  CHRISTMAS_GROUP,
  CHRISTMAS_SHEET,
  XMAS_SOUNDS,
} from '../../src/game/feesdae/christmasAssets';
import { FEESDAE_GROUP, HALLOWEEN_SHEET, SPOOK_SOUNDS } from '../../src/game/feesdae/feesdaeAssets';
import { specialAssetGroup } from '../../src/game/feesdae/feesdaeGroups';
import { VOICE_LANGUAGES } from '../../src/i18n/i18n';
import { loadContent } from '../testContent';
import { buildCatalog } from './catalog';
import { readFullIndex } from './fullIndex';

const content = loadContent();
const root = join(import.meta.dirname, '..', '..');

describe('the special days split their lazy groups (D-064)', () => {
  it('maps each special to its own group; Halloween keeps its first key', () => {
    expect(specialAssetGroup('halloween')).toBe(FEESDAE_GROUP);
    expect(specialAssetGroup('christmas')).toBe(CHRISTMAS_GROUP);
    expect(specialVoiceGroup('en', 'halloween')).toBe('feesdae-voice-en');
    expect(specialVoiceGroup('af', 'christmas')).toBe('feesdae-voice-christmas-af');
  });

  it('the catalog puts every key in its own special’s group', async () => {
    const cat = await buildCatalog(content);
    const group = (k: string): string | undefined => cat.entries.get(k)?.group;
    expect(group(HALLOWEEN_SHEET)).toBe(FEESDAE_GROUP);
    for (const k of Object.values(SPOOK_SOUNDS)) expect(group(k)).toBe(FEESDAE_GROUP);
    expect(group(CHRISTMAS_SHEET)).toBe(CHRISTMAS_GROUP);
    for (const k of Object.values(XMAS_SOUNDS)) expect(group(k)).toBe(CHRISTMAS_GROUP);
    for (const f of content.feesdae.specials)
      for (const line of specialLinesOf(f.barks))
        for (const lang of VOICE_LANGUAGES)
          expect(group(`voice/${lang}/${line}`), `${f.id} ${lang} ${line}`).toBe(
            specialVoiceGroup(lang, f.id),
          );
  });

  it('the packed index agrees, and no special file is in the first download', () => {
    const { index } = readFullIndex(join(root, 'public'));
    if (index === null) throw new Error('no asset index');
    expect(index.images[CHRISTMAS_SHEET]?.group).toBe(CHRISTMAS_GROUP);
    // Standard in HD (D-064): the 1× pack only, no HD twin and no -hd Christmas group.
    expect(index.images[CHRISTMAS_SHEET]?.hd).toBeUndefined();
    const groups = new Set(
      [...Object.values(index.images), ...Object.values(index.audio)].map((e) => e.group),
    );
    expect([...groups].filter((g) => g.startsWith('feesdae-christmas-hd'))).toEqual([]);
    expect(index.images[HALLOWEEN_SHEET]?.group).toBe(FEESDAE_GROUP);
    for (const k of Object.values(XMAS_SOUNDS)) expect(index.audio[k]?.group).toBe(CHRISTMAS_GROUP);
    for (const g of index.initialGroups) expect(g.startsWith('feesdae')).toBe(false);
  });
});
