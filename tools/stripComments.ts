// D-048: content JSON ships without its `$comment` keys. They document the tuning for people;
// contentHash already drops them (canonicalJson), no schema needs them and nothing in the game
// reads them, so the browser bundle leaves them out (about 9 KB gzip of the first download).
// Pure: used by the Vite plugin in vite.config.ts and unit-tested.

/** A deep copy of a JSON value without any `$comment` keys. */
export function withoutComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutComments);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    if (k !== '$comment') out[k] = withoutComments(v);
  return out;
}

/** A content/ JSON file (the sim bundle, feel, meta) — not i18n or the asset index. */
export function isContentJson(id: string): boolean {
  return /[\\/]content[\\/].*\.json$/.test(id.split('?')[0] ?? '');
}
