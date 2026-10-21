// Parses the meta-only content files (content/meta/*.json: Notaboek, Daily). Pure: no I/O.
import type { z } from 'zod';

export type MetaParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseMetaFile<S extends z.ZodType>(schema: S, raw: unknown): MetaParseResult<z.infer<S>> {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}
