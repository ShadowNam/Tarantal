// v1.14 (D-076): the corrections file from the admin page's Texts & voices tab, applied to the
// tables (`npm run text:apply`, tools/text-apply.ts). Pure apart from reading and writing JSON under
// `root`: each edit goes into its table (the main, guide, braai, privacy or graphics i18n JSON, the
// Afrikaans-names table, or a `say` line of tools/audio/voice.config.json). An edit whose `from`
// no longer matches the file is a conflict: nothing is written unless `forceRest`, which applies
// the others. Files keep their key order and formatting (2-space JSON, as Prettier writes them).
// The voiced keys whose spoken text changed, per voice language, go to redo.json (the input of
// the voices job, docs/06 §5).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { checkTokens } from '../src/game/admin/texts/textLines';
import { LANGUAGES, TEXT_TABLES, VOICE_LANGUAGES, type VoiceLanguage } from '../src/i18n/i18n';

export const CorrectionsSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  build: z.object({ version: z.string(), commit: z.string() }),
  edits: z.array(
    z.object({
      key: z.string().min(1),
      table: z.enum(TEXT_TABLES),
      lang: z.enum(LANGUAGES),
      from: z.string(),
      to: z.string(),
      voiced: z.boolean(),
      field: z.enum(['text', 'say']),
    }),
  ),
});
export type Corrections = z.infer<typeof CorrectionsSchema>;
export type Correction = Corrections['edits'][number];

export const VOICE_CONFIG = 'tools/audio/voice.config.json';
export const REDO_PATH = 'art-source/audio/voice/redo.json';

/** The file (relative to the repo root) an edit's text lives in. */
export function fileOf(e: Pick<Correction, 'table' | 'lang' | 'field'>): string {
  if (e.field === 'say') return VOICE_CONFIG;
  switch (e.table) {
    case 'main':
      return `src/i18n/${e.lang}.json`;
    case 'names':
      return 'src/i18n/flavour/afNames.json';
    case 'privacyNames':
      return 'src/i18n/privacy/flavour.json';
    default:
      return `src/i18n/${e.table}/${e.lang}.json`;
  }
}

type Json = Record<string, unknown>;

/** The object an edit's key sits in, inside its parsed file (created for a new `say` language). */
function holder(doc: Json, e: Correction, create: boolean): Json | null {
  const nested = (parent: Json, k: string): Json | null => {
    const v = parent[k];
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v as Json;
    if (!create) return null;
    const fresh: Json = {};
    parent[k] = fresh;
    return fresh;
  };
  if (e.field === 'say') {
    const say = nested(doc, 'say');
    return say === null ? null : nested(say, e.lang);
  }
  if (e.table === 'names' || e.table === 'privacyNames') return nested(doc, e.lang);
  return doc;
}

export interface Conflict {
  readonly edit: Correction;
  /** The file's text now (null: the key isn't there). */
  readonly now: string | null;
  readonly reason: 'changed' | 'missing' | 'not-voice-language' | 'placeholders' | 'empty';
  /** placeholders: the ones dropped and added. */
  readonly missing?: readonly string[];
  readonly extra?: readonly string[];
}

export interface ApplyResult {
  readonly applied: readonly Correction[];
  /** Edits the files already have (the text is their `to`): skipped, never a conflict — a device
   *  still holding last round's corrections exports them again. */
  readonly already: readonly Correction[];
  readonly conflicts: readonly Conflict[];
  /** Files written (relative paths); none when a conflict stopped the run. */
  readonly written: readonly string[];
  /** Voiced keys whose spoken text changed, per voice language (this run's). */
  readonly redo: Readonly<Record<VoiceLanguage, readonly string[]>>;
}

export interface ApplyOptions {
  /** Apply the edits without a conflict even when some have one. */
  readonly forceRest: boolean;
  /** The voiced keys (src/game/audio/voicedKeys.ts). */
  readonly voiced: ReadonlySet<string>;
  /** Write nothing (a dry run). */
  readonly dryRun?: boolean;
}

/** Applies a corrections file under `root`; see the file comment. */
export function applyCorrections(root: string, file: Corrections, opts: ApplyOptions): ApplyResult {
  const docs = new Map<string, Json>();
  const doc = (rel: string): Json => {
    let d = docs.get(rel);
    if (d === undefined) {
      d = JSON.parse(readFileSync(join(root, rel), 'utf8')) as Json;
      docs.set(rel, d);
    }
    return d;
  };
  const conflicts: Conflict[] = [];
  const ok: Correction[] = [];
  const already: Correction[] = [];
  for (const e of file.edits) {
    if (e.field === 'say' && !(VOICE_LANGUAGES as readonly string[]).includes(e.lang)) {
      conflicts.push({ edit: e, now: null, reason: 'not-voice-language' });
      continue;
    }
    // The tab refuses these too; a hand-edited or old file must not slip them in (flavour names
    // and `say` lines aren't checked by content:validate).
    if (e.field === 'text' && e.to.trim() === '') {
      conflicts.push({ edit: e, now: null, reason: 'empty' });
      continue;
    }
    const tokens = checkTokens(e.from, e.to);
    if (!tokens.ok && !(e.field === 'say' && e.to.trim() === '')) {
      conflicts.push({
        edit: e,
        now: null,
        reason: 'placeholders',
        missing: tokens.missing,
        extra: tokens.extra,
      });
      continue;
    }
    const h = holder(doc(fileOf(e)), e, false);
    const v = h?.[e.key];
    const now = typeof v === 'string' ? v : null;
    // A `say` line that doesn't exist yet is '' (the tab's original for it).
    const cur = now ?? (e.field === 'say' ? '' : null);
    // An emptied `say` is the line without one ('').
    const target = e.field === 'say' && e.to.trim() === '' ? '' : e.to;
    if (cur === null) conflicts.push({ edit: e, now: null, reason: 'missing' });
    else if (cur === target) already.push(e);
    else if (cur !== e.from) conflicts.push({ edit: e, now, reason: 'changed' });
    else ok.push(e);
  }
  const redo: Record<VoiceLanguage, string[]> = { en: [], af: [], de: [] };
  if (conflicts.length > 0 && !opts.forceRest)
    return { applied: [], already, conflicts, written: [], redo };

  const touched = new Set<string>();
  for (const e of ok) {
    const rel = fileOf(e);
    const h = holder(doc(rel), e, true);
    if (h === null) continue;
    if (e.field === 'say' && e.to.trim() === '') Reflect.deleteProperty(h, e.key);
    else h[e.key] = e.to;
    touched.add(rel);
  }
  // The voice speaks `say` where there is one, else the text: a text edit under a `say` line
  // changes nothing it says.
  const voice = docs.get(VOICE_CONFIG) ?? doc(VOICE_CONFIG);
  const sayOf = (lang: string, key: string): string | undefined => {
    const say = voice['say'] as Record<string, Record<string, string> | undefined> | undefined;
    return say?.[lang]?.[key];
  };
  for (const e of ok) {
    const lang = VOICE_LANGUAGES.find((l) => l === e.lang);
    if (
      lang === undefined ||
      !opts.voiced.has(e.key) ||
      e.table === 'names' ||
      e.table === 'privacyNames'
    )
      continue;
    if (e.field === 'text' && sayOf(lang, e.key) !== undefined) continue;
    if (!redo[lang].includes(e.key)) redo[lang].push(e.key);
  }
  for (const l of VOICE_LANGUAGES) redo[l].sort();
  if (opts.dryRun !== true)
    for (const rel of touched)
      writeFileSync(join(root, rel), `${JSON.stringify(docs.get(rel), null, 2)}\n`);
  return { applied: ok, already, conflicts, written: [...touched].sort(), redo };
}

export interface RedoFile {
  readonly version: 1;
  readonly $comment: string;
  /** The corrections files applied since the voices were last made. */
  readonly sources: readonly string[];
  readonly redo: Readonly<Record<VoiceLanguage, readonly string[]>>;
}

const REDO_COMMENT =
  'v1.14 (D-076): voiced lines whose text or `say` changed (npm run text:apply), per voice language. `npm run audio:voice -- --redo` re-makes exactly these clips and empties the lists (a line kept by a human recording stays listed); the later voices job may read it the same way.';

/** redo.json as it is (tolerant: an old or hand-edited file without some fields reads as empty). */
export function readRedo(root: string): RedoFile {
  const path = join(root, REDO_PATH);
  const empty = { en: [], af: [], de: [] };
  let raw: unknown = null;
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      raw = null;
    }
  }
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const lists = (typeof o['redo'] === 'object' && o['redo'] !== null ? o['redo'] : {}) as Record<
    string,
    unknown
  >;
  const redo: Record<VoiceLanguage, string[]> = { ...empty };
  for (const l of VOICE_LANGUAGES) {
    const v = lists[l];
    redo[l] = Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  }
  const sources = Array.isArray(o['sources'])
    ? o['sources'].filter((k): k is string => typeof k === 'string')
    : [];
  return { version: 1, $comment: REDO_COMMENT, sources, redo };
}

/** redo.json without the clips just re-made (`done`); no sources left once every list is empty. */
export function redoAfter(
  file: RedoFile,
  done: Readonly<Partial<Record<VoiceLanguage, readonly string[]>>>,
): RedoFile {
  const redo = {} as Record<VoiceLanguage, string[]>;
  for (const l of VOICE_LANGUAGES) {
    const d = new Set(done[l] ?? []);
    redo[l] = file.redo[l].filter((k) => !d.has(k));
  }
  const left = VOICE_LANGUAGES.some((l) => redo[l].length > 0);
  return { version: 1, $comment: REDO_COMMENT, sources: left ? file.sources : [], redo };
}

/** redo.json with this run's keys added to any already listed (until the voices job clears it). */
export function mergeRedo(
  root: string,
  source: string,
  redo: Readonly<Record<VoiceLanguage, readonly string[]>>,
): RedoFile {
  const old = readRedo(root);
  const merged = {} as Record<VoiceLanguage, string[]>;
  for (const l of VOICE_LANGUAGES) merged[l] = [...new Set([...old.redo[l], ...redo[l]])].sort();
  return {
    version: 1,
    $comment: REDO_COMMENT,
    sources: [...new Set([...old.sources, source])],
    redo: merged,
  };
}
