// 1.9.3 (D-056): the privacy screen's long paragraphs in every language. Loaded lazily
// (privacyI18n.ts), so the first download carries none of them.
import type { Language } from '../../i18n/i18n';
import af from '../../i18n/privacy/af.json';
import de from '../../i18n/privacy/de.json';
import en from '../../i18n/privacy/en.json';
import nl from '../../i18n/privacy/nl.json';

export const PRIVACY_TABLES: Readonly<Record<Language, Readonly<Partial<Record<string, string>>>>> =
  { en, af, de, nl };
