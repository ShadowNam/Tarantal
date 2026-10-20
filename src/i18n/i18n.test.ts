import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import af from './af.json';
import en from './en.json';
import { fill, isI18nKey, pickLanguage, setLanguage, t } from './i18n';

describe('i18n tables', () => {
  it('af has no key that en lacks, and every string is non-empty', () => {
    const enKeys = new Set(Object.keys(en));
    expect(Object.keys(af).filter((k) => !enKeys.has(k))).toEqual([]);
    for (const [k, v] of [...Object.entries(en), ...Object.entries(af)]) expect(v, k).not.toBe('');
  });

  it('af covers every M5 menu, settings and FTUE key (no silent English fallback there)', () => {
    const prefixes = [
      'title.',
      'settings.',
      'shed.',
      'pause.',
      'ftue.',
      'notaboek.',
      'pwa.',
      'ui.',
    ];
    const missing = Object.keys(en).filter(
      (k) => prefixes.some((p) => k.startsWith(p)) && !Object.hasOwn(af, k),
    );
    expect(missing).toEqual([]);
  });

  it('placeholders match between languages', () => {
    const vars = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const [k, v] of Object.entries(af)) {
      const base = (en as Record<string, string>)[k] ?? '';
      expect(vars(v), k).toEqual(vars(base));
    }
  });

  it('every data-i18n key in index.html exists', () => {
    const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(isI18nKey(k), k).toBe(true);
  });

  it('switches language and fills placeholders', () => {
    setLanguage('af');
    expect(t('settings.title')).toBe('Instellings');
    setLanguage('en');
    expect(fill(t('notaboek.bag_50_far'), { n: 50 })).toBe('Bag 50 far birds');
    expect(pickLanguage(['af-ZA', 'en'])).toBe('af');
    expect(pickLanguage(['de-DE'])).toBe('en');
  });
});
