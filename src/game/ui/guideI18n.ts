// 1.9.2 (D-055): the power-up guide's long sentences live in their own tables
// (src/i18n/guide/<lang>.json, guideTables.ts), a lazy chunk like the Skietbaan's and the Graphics
// card's strings, so the first download doesn't carry them. Same rules as src/i18n: every
// language has every key (content validation), English is the fallback. A hunt and the Gun Shed
// start loading them; until they are in, the guide's sentences are empty (the pickup card shows
// its short line instead).
import type { Language } from '../../i18n/i18n';

type Tables = Readonly<Record<Language, Readonly<Partial<Record<string, string>>>>>;

let tables: Tables | null = null;
let loading: Promise<void> | null = null;

/** True once the guide's sentences are in. */
export function guideLoaded(): boolean {
  return tables !== null;
}

/** Starts (or joins) loading the guide's sentences. */
export function loadGuide(): Promise<void> {
  loading ??= import('./guideTables').then((m) => {
    tables = m.GUIDE_TABLES;
  });
  return loading;
}

/** Tests: the tables, set directly. */
export function setGuideTables(t: Tables | null): void {
  tables = t;
}

/** A guide sentence in `lang` (English when that language lacks it); null if not loaded or no
 *  such key. */
export function guideString(lang: Language, key: string): string | null {
  if (tables === null) return null;
  return tables[lang][key] ?? tables.en[key] ?? null;
}
