import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../i18n/i18n';
import { checkLanguage, checkLanguageSet } from './i18nCheck';

const dir = join(import.meta.dirname, '..', 'i18n');
const read = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>;

describe('every language has every string (M9)', () => {
  it('flags missing, extra, empty and placeholder mismatches', () => {
    const base = { a: 'Hi {name}', b: 'Go', c: 'X' };
    const issues = checkLanguage('xx', base, { a: 'Hallo {naam}', b: ' ', d: 'Extra' });
    expect(issues.map((i) => `${i.key}:${i.message.split(' ')[0] ?? ''}`)).toEqual([
      'a:placeholders',
      'b:empty',
      'c:missing',
      'd:not',
    ]);
  });

  it('af, de and nl are complete against en', () => {
    const en = read('en.json');
    const langs = readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f) && f !== 'en.json');
    expect(langs.sort()).toEqual(['af.json', 'de.json', 'nl.json']);
    for (const f of langs) expect(checkLanguage(f, en, read(f)), f).toEqual([]);
  });

  it('LANGUAGES and the language files are the same set', () => {
    const files = readdirSync(dir)
      .filter((f) => /^[a-z]{2}\.json$/.test(f))
      .map((f) => f.slice(0, 2));
    expect(checkLanguageSet(LANGUAGES, files)).toEqual([]);
    expect(checkLanguageSet(['en', 'af', 'fr'], ['en', 'af', 'de'])).toEqual([
      '"fr" is in LANGUAGES but has no fr.json',
      'de.json exists but "de" is not in LANGUAGES',
    ]);
  });
});
