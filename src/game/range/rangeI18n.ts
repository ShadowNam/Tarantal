// v1.3x (D-037) Skietbaan strings: their own tables (src/i18n/range/<lang>.json), loaded with the
// range's lazy chunk so the first download carries none of them. Same rules as src/i18n: every
// language has every key (content validation), English is the fallback.
import { getLanguage, type Language } from '../../i18n/i18n';
import af from '../../i18n/range/af.json';
import de from '../../i18n/range/de.json';
import en from '../../i18n/range/en.json';
import nl from '../../i18n/range/nl.json';

export type RangeKey = keyof typeof en;

const tables: Record<Language, Partial<Record<RangeKey, string>>> = { en, af, de, nl };

export function rt(key: RangeKey): string {
  return tables[getLanguage()][key] ?? en[key];
}
