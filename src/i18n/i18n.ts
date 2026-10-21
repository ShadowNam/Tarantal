// Player-facing strings. Code uses keys only; text lives in the JSON files (CLAUDE.md rule 6).
// en.json is the base: every key must exist there; other languages fall back to it.
import af from './af.json';
import de from './de.json';
import en from './en.json';
import nl from './nl.json';

export type I18nKey = keyof typeof en;
/** M9 adds German and Dutch (machine-quality first pass, flagged for native review: D-026). */
export const LANGUAGES = ['en', 'af', 'de', 'nl'] as const;
export type Language = (typeof LANGUAGES)[number];

// Content validation checks that every language has every key (src/content/i18nCheck.ts).
const tables: Record<Language, Partial<Record<I18nKey, string>>> = { en, af, de, nl };

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
    const lang = LANGUAGES.find((l) => l === base);
    if (lang !== undefined) return lang;
  }
  return 'en';
}

export function isI18nKey(key: string): key is I18nKey {
  return Object.hasOwn(en, key);
}

export function t(key: I18nKey): string {
  return tables[current][key] ?? en[key];
}

/** Text of `key` in a given language (share text built for a fixed language, tests). */
export function tIn(lang: Language, key: I18nKey): string {
  return tables[lang][key] ?? en[key];
}

/** A key built from content ids (e.g. `item.${id}`): its text, or `fallback` if it has none. */
export function tOr(key: string, fallback: string): string {
  return isI18nKey(key) ? t(key) : fallback;
}

/** Fills `{name}` placeholders. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** Lookups for one fixed language (share text is built in the player's language at share time). */
export interface Translator {
  text(key: I18nKey): string;
  /** A key built from content ids, or `fallback` when it has no text. */
  or(key: string, fallback: string): string;
}

export function translator(lang: Language): Translator {
  return {
    text: (key) => tIn(lang, key),
    or: (key, fallback) => (isI18nKey(key) ? tIn(lang, key) : fallback),
  };
}
