// 1.9.3 (D-056): the privacy screen's long paragraphs in every language. Loaded lazily
// (privacyI18n.ts), so the first download carries none of them.
import type { Language } from '../../i18n/i18n';
import af from '../../i18n/privacy/af.json';
import de from '../../i18n/privacy/de.json';
import en from '../../i18n/privacy/en.json';
import nl from '../../i18n/privacy/nl.json';
import flavour from '../../i18n/privacy/flavour.json';

export const PRIVACY_TABLES: Readonly<Record<Language, Readonly<Partial<Record<string, string>>>>> =
  { en, af, de, nl };

/** 1.9.3 (D-056, review M18): the Afrikaans-names wording of these paragraphs (as
 *  src/i18n/flavour/afNames.json holds for the main tables), used while that setting is on. */
export const PRIVACY_FLAVOUR: Readonly<
  Partial<Record<Language, Readonly<Record<string, string>>>>
> = flavour;
