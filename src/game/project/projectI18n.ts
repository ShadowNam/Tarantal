// D-045 Project overview strings: their own tables (src/i18n/project/<lang>.json), loaded with the
// page's lazy chunk so the first download carries none of them (like the Skietbaan's, D-037).
// Same rules as src/i18n: every language has every key (content validation), English is the
// fallback. The log's own text (titles, summaries) is English data, not keys.
import { fill, getLanguage, type Language } from '../../i18n/i18n';
import af from '../../i18n/project/af.json';
import de from '../../i18n/project/de.json';
import en from '../../i18n/project/en.json';
import nl from '../../i18n/project/nl.json';

export type ProjectKey = keyof typeof en;

const tables: Record<Language, Partial<Record<ProjectKey, string>>> = { en, af, de, nl };

export function pt(key: ProjectKey): string {
  return tables[getLanguage()][key] ?? en[key];
}

/** A string with its {placeholders} filled. */
export function pf(key: ProjectKey, values: Readonly<Record<string, string | number>>): string {
  return fill(pt(key), values);
}
