// Parses content/client/feel.json (Phaser-layer feel tuning, D-019). Pure: no I/O.
import { FeelSchema, type Feel } from './schemas';

export type FeelResult =
  | { readonly ok: true; readonly feel: Feel }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseFeel(raw: unknown): FeelResult {
  const r = FeelSchema.safeParse(raw);
  if (r.success) return { ok: true, feel: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}
