// Player-facing strings. Code uses keys only; text lives in the JSON files (CLAUDE.md rule 6).
// en.json is the base: every key must exist there; other languages fall back to it.
import af from './af.json';
import de from './de.json';
import en from './en.json';
import afNames from './flavour/afNames.json';
import nl from './nl.json';

export type I18nKey = keyof typeof en;
/** M9 adds German and Dutch (machine-quality first pass, flagged for native review: D-026). */
export const LANGUAGES = ['en', 'af', 'de', 'nl'] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * v1.5 (D-041): the languages Oupa speaks (one lazy voice pack each). Dutch has no voice of its
 * own: Dutch text with the voice on "same as text" uses the Afrikaans voice, the closest.
 */
export const VOICE_LANGUAGES = ['en', 'af', 'de'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];
export type VoiceSetting = 'same' | VoiceLanguage;

/** The voice pack to use for a voice setting and the current text language. */
export function voiceLanguageFor(setting: VoiceSetting, text: Language): VoiceLanguage {
  if (setting !== 'same') return setting;
  return text === 'nl' ? 'af' : text;
}

// Content validation checks that every language has every key (src/content/i18nCheck.ts).
const tables: Record<Language, Partial<Record<I18nKey, string>>> = { en, af, de, nl };

/**
 * v1.5 (D-041): the Afrikaans flavour names. English, German and Dutch have their own names for
 * guns, maps, charms, ranks…; this table holds each renamed key's pre-v1.5 text (the Afrikaans
 * name, docs/i18n-names.md), used instead while Settings → "Afrikaans names" is on.
 */
const flavour: Partial<Record<Language, Partial<Record<I18nKey, string>>>> = afNames;

/**
 * v1.14 (D-076): the text tables the owner's edits (admin → Texts & voices) can override: the main
 * tables, the lazy guide, braai, privacy and graphics tables, and the Afrikaans-names wording.
 */
export const TEXT_TABLES = ['main', 'guide', 'braai', 'privacy', 'graphics', 'names'] as const;
export type TextTable = (typeof TEXT_TABLES)[number];
export type TextOverrides = Partial<
  Record<TextTable, Partial<Record<Language, Readonly<Record<string, string>>>>>
>;

/** v1.14 (D-076): the owner's edits in use on this device ("Use my edits in the game"), or null. */
let overrides: TextOverrides | null = null;
let overrideCount = 0;

/** v1.14 (D-076): use these edited texts instead of the tables' (null: none). */
export function setTextOverrides(o: TextOverrides | null): void {
  overrides = o;
  overrideCount = 0;
  if (o !== null)
    for (const byLang of Object.values(o))
      for (const keys of Object.values(byLang)) overrideCount += Object.keys(keys).length;
}

/** v1.14 (D-076): the edited text of `key` in one table and language, if the owner edited it. */
export function textOverride(table: TextTable, lang: Language, key: string): string | undefined {
  return overrides?.[table]?.[lang]?.[key];
}

/** v1.14 (D-076): how many edited texts are in use (0: none; the build line shows it). */
export function textOverrideCount(): number {
  return overrideCount;
}

let current: Language = 'en';
let afrikaansNames = false;

export function setLanguage(lang: Language): void {
  current = lang;
}

/** v1.5 (D-041): keep the Afrikaans names in any text language (Settings toggle). */
export function setAfrikaansNames(on: boolean): void {
  afrikaansNames = on;
}

export function getAfrikaansNames(): boolean {
  return afrikaansNames;
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
  return tIn(current, key);
}

/** Text of `key` in a given language (share text built for a fixed language, tests). The
 *  Afrikaans-names toggle applies here too, so share text shows the names the player sees. */
export function tIn(lang: Language, key: I18nKey): string {
  if (afrikaansNames) {
    const name = textOverride('names', lang, key) ?? flavour[lang]?.[key];
    if (name !== undefined) return name;
  }
  return textOverride('main', lang, key) ?? tables[lang][key] ?? en[key];
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
