// M9: every language has every string (content validation, D-026). Compares a language table with
// the English base: missing keys, keys English lacks, empty strings and placeholders that differ
// ({name} tokens) are errors. Content-derived keys (item.<id>, charm.<id> …) are checked against
// English by crossRefs, so together every key the game can ask for exists in every language. Pure.

export interface LanguageIssue {
  readonly lang: string;
  readonly key: string;
  readonly message: string;
}

const placeholders = (s: string): string =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1] ?? '')
    .sort()
    .join(',');

export function checkLanguage(
  lang: string,
  base: Readonly<Record<string, unknown>>,
  table: Readonly<Record<string, unknown>>,
): LanguageIssue[] {
  const issues: LanguageIssue[] = [];
  for (const [key, en] of Object.entries(base)) {
    const v = table[key];
    if (v === undefined) issues.push({ lang, key, message: 'missing' });
    else if (typeof v !== 'string' || v.trim() === '')
      issues.push({ lang, key, message: 'empty or not a string' });
    else if (typeof en === 'string' && placeholders(v) !== placeholders(en))
      issues.push({
        lang,
        key,
        message: `placeholders {${placeholders(v)}} ≠ English {${placeholders(en)}}`,
      });
  }
  for (const key of Object.keys(table))
    if (!Object.hasOwn(base, key)) issues.push({ lang, key, message: 'not in en.json' });
  return issues;
}

/**
 * The languages the game offers (`LANGUAGES` in i18n.ts) and the `<lang>.json` files in
 * src/i18n must be the same set: a file the picker never offers, or a language without a file,
 * is an error.
 */
export function checkLanguageSet(declared: readonly string[], files: readonly string[]): string[] {
  const d = new Set(declared);
  const f = new Set(files);
  return [
    ...[...d].filter((l) => !f.has(l)).map((l) => `"${l}" is in LANGUAGES but has no ${l}.json`),
    ...[...f].filter((l) => !d.has(l)).map((l) => `${l}.json exists but "${l}" is not in LANGUAGES`),
  ];
}
