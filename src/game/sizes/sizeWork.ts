// v1.22.1 (D-086): the owner's sizes as the Sizes tab and the size editor work with them: a factor
// per knob (1 = as shipped), the store's edits it becomes (one per value the knob sets, rounded the
// knob's way), the height it then shows as, and the export file. Pure (lazy chunk; unit-tested).
import type { ContentBundle, Feel } from '../../content/schemas';
import { sameSize } from '../../content/sizePaths';
import type { SizeEdit, SizeEditStore } from '../../meta/sizeEdits';
import type { SizeArea } from './sizeAreas';
import { knobById, roundSize, SIZE_KNOBS, valueAt, type SizeKnob } from './sizeKnobs';

export type SizeContent = { readonly bundle: ContentBundle; readonly feel: Feel };
export type Factors = Readonly<Record<string, number>>;

/** The steps the editor's buttons take (× the factor). */
export const SIZE_STEPS = [-0.1, -0.02, 0.02, 0.1] as const;

/**
 * Each knob's factor from the store's edits (to ÷ from of its first value), where the edit still
 * starts from the value the game has now (a stale edit — the value changed since — is left out).
 */
export function factorsOf(store: SizeEditStore, c: SizeContent): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of SIZE_KNOBS) {
    const first = k.targets[0];
    const e = store.edits.find((x) => x.id === k.id && x.path === first);
    const now = first === undefined ? null : valueAt(first, c);
    if (e === undefined || now === null || !sameSize(now, e.from)) continue;
    out[k.id] = e.to / e.from;
  }
  return out;
}

/** The edits a knob at factor `f` makes (none at 1, or where its value isn't in the game). */
export function editsFor(k: SizeKnob, f: number, area: SizeArea, c: SizeContent): SizeEdit[] {
  if (sameSize(f, 1)) return [];
  const out: SizeEdit[] = [];
  for (const path of k.targets) {
    const from = valueAt(path, c);
    if (from === null) continue;
    const to = roundSize(k, from * f);
    if (sameSize(to, from)) continue;
    out.push({
      id: k.id,
      area,
      path,
      from,
      to,
      realM: k.realM,
      ...(k.hitboxes === undefined ? {} : { hitboxes: k.hitboxes }),
    });
  }
  return out;
}

/** The store with one knob's edits replaced by those of factor `f` (the others kept). */
export function withKnob(
  store: SizeEditStore,
  k: SizeKnob,
  f: number,
  area: SizeArea,
  c: SizeContent,
): SizeEditStore {
  return {
    ...store,
    edits: [...store.edits.filter((e) => e.id !== k.id), ...editsFor(k, f, area, c)],
  };
}

/** The factor a step takes it to (kept inside the store's range, 3 decimals). */
export function stepped(f: number, step: number): number {
  return Math.min(5, Math.max(0.2, Math.round(f * (1 + step) * 1000) / 1000));
}

/** The height (m) a knob's animal shows as beside the guineafowl at these factors (null: not
 *  measured). */
export function shownM(k: SizeKnob, c: SizeContent, f: Factors): number | null {
  if (k.mPerUnit === null) return null;
  let m = k.mPerUnit;
  for (const id of [k.id, ...(k.with ?? [])]) {
    const w = knobById(id);
    const v = w === undefined ? null : valueAt(w.targets[0] ?? '', c);
    if (v === null) return null;
    m *= v * (f[id] ?? 1);
  }
  return m;
}

/** The shown value of a knob at a factor (its first value, rounded its way). */
export function valueWith(k: SizeKnob, c: SizeContent, f: number): number | null {
  const v = valueAt(k.targets[0] ?? '', c);
  return v === null ? null : roundSize(k, v * f);
}

export interface SizeExport {
  readonly version: 1;
  readonly exportedAt: string;
  readonly build: { readonly version: string; readonly commit: string };
  readonly edits: readonly SizeEdit[];
}

/** The file the owner sends: the edits in the knobs' order. */
export function exportSizes(
  store: SizeEditStore,
  build: { readonly version: string; readonly commit: string },
  exportedAt: string,
): SizeExport {
  const order = new Map(SIZE_KNOBS.map((k, i) => [k.id, i]));
  const edits = [...store.edits].sort(
    (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
  );
  return { version: 1, exportedAt, build, edits };
}

/** `tarantal-size-edits-2026-11-10-1405.json`. */
export function sizesFileName(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return `tarantal-size-edits-${m === null ? 'export' : `${m[1] ?? ''}-${m[2] ?? ''}${m[3] ?? ''}`}.json`;
}

/** "+10 %", "−2 %" (the change a factor is). */
export function percentOf(f: number): string {
  const p = Math.round((f - 1) * 1000) / 10;
  return p === 0 ? '0 %' : `${p > 0 ? '+' : '−'}${String(Math.abs(p))} %`;
}
