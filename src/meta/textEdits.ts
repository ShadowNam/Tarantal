// v1.14 (D-076): the owner's text corrections from the admin page's "Texts & voices" tab. They are
// kept on this device only (storage.ts, key `textEdits.v1` in the device-wide namespace, so the
// admin page and the game share them), never in the save file and never sent anywhere: the owner
// exports them as a file (admin → Download / Copy / Share) and `npm run text:apply` writes them
// into the tables. With "Use my edits in the game" on, the text edits replace the tables' text on
// this device (i18n overrides); `say` edits only change what the voice tool will speak.
// This module is in the first download (boot applies the edits), so it stays small: the tab (a lazy
// chunk) imports only its types and gets load / store from the admin scene (TextsPanelDeps.edits),
// so the bundler never splits storage.ts out of the entry chunk.
import {
  LANGUAGES,
  TEXT_TABLES,
  VOICE_LANGUAGES,
  setTextOverrides,
  type Language,
  type TextOverrides,
  type TextTable,
} from '../i18n/i18n';
import { onDevice, readValue, writeValue } from './storage';

export const TEXT_EDITS_KEY = 'textEdits.v1';

export type TextField = 'text' | 'say';

export interface TextEdit {
  readonly table: TextTable;
  readonly key: string;
  readonly lang: Language;
  /** `text`: the line itself · `say`: how the voice tool speaks it (voice.config.json). */
  readonly field: TextField;
  /** The text when the edit was made (the apply tool refuses an edit whose `from` changed). */
  readonly from: string;
  readonly to: string;
}

export interface TextEditStore {
  readonly version: 1;
  /** "Use my edits in the game" (off by default). */
  readonly apply: boolean;
  readonly edits: readonly TextEdit[];
}

export const EMPTY_TEXT_EDITS: TextEditStore = { version: 1, apply: false, edits: [] };

const str = (v: unknown): v is string => typeof v === 'string';
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  str(v) && (list as readonly string[]).includes(v);

export function isTextEdit(v: unknown): v is TextEdit {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    oneOf(TEXT_TABLES, e['table']) &&
    str(e['key']) &&
    e['key'] !== '' &&
    (e['field'] === 'say' ? oneOf(VOICE_LANGUAGES, e['lang']) : e['field'] === 'text') &&
    oneOf(LANGUAGES, e['lang']) &&
    str(e['from']) &&
    str(e['to'])
  );
}

/** The store's shell (each edit is checked on its own: one bad edit never loses the others). */
function isShell(v: unknown): v is { version: 1; apply: boolean; edits: unknown[] } {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return s['version'] === 1 && typeof s['apply'] === 'boolean' && Array.isArray(s['edits']);
}

export function loadTextEdits(): TextEditStore {
  const s = onDevice(() => readValue(TEXT_EDITS_KEY, null, isShell));
  return s === null
    ? EMPTY_TEXT_EDITS
    : { version: 1, apply: s.apply, edits: s.edits.filter(isTextEdit) };
}

export function storeTextEdits(s: TextEditStore): void {
  onDevice(() => {
    writeValue(TEXT_EDITS_KEY, s);
  });
}

/** The i18n overrides of a store's text edits (null when "Use my edits" is off or none). */
export function overridesOf(s: TextEditStore): TextOverrides | null {
  if (!s.apply) return null;
  const out: Record<string, Record<string, Record<string, string>>> = {};
  let n = 0;
  for (const e of s.edits) {
    if (e.field !== 'text') continue;
    ((out[e.table] ??= {})[e.lang] ??= {})[e.key] = e.to;
    n++;
  }
  return n === 0 ? null : out;
}

/** Boot and the admin tab: use the stored edits in the game when the owner turned that on. */
export function applyTextEdits(s: TextEditStore = loadTextEdits()): void {
  setTextOverrides(overridesOf(s));
}
