// D-053: the Graphics card's and the HD loading screen's strings: their own tables
// (src/i18n/graphics/<lang>.json), in the lazy chunk with the card and the HD runtime, so the first
// download carries none of them. Same rules as src/i18n: every language has every key (content
// validation), English is the fallback.
import { getLanguage, type Language } from '../../i18n/i18n';
import af from '../../i18n/graphics/af.json';
import de from '../../i18n/graphics/de.json';
import en from '../../i18n/graphics/en.json';
import nl from '../../i18n/graphics/nl.json';

export type GraphicsKey = keyof typeof en;

const tables: Record<Language, Partial<Record<GraphicsKey, string>>> = { en, af, de, nl };

export function gt(key: GraphicsKey): string {
  return tables[getLanguage()][key] ?? en[key];
}
