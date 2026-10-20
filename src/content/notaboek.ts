// Parses content/meta/notaboek.json (Notaboek challenges, meta-only). Pure: no I/O.
import { NotaboekSchema, type Notaboek } from './schemas';

export type NotaboekResult =
  | { readonly ok: true; readonly notaboek: Notaboek }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseNotaboek(raw: unknown): NotaboekResult {
  const r = NotaboekSchema.safeParse(raw);
  if (r.success) return { ok: true, notaboek: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}
