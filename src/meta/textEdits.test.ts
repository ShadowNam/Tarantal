import { afterEach, describe, expect, it } from 'vitest';
import { setTextOverrides, t, textOverride, textOverrideCount, tIn } from '../i18n/i18n';
import { readText, resetStorageForTests, setStorageNamespace, writeText } from './storage';
import {
  applyTextEdits,
  EMPTY_TEXT_EDITS,
  isTextEdit,
  loadTextEdits,
  overridesOf,
  storeTextEdits,
  TEXT_EDITS_KEY,
  type TextEditStore,
} from './textEdits';

const store: TextEditStore = {
  version: 1,
  apply: true,
  edits: [
    {
      table: 'main',
      key: 'title.shed',
      lang: 'en',
      field: 'text',
      from: 'Gun Shed',
      to: 'The Shed',
    },
    { table: 'guide', key: 'guide.cameo.scold', lang: 'af', field: 'text', from: 'x', to: 'y' },
    { table: 'main', key: 'bark.weavers', lang: 'en', field: 'say', from: 'a', to: 'b' },
  ],
};

afterEach(() => {
  resetStorageForTests();
  setTextOverrides(null);
});

describe('text edits store', () => {
  it('is shared by the admin page and the game (the device namespace), not the save', () => {
    setStorageNamespace('e2e.admin.', 'e2e.');
    storeTextEdits(store);
    expect(readText(TEXT_EDITS_KEY)).toBeNull();
    setStorageNamespace('e2e.', 'e2e.');
    expect(readText(TEXT_EDITS_KEY)).not.toBeNull();
    expect(loadTextEdits()).toEqual(store);
    // The player's own namespace never sees the test run's edits.
    setStorageNamespace('', '');
    expect(loadTextEdits()).toEqual(EMPTY_TEXT_EDITS);
  });

  it('reads a broken or foreign value as no edits', () => {
    writeText(TEXT_EDITS_KEY, '{"version":2}');
    expect(loadTextEdits()).toEqual(EMPTY_TEXT_EDITS);
    writeText(TEXT_EDITS_KEY, 'not json');
    expect(loadTextEdits()).toEqual(EMPTY_TEXT_EDITS);
    expect(isTextEdit({ ...store.edits[2], lang: 'nl' })).toBe(false);
    expect(isTextEdit({ ...store.edits[0], table: 'admin' })).toBe(false);
  });
});

describe('overrides', () => {
  it('uses only the text edits, and only with "Use my edits" on', () => {
    expect(overridesOf({ ...store, apply: false })).toBeNull();
    expect(overridesOf(store)).toEqual({
      main: { en: { 'title.shed': 'The Shed' } },
      guide: { af: { 'guide.cameo.scold': 'y' } },
    });
  });

  it('replaces the text the game shows, and counts for the build line', () => {
    const before = tIn('en', 'title.shed');
    applyTextEdits(store);
    expect(tIn('en', 'title.shed')).toBe('The Shed');
    expect(t('title.shed')).toBe('The Shed');
    expect(tIn('af', 'title.shed')).not.toBe('The Shed');
    expect(textOverride('guide', 'af', 'guide.cameo.scold')).toBe('y');
    expect(textOverrideCount()).toBe(2);
    applyTextEdits({ ...store, apply: false });
    expect(tIn('en', 'title.shed')).toBe(before);
    expect(textOverrideCount()).toBe(0);
  });
});
