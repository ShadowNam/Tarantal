// v1.22.1 (D-086): the sizes file from the admin page's Sizes tab (the owner's animal sizes, set by
// eye in the size editor), applied to the repo (`npm run sizes:apply`, tools/sizes-apply.ts). Pure
// apart from reading and writing JSON under `root`: each content edit sets its value in its file
// (content/*.json, content/client/feel.json) with its px hit box sets × to ÷ from; a code
// constant's edit (`code:`) is reported, never written (its art is drawn from it). An edit whose
// `from` no longer matches the file is a conflict: nothing is written unless `forceRest` (then the
// others are). One already at its `to` is skipped. A file the change would take outside its schema
// (content/ limits) is a conflict too. The CLI writes each number in place (layout kept).
// Then the true-size table (tools/sizes.ts) records the owner's choice: each row of an edited knob
// that is now outside ±15 % of real goes into OWNER_SET ("the owner set this by eye", dated), and
// a row back inside leaves it — so sizes.test.ts passes on purpose for those rows only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  BirdsSchema,
  BrakkieSchema,
  CameosSchema,
  FeelSchema,
  ModesSchema,
  type ContentBundle,
  type Feel,
} from '../src/content/schemas';
import { getAt, parseSizePath, sameSize, scaleNumbers, updateAt } from '../src/content/sizePaths';
import { knobById } from '../src/game/sizes/sizeKnobs';
import { SIZE_CODE_VALUES } from '../src/game/sizes/sizeCode';
import { applySizeEdits, type SizeEdit } from '../src/meta/sizeEdits';
import { KNOB_ROWS } from './sizeKnobRows';
import { offBy, sizeTable, type OwnerSet } from './sizes';

export const SizesFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  build: z.object({ version: z.string(), commit: z.string() }),
  edits: z.array(
    z.object({
      id: z.string().min(1),
      area: z.string().min(1),
      path: z.string().min(1),
      from: z.number().positive(),
      to: z.number().positive(),
      realM: z.number().positive().optional(),
      hitboxes: z.array(z.string()).optional(),
    }),
  ),
});
export type SizesFile = z.infer<typeof SizesFileSchema>;
export type FileEdit = SizesFile['edits'][number];

/** Within this of real, a row needs no owner's record (tools/sizes.test.ts). */
export const TOLERANCE = 0.15;
export const SIZES_TS = 'tools/sizes.ts';
const BEGIN = '// owner-set:begin';
const END = '// owner-set:end';

const SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  'content/birds.json': BirdsSchema,
  'content/cameos.json': CameosSchema,
  'content/brakkie.json': BrakkieSchema,
  'content/modes.json': ModesSchema,
  'content/client/feel.json': FeelSchema,
};

export interface SizeConflict {
  readonly edit: FileEdit;
  /** The value in the repo now (null: not there). */
  readonly now: number | null;
  readonly reason: 'changed' | 'missing' | 'bad-path' | 'schema';
  /** schema: what the file's schema says. */
  readonly message?: string;
}

export interface SizeApplyResult {
  readonly applied: readonly FileEdit[];
  /** Already in the repo (its value is the edit's `to`). */
  readonly already: readonly FileEdit[];
  readonly conflicts: readonly SizeConflict[];
  /** Code constants to change by hand (and the art drawn from them redrawn). */
  readonly code: readonly FileEdit[];
  /** Files written (or, on a dry run, that would be). */
  readonly written: readonly string[];
  /** The changed documents by file (written unless dryRun). */
  readonly docs: Readonly<Record<string, unknown>>;
  /** OWNER_SET after the edits, and the rows added to it and taken off it. */
  readonly ownerSet: Readonly<Record<string, OwnerSet>>;
  readonly ownerAdded: readonly string[];
  readonly ownerRemoved: readonly string[];
}

export interface SizeApplyOptions {
  /** Apply the edits without a conflict even when others have one. */
  readonly forceRest?: boolean;
  /** The date written into OWNER_SET (YYYY-MM-DD). */
  readonly today: string;
  /** The content and feel as in the repo now (tools/testContent.ts). */
  readonly content: ContentBundle;
  readonly feel: Feel;
  /** OWNER_SET as in tools/sizes.ts now. */
  readonly ownerSet: Readonly<Record<string, OwnerSet>>;
}

type Json = Record<string, unknown>;

/** The value the edit's path names, in the repo's files (`docs` caches parsed files). */
function read(root: string, docs: Map<string, unknown>, file: string): unknown {
  if (!docs.has(file)) {
    const path = join(root, file);
    docs.set(file, existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Json) : null);
  }
  return docs.get(file);
}

/** Works out what the file's edits do to the repo (nothing is written here). */
export function planSizes(root: string, file: SizesFile, o: SizeApplyOptions): SizeApplyResult {
  const docs = new Map<string, unknown>();
  const changed = new Set<string>();
  const applied: FileEdit[] = [];
  const already: FileEdit[] = [];
  const conflicts: SizeConflict[] = [];
  const code: FileEdit[] = [];
  const byFile = new Map<string, FileEdit[]>();
  for (const e of file.edits) {
    const p = parseSizePath(e.path);
    if (p === null) {
      conflicts.push({ edit: e, now: null, reason: 'bad-path' });
      continue;
    }
    if (p.kind === 'code') {
      const now = SIZE_CODE_VALUES[e.path] ?? null;
      if (now === null) conflicts.push({ edit: e, now, reason: 'missing' });
      else if (sameSize(now, e.to)) already.push(e);
      else if (!sameSize(now, e.from)) conflicts.push({ edit: e, now, reason: 'changed' });
      else code.push(e);
      continue;
    }
    const doc = read(root, docs, p.file);
    const now = doc === null || !(p.file in SCHEMAS) ? undefined : getAt(doc, p.keys);
    if (typeof now !== 'number') {
      conflicts.push({ edit: e, now: null, reason: 'missing' });
      continue;
    }
    if (sameSize(now, e.to)) {
      already.push(e);
      continue;
    }
    if (!sameSize(now, e.from)) {
      conflicts.push({ edit: e, now, reason: 'changed' });
      continue;
    }
    let next = updateAt(doc, p.keys, () => e.to);
    const hitboxes = e.hitboxes ?? knobById(e.id)?.hitboxes ?? [];
    for (const h of hitboxes) {
      const hp = parseSizePath(h);
      if (hp?.kind !== 'content' || hp.file !== p.file) continue;
      next = updateAt(next, hp.keys, (v) => scaleNumbers(v, e.to / e.from));
    }
    docs.set(p.file, next);
    changed.add(p.file);
    applied.push(e);
    byFile.set(p.file, [...(byFile.get(p.file) ?? []), e]);
  }
  // Each changed file must still pass its schema (the content's limits).
  for (const f of changed) {
    const r = (SCHEMAS[f] as z.ZodType).safeParse(docs.get(f));
    if (r.success) continue;
    const message = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    for (const e of byFile.get(f) ?? []) {
      conflicts.push({ edit: e, now: e.from, reason: 'schema', message });
      applied.splice(applied.indexOf(e), 1);
    }
    changed.delete(f);
  }
  const go = conflicts.length === 0 || o.forceRest === true;
  const done = go ? applied : [];
  const owner = ownerSetAfter(o, done, go ? code : []);
  return {
    applied: done,
    already,
    conflicts,
    code: go ? code : [],
    written: go ? [...changed].sort() : [],
    docs: Object.fromEntries([...changed].map((f) => [f, docs.get(f)])),
    ...owner,
  };
}

/** A file's edit as the store keeps it (optional fields left out when absent). */
export function toSizeEdit(e: FileEdit): SizeEdit {
  return {
    id: e.id,
    area: e.area,
    path: e.path,
    from: e.from,
    to: e.to,
    ...(e.realM === undefined ? {} : { realM: e.realM }),
    ...(e.hitboxes === undefined ? {} : { hitboxes: e.hitboxes }),
  };
}

/** The rows of each edited knob outside ±15 % after the edits go to OWNER_SET; back inside, off. */
export function ownerSetAfter(
  o: SizeApplyOptions,
  contentEdits: readonly FileEdit[],
  codeEdits: readonly FileEdit[],
): Pick<SizeApplyResult, 'ownerSet' | 'ownerAdded' | 'ownerRemoved'> {
  const after = applySizeEdits({ bundle: o.content, feel: o.feel }, contentEdits.map(toSizeEdit));
  const rows = new Map(sizeTable(after.bundle, after.feel).map((r) => [r.id, r]));
  const out = new Map(Object.entries(o.ownerSet));
  const added: string[] = [];
  const removed: string[] = [];
  const knobs = new Map<string, FileEdit>();
  for (const e of [...contentEdits, ...codeEdits]) if (!knobs.has(e.id)) knobs.set(e.id, e);
  for (const [id, e] of knobs) {
    // A code constant's rows move only once its art is redrawn: scaled here by its change.
    const scale = codeEdits.includes(e) ? e.to / e.from : 1;
    const k = knobById(id);
    for (const rowId of KNOB_ROWS[id] ?? []) {
      const r = rows.get(rowId);
      if (r === undefined) continue;
      const off = offBy({ ...r, drawnPx: r.drawnPx * scale });
      if (Math.abs(off) > TOLERANCE) {
        const pct = Math.round(off * 100);
        out.set(rowId, {
          date: o.today,
          knob: id,
          value: e.to,
          why: `the owner set this by eye in the size editor (${k === undefined ? id : (k.targets[0]?.split('#')[1] ?? id)} ${String(e.from)} → ${String(e.to)}): ${pct > 0 ? '+' : ''}${String(pct)} % of a real ${String(r.realM)} m`,
        });
        added.push(rowId);
      } else if (out.delete(rowId)) removed.push(rowId);
    }
  }
  return { ownerSet: Object.fromEntries(out), ownerAdded: added, ownerRemoved: removed };
}

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** tools/sizes.ts with OWNER_SET's entries (between its markers) replaced. */
export function writeOwnerSet(text: string, entries: Readonly<Record<string, OwnerSet>>): string {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${SIZES_TS}: no ${BEGIN} … ${END} markers in OWNER_SET`);
  const body = Object.keys(entries)
    .sort()
    .map((id) => {
      const e = entries[id] as OwnerSet;
      return [
        `  ${id}: {`,
        `    date: ${q(e.date)},`,
        `    knob: ${q(e.knob)},`,
        `    value: ${String(e.value)},`,
        `    why: ${q(e.why)},`,
        `  },`,
      ].join('\n');
    })
    .join('\n');
  const head = text.slice(0, a + BEGIN.length);
  const tail = text.slice(b);
  return `${head}\n${body === '' ? '' : `${body}\n`}  ${tail}`;
}

/** The change a code constant's edit asks for, in words (printed by the CLI). */
export function codeAdvice(e: FileEdit): string {
  const p = parseSizePath(e.path);
  if (p?.kind !== 'code') return e.path;
  return `${p.file}: ${p.constant}.${p.key} ${String(e.from)} → ${String(e.to)}, then redraw its art (npm run art:interim) and re-measure tools/sizes.ts MEASURED_ART`;
}

/** What else an applied content edit needs (its art is drawn at the old size). */
export function artAdvice(e: FileEdit): string | null {
  if (e.id.startsWith('far_'))
    return 'far herd: shown × feel ÷ FAUNA_DRAWN_MUL until the sheets are redrawn (npm run art:interim -- --only fauna, then set FAUNA_DRAWN_MUL and re-measure MEASURED_ART)';
  if (e.id.startsWith('cameo_'))
    return 'cameo: shown × sizeMul ÷ CAMEO_SIZE_MUL (src/game/cameos/cameoSheet.ts) until its frames are redrawn at the new size';
  if (e.id === 'ostrich_hen')
    return "hen: shown × henScale ÷ OSTRICH_HEN_SCALE until the sheet's hen frames are redrawn";
  return null;
}
