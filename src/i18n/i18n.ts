// Player-facing strings. Code uses keys only; text lives in the JSON files (CLAUDE.md rule 6).
// en.json is the base: every key must exist there; other languages fall back to it.
import af from './af.json';
import en from './en.json';

export type I18nKey = keyof typeof en;
export type Language = 'en' | 'af';

const tables: Record<Language, Partial<Record<I18nKey, string>>> = { en, af };

let current: Language = 'en';

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

/** Picks a supported language from BCP-47 tags (e.g. navigator.languages); defaults to en. */
export function pickLanguage(tags: readonly string[]): Language {
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'af' || base === 'en') return base;
  }
  return 'en';
}

export function isI18nKey(key: string): key is I18nKey {
  return Object.hasOwn(en, key);
}

export function t(key: I18nKey): string {
  return tables[current][key] ?? en[key];
}
