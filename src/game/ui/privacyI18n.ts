// 1.9.3 (D-056): the privacy screen's paragraphs live in their own tables
// (src/i18n/privacy/<lang>.json, privacyTables.ts), a lazy chunk like the guide's (D-055), so the
// first download doesn't carry them. Settings starts loading them; the privacy screen waits for
// them (it redraws once they are in). Same rules as src/i18n: every language has every key
// (content validation), English is the fallback.
import type { Language } from '../../i18n/i18n';

type Tables = Readonly<Record<Language, Readonly<Partial<Record<string, string>>>>>;

let tables: Tables | null = null;
let loading: Promise<void> | null = null;

export function privacyLoaded(): boolean {
  return tables !== null;
}

/** Starts (or joins) loading the paragraphs. */
export function loadPrivacy(): Promise<void> {
  loading ??= import('./privacyTables').then((m) => {
    tables = m.PRIVACY_TABLES;
  });
  return loading;
}

/** A paragraph in `lang` (English when that language lacks it; empty until loaded). */
export function privacyString(lang: Language, key: string): string {
  if (tables === null) return '';
  return tables[lang][key] ?? tables.en[key] ?? '';
}
