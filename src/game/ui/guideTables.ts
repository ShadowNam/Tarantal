// 1.9.2 (D-055): the power-up guide's sentences (what each one does, how you get it, a tip) in
// every language. Loaded lazily (guideI18n.ts), so the first download carries none of them.
import type { Language } from '../../i18n/i18n';
import af from '../../i18n/guide/af.json';
import de from '../../i18n/guide/de.json';
import en from '../../i18n/guide/en.json';
import nl from '../../i18n/guide/nl.json';

export type GuideKey = keyof typeof en;

export const GUIDE_TABLES: Readonly<Record<Language, Readonly<Partial<Record<string, string>>>>> = {
  en,
  af,
  de,
  nl,
};
