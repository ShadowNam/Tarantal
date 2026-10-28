// 1.9.3 (D-056): the privacy screen's paragraphs live in their own tables
// (src/i18n/privacy/<lang>.json, privacyTables.ts), a lazy chunk like the guide's (D-055), so the
// first download doesn't carry them. Settings starts loading them; the privacy screen waits for
// them (it redraws once they are in). Same rules as src/i18n: every language has every key
// (content validation), English is the fallback.
import { getAfrikaansNames, type Language } from '../../i18n/i18n';

type Tables = Readonly<Record<Language, Readonly<Partial<Record<string, string>>>>>;

let tables: Tables | null = null;
let flavour: Readonly<Partial<Record<Language, Readonly<Record<string, string>>>>> = {};
let loading: Promise<void> | null = null;

export function privacyLoaded(): boolean {
  return tables !== null;
}

/** Starts (or joins) loading the paragraphs. */
export function loadPrivacy(): Promise<void> {
  loading ??= import('./privacyTables').then(
    (m) => {
      tables = m.PRIVACY_TABLES;
      flavour = m.PRIVACY_FLAVOUR;
    },
    (e: unknown) => {
      // Review M7: a failed load (offline) is tried again next time.
      loading = null;
      throw e;
    },
  );
  return loading;
}

/** A paragraph in `lang` (English when that language lacks it; empty until loaded). */
export function privacyString(lang: Language, key: string): string {
  if (tables === null) return '';
  // Review M18: the Afrikaans-names setting re-words them as it does the main tables (Afrikaans
  // itself keeps its own text).
  const named = lang !== 'af' && getAfrikaansNames() ? flavour[lang]?.[key] : undefined;
  return named ?? tables[lang][key] ?? tables.en[key] ?? '';
}
