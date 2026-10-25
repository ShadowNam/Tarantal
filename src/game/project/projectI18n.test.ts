import { afterEach, describe, expect, it } from 'vitest';
import { LANGUAGES, setLanguage } from '../../i18n/i18n';
import af from '../../i18n/project/af.json';
import de from '../../i18n/project/de.json';
import en from '../../i18n/project/en.json';
import nl from '../../i18n/project/nl.json';
import { pf, pt } from './projectI18n';

const vars = (s: string): string =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join();

describe('Project overview strings (D-045)', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it('every language has every key, with the same placeholders', () => {
    const tables: Record<string, Record<string, string>> = { en, af, de, nl };
    expect(Object.keys(tables).sort()).toEqual([...LANGUAGES].sort());
    for (const [lang, table] of Object.entries(tables)) {
      expect(Object.keys(table).sort(), lang).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(table)) {
        expect(k.startsWith('project.'), k).toBe(true);
        expect(v.trim(), `${lang} ${k}`).not.toBe('');
        expect(vars(v), `${lang} ${k}`).toBe(vars((en as Record<string, string>)[k] ?? ''));
      }
    }
  });

  it('follow the game language and fill placeholders', () => {
    expect(pt('project.title')).toBe('Project overview');
    expect(pf('project.progress', { done: 7, total: 9 })).toBe('7 of 9');
    setLanguage('af');
    expect(pt('project.title')).toBe('Projekoorsig');
    expect(pf('project.eta', { when: '25 Oct, ~21:00' })).toBe('verwag 25 Oct, ~21:00');
    setLanguage('de');
    expect(pt('project.tab_roadmap')).toBe('Fahrplan');
  });
});
