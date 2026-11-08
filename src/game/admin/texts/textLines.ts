// v1.14 (D-076): the admin page's "Texts & voices" list, pure: every player-facing line of the
// text tables in en/af/de/nl, its group, whether Oupa speaks it (and in which voice languages),
// how the voice tool speaks it (voice.config.json `say`), the placeholder check for an edit, the
// edits applied over the tables, and the export file. No DOM: TextsPanel.ts draws it.
import {
  LANGUAGES,
  VOICE_LANGUAGES,
  type Language,
  type TextTable,
  type VoiceLanguage,
} from '../../../i18n/i18n';
import { editId, type TextEdit, type TextField } from '../../../meta/textEdits';
import type { VoicedGroup } from '../../audio/voicedKeys';

/** The tab's groups, in list order. */
export const LINE_GROUPS = ['oupa', 'braai', 'special', 'hunt', 'guide', 'privacy'] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];

type Table = Readonly<Record<string, string>>;
export interface TextTables {
  readonly main: Readonly<Record<Language, Table>>;
  readonly guide: Readonly<Record<Language, Table>>;
  readonly braai: Readonly<Record<Language, Table>>;
  readonly privacy: Readonly<Record<Language, Table>>;
  readonly graphics: Readonly<Record<Language, Table>>;
  /** The Afrikaans-names wording (src/i18n/flavour/afNames.json): en, de, nl. */
  readonly names: Readonly<Partial<Record<Language, Table>>>;
}

/** voice.config.json `say`: how the voice tool speaks a line, per voice language. */
export type SayTable = Readonly<Partial<Record<VoiceLanguage, Table>>>;

export interface TextLine {
  /** `table|key`, unique. */
  readonly id: string;
  readonly table: TextTable;
  readonly key: string;
  readonly group: LineGroup;
  /** Oupa (or a creature) speaks it: a clip per voice language. */
  readonly voiced: boolean;
  /** The table's text per language (undefined: this table has none in that language). */
  readonly text: Readonly<Partial<Record<Language, string>>>;
  /** voice.config.json `say` overrides of this line. */
  readonly say: Readonly<Partial<Record<VoiceLanguage, string>>>;
}

/** The order the tables are listed in within a group. */
const TABLE_ORDER: readonly TextTable[] = [
  'main',
  'guide',
  'braai',
  'graphics',
  'privacy',
  'names',
];

function groupOf(table: TextTable, key: string, voiced: VoicedGroup | undefined): LineGroup {
  if (voiced !== undefined) return voiced;
  if (table === 'braai') return 'braai';
  if (table === 'privacy' || key.startsWith('privacy.')) return 'privacy';
  if (table === 'guide' || /^(journal|notaboek|guide)\./.test(key)) return 'guide';
  if (key.startsWith('feesdag.')) return 'special';
  return 'hunt';
}

/**
 * Every line of the tables. A voiced key is voiced in the table the voice tool reads its text from
 * (the main tables first, then braai, then guide: tools/audio/voice.ts).
 */
export function collectLines(
  tables: TextTables,
  voiced: ReadonlyMap<string, VoicedGroup>,
  say: SayTable,
): TextLine[] {
  const spokenFrom = (key: string): TextTable | null =>
    !voiced.has(key)
      ? null
      : key in tables.main.en
        ? 'main'
        : key in tables.braai.en
          ? 'braai'
          : key in tables.guide.en
            ? 'guide'
            : null;
  const out: TextLine[] = [];
  for (const table of TABLE_ORDER) {
    const byLang = tables[table];
    const keys = new Set<string>();
    for (const lang of LANGUAGES) for (const k of Object.keys(byLang[lang] ?? {})) keys.add(k);
    for (const key of keys) {
      const isVoiced = table !== 'names' && spokenFrom(key) === table;
      const text: Partial<Record<Language, string>> = {};
      for (const lang of LANGUAGES) {
        const v = byLang[lang]?.[key];
        if (v !== undefined) text[lang] = v;
      }
      const s: Partial<Record<VoiceLanguage, string>> = {};
      if (isVoiced)
        for (const lang of VOICE_LANGUAGES) {
          const v = say[lang]?.[key];
          if (v !== undefined) s[lang] = v;
        }
      out.push({
        id: `${table}|${key}`,
        table,
        key,
        group: groupOf(table, key, isVoiced ? voiced.get(key) : undefined),
        voiced: isVoiced,
        text,
        say: s,
      });
    }
  }
  const rank = (g: LineGroup): number => LINE_GROUPS.indexOf(g);
  // Stable: within a group the tables keep TABLE_ORDER and each table its key order.
  return out
    .map((l, i) => ({ l, i }))
    .sort((a, b) => rank(a.l.group) - rank(b.l.group) || a.i - b.i)
    .map((x) => x.l);
}

/** The original value of one field of a line (a `say` without an override is ''). */
export function originalOf(line: TextLine, lang: Language, field: TextField): string {
  if (field === 'say')
    return (VOICE_LANGUAGES as readonly string[]).includes(lang)
      ? (line.say[lang as VoiceLanguage] ?? '')
      : '';
  return line.text[lang] ?? '';
}

// --- placeholders -------------------------------------------------------------------------------

/** `{name}` placeholders and line breaks, the parts an edit must keep. */
const TOKEN = /\{\w+\}|\n/g;

/** The placeholders (and line breaks) of a text, sorted. */
export function tokensOf(text: string): string[] {
  return (text.match(TOKEN) ?? []).sort();
}

export interface TokenCheck {
  readonly ok: boolean;
  /** In the original but not the edit. */
  readonly missing: readonly string[];
  /** In the edit but not the original. */
  readonly extra: readonly string[];
}

/** Whether an edit keeps exactly the original's placeholders (each as often). */
export function checkTokens(original: string, edited: string): TokenCheck {
  const left = tokensOf(original);
  const extra: string[] = [];
  for (const t of tokensOf(edited)) {
    const i = left.indexOf(t);
    if (i >= 0) left.splice(i, 1);
    else extra.push(t);
  }
  return { ok: left.length === 0 && extra.length === 0, missing: left, extra };
}

// --- edits over the lines -------------------------------------------------------------------------

export type EditMap = ReadonlyMap<string, TextEdit>;

export function editMap(edits: readonly TextEdit[]): Map<string, TextEdit> {
  return new Map(edits.map((e) => [editId(e), e]));
}

/** The value shown for one field: the edit's, else the original. */
export function currentOf(
  line: TextLine,
  lang: Language,
  field: TextField,
  edits: EditMap,
): string {
  return (
    edits.get(editId({ table: line.table, key: line.key, lang, field }))?.to ??
    originalOf(line, lang, field)
  );
}

/** The edits list with one field set to `to` (an edit back to the original removes it). */
export function withEdit(
  edits: readonly TextEdit[],
  line: TextLine,
  lang: Language,
  field: TextField,
  to: string,
): TextEdit[] {
  const id = editId({ table: line.table, key: line.key, lang, field });
  const from = originalOf(line, lang, field);
  const rest = edits.filter((e) => editId(e) !== id);
  return to === from
    ? rest
    : [...rest, { table: line.table, key: line.key, lang, field, from, to }];
}

/** The edits list without any edit of one field (Revert to original). */
export function withoutEdit(
  edits: readonly TextEdit[],
  line: TextLine,
  lang: Language,
  field: TextField,
): TextEdit[] {
  const id = editId({ table: line.table, key: line.key, lang, field });
  return edits.filter((e) => editId(e) !== id);
}

// --- search and filters ---------------------------------------------------------------------------

export interface LineFilter {
  /** Matched against the key and the text (original or edited) in any language, ignoring case. */
  readonly query: string;
  readonly voicedOnly: boolean;
  readonly changedOnly: boolean;
  /** One group, or null for all. */
  readonly group: LineGroup | null;
}

/** True when a line has any edit. */
export function isChanged(line: TextLine, edits: EditMap): boolean {
  for (const lang of LANGUAGES)
    for (const field of ['text', 'say'] as const)
      if (edits.has(editId({ table: line.table, key: line.key, lang, field }))) return true;
  return false;
}

export function filterLines(lines: readonly TextLine[], f: LineFilter, edits: EditMap): TextLine[] {
  const q = f.query.trim().toLowerCase();
  return lines.filter((l) => {
    if (f.group !== null && l.group !== f.group) return false;
    if (f.voicedOnly && !l.voiced) return false;
    if (f.changedOnly && !isChanged(l, edits)) return false;
    if (q === '') return true;
    if (l.key.toLowerCase().includes(q)) return true;
    for (const lang of LANGUAGES) {
      if (currentOf(l, lang, 'text', edits).toLowerCase().includes(q)) return true;
      if (originalOf(l, lang, 'text').toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

// --- export ---------------------------------------------------------------------------------------

export interface ExportEdit {
  readonly key: string;
  readonly table: TextTable;
  readonly lang: Language;
  readonly from: string;
  readonly to: string;
  readonly voiced: boolean;
  readonly field: TextField;
}

export interface TextExport {
  readonly version: 1;
  readonly exportedAt: string;
  readonly build: { readonly version: string; readonly commit: string };
  readonly edits: readonly ExportEdit[];
}

/** The corrections file (`npm run text:apply` reads it), edits in list order. */
export function exportEdits(
  lines: readonly TextLine[],
  edits: readonly TextEdit[],
  build: { readonly version: string; readonly commit: string },
  exportedAt: string,
): TextExport {
  const order = new Map(lines.map((l, i) => [l.id, i]));
  const voiced = new Map(lines.map((l) => [l.id, l.voiced]));
  const langRank = (l: Language): number => LANGUAGES.indexOf(l);
  const sorted = [...edits].sort(
    (a, b) =>
      (order.get(`${a.table}|${a.key}`) ?? 1e9) - (order.get(`${b.table}|${b.key}`) ?? 1e9) ||
      langRank(a.lang) - langRank(b.lang) ||
      (a.field === b.field ? 0 : a.field === 'text' ? -1 : 1),
  );
  return {
    version: 1,
    exportedAt,
    build,
    edits: sorted.map((e) => ({
      key: e.key,
      table: e.table,
      lang: e.lang,
      from: e.from,
      to: e.to,
      voiced: voiced.get(`${e.table}|${e.key}`) ?? false,
      field: e.field,
    })),
  };
}

/** The corrections file's name, e.g. `tarantal-text-edits-2026-11-08-1405.json`. */
export function exportFileName(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return `tarantal-text-edits-${m === null ? 'export' : `${m[1] ?? ''}-${m[2] ?? ''}${m[3] ?? ''}`}.json`;
}
