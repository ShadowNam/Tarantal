// 1.9.3 (D-056): the playtest admin page's strings, in their own tables
// (src/i18n/admin/<lang>.json) that load with the admin panel's lazy chunk, so the first download
// carries none of them (like the Skietbaan's, D-037). Same rules as src/i18n: every language has
// every key (content validation), English is the fallback. Keys the page shares with the rest of
// the game (admin.back, admin.crate_tag, admin.sight_default) stay in the main tables; `at` falls
// back to them.
import { getLanguage, isI18nKey, t, type Language } from '../../i18n/i18n';
import af from '../../i18n/admin/af.json';
import de from '../../i18n/admin/de.json';
import en from '../../i18n/admin/en.json';
import nl from '../../i18n/admin/nl.json';

const tables: Record<Language, Readonly<Partial<Record<string, string>>>> = { en, af, de, nl };

/** An admin page string (or any main-table key). */
export function at(key: string): string {
  return tables[getLanguage()][key] ?? tables.en[key] ?? (isI18nKey(key) ? t(key) : key);
}

/** `at`, or `fallback` when no table has the key. */
export function atOr(key: string, fallback: string): string {
  const v = tables[getLanguage()][key] ?? tables.en[key];
  if (v !== undefined) return v;
  return isI18nKey(key) ? t(key) : fallback;
}
