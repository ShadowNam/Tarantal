import { describe, expect, it } from 'vitest';
import { loadContent, loadFeel } from '../../../../tools/testContent';
import { RaidActionSchema } from '../../../content/schemas';
import { LANGUAGES } from '../../../i18n/i18n';
import { voicedKeys } from '../../audio/voicedKeys';
import {
  checkTokens,
  collectLines,
  currentOf,
  editMap,
  exportEdits,
  exportFileName,
  filterLines,
  LINE_GROUPS,
  withEdit,
  withoutEdit,
  type LineFilter,
} from './textLines';
import { SAY_DATA, TEXT_TABLE_DATA } from './textTables';

const content = loadContent();
const voiced = voicedKeys(content, loadFeel().barks, RaidActionSchema.options);
const lines = collectLines(TEXT_TABLE_DATA, voiced.group, SAY_DATA);
const byId = new Map(lines.map((l) => [l.id, l]));
const all: LineFilter = { query: '', voicedOnly: false, changedOnly: false, group: null };

describe('collectLines', () => {
  it('lists every key of every table once', () => {
    const t = TEXT_TABLE_DATA;
    const n =
      Object.keys(t.main.en).length +
      Object.keys(t.guide.en).length +
      Object.keys(t.braai.en).length +
      Object.keys(t.privacy.en).length +
      Object.keys(t.graphics.en).length +
      new Set(
        [...Object.keys(t.names.en ?? {}), ...Object.keys(t.names.de ?? {})].concat(
          Object.keys(t.names.nl ?? {}),
        ),
      ).size;
    expect(lines.length).toBe(n);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(lines.length).toBeGreaterThan(900);
  });

  it('marks every voiced key voiced exactly once, in its voice group', () => {
    const v = lines.filter((l) => l.voiced);
    expect(v.map((l) => l.key).sort()).toEqual([...voiced.all].sort());
    for (const l of v) expect(l.group).toBe(voiced.group.get(l.key));
    expect(byId.get('braai|braai.say.open_none')?.group).toBe('braai');
    expect(byId.get('main|bark.spook_start')?.group).toBe('special');
    expect(byId.get('main|bark.xmas_start')?.group).toBe('special');
    expect(byId.get('guide|guide.brakkie.scold')?.group).toBe('oupa');
    expect(byId.get('guide|guide.cameo.scold')?.voiced).toBe(true);
    // The Afrikaans-names wording is never the spoken line.
    expect(lines.some((l) => l.table === 'names' && l.voiced)).toBe(false);
  });

  it('puts the other lines in their groups, groups in list order', () => {
    expect(byId.get('braai|braai.open_none')?.group).toBe('braai');
    expect(byId.get('privacy|privacy.body_intro')?.group ?? 'privacy').toBe('privacy');
    expect(lines.filter((l) => l.table === 'privacy').every((l) => l.group === 'privacy')).toBe(
      true,
    );
    expect(byId.get('guide|guide.effect.slow')?.group ?? 'guide').toBe('guide');
    expect(byId.get('main|title.shed')?.group ?? 'hunt').toBe('hunt');
    const ranks = lines.map((l) => LINE_GROUPS.indexOf(l.group));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const g of LINE_GROUPS) expect(lines.some((l) => l.group === g)).toBe(true);
  });

  it('shows the voice tool’s `say` lines on the voiced line', () => {
    const w = byId.get('main|bark.weavers');
    expect(w?.voiced).toBe(true);
    expect(w?.say.en).toBe(SAY_DATA.en?.['bark.weavers']);
    expect(w?.say.de).toBeDefined();
    expect(byId.get('main|bark.sign')?.say.de).toBe(SAY_DATA.de?.['bark.sign']);
  });

  it('has the text in all four languages for the main tables', () => {
    for (const l of lines.filter((x) => x.table === 'main'))
      for (const lang of LANGUAGES) expect(l.text[lang]).toBeTypeOf('string');
  });
});

describe('checkTokens', () => {
  it('accepts an edit that keeps the placeholders in any order', () => {
    expect(checkTokens('{n} of {total}', 'Total {total}, now {n}').ok).toBe(true);
    expect(checkTokens('Plain', 'Still plain').ok).toBe(true);
  });
  it('names a dropped or added placeholder', () => {
    expect(checkTokens('{n} birds', 'birds')).toEqual({ ok: false, missing: ['{n}'], extra: [] });
    expect(checkTokens('{n} birds', '{n} {x} birds')).toEqual({
      ok: false,
      missing: [],
      extra: ['{x}'],
    });
    expect(checkTokens('{n} and {n}', '{n} once').missing).toEqual(['{n}']);
    expect(checkTokens('one line', 'two\nlines').extra).toEqual(['\n']);
  });
});

describe('edits', () => {
  const line = lines.find((l) => l.key === 'title.shed') ?? lines[0];
  if (line === undefined) throw new Error('no lines');

  it('stores an edit with its original, and drops it when edited back', () => {
    const e1 = withEdit([], line, 'af', 'text', 'Wapenskuur nou');
    expect(e1).toEqual([
      {
        table: line.table,
        key: line.key,
        lang: 'af',
        field: 'text',
        from: line.text.af,
        to: 'Wapenskuur nou',
      },
    ]);
    expect(currentOf(line, 'af', 'text', editMap(e1))).toBe('Wapenskuur nou');
    expect(currentOf(line, 'en', 'text', editMap(e1))).toBe(line.text.en);
    const e2 = withEdit(e1, line, 'af', 'text', 'Speel weer');
    expect(e2).toHaveLength(1);
    expect(e2[0]?.to).toBe('Speel weer');
    expect(withEdit(e2, line, 'af', 'text', line.text.af ?? '')).toEqual([]);
    expect(withoutEdit(e2, line, 'af', 'text')).toEqual([]);
  });

  it('a `say` edit of a line without one starts from an empty original', () => {
    const v = lines.find((l) => l.voiced && l.say.en === undefined);
    if (v === undefined) throw new Error('no voiced line without say');
    expect(withEdit([], v, 'en', 'say', 'spoken so')[0]?.from).toBe('');
  });

  it('filters by key or text in any language, voiced, changed and group', () => {
    const edits = editMap(withEdit([], line, 'nl', 'text', 'Zzqx-unique'));
    expect(filterLines(lines, { ...all, query: 'TITLE.SHED' }, edits).map((l) => l.key)).toContain(
      'title.shed',
    );
    expect(filterLines(lines, { ...all, query: 'zzqx-unique' }, edits)).toEqual([line]);
    expect(filterLines(lines, { ...all, changedOnly: true }, edits)).toEqual([line]);
    expect(filterLines(lines, { ...all, voicedOnly: true }, edits).every((l) => l.voiced)).toBe(
      true,
    );
    expect(
      filterLines(lines, { ...all, group: 'privacy' }, edits).every((l) => l.group === 'privacy'),
    ).toBe(true);
    // Every German word is searchable too.
    const de = line.text.de ?? '';
    expect(filterLines(lines, { ...all, query: de }, edits)).toContain(line);
  });
});

describe('exportEdits', () => {
  it('writes the corrections file format, in list order', () => {
    const w = byId.get('main|bark.weavers');
    const t = lines.find((l) => l.key === 'title.shed');
    if (w === undefined || t === undefined) throw new Error('lines missing');
    let edits = withEdit([], t, 'de', 'text', 'Los!');
    edits = withEdit(edits, w, 'en', 'say', '/tsː/ Off our nest!');
    edits = withEdit(edits, w, 'en', 'text', 'Tsk! Off our nest!');
    const out = exportEdits(
      lines,
      edits,
      { version: '1.18.0', commit: 'abc1234' },
      '2026-11-08T14:05:00.000Z',
    );
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('2026-11-08T14:05:00.000Z');
    expect(out.build).toEqual({ version: '1.18.0', commit: 'abc1234' });
    expect(out.edits[0]).toEqual({
      key: 'bark.weavers',
      table: 'main',
      lang: 'en',
      from: w.text.en,
      to: 'Tsk! Off our nest!',
      voiced: true,
      field: 'text',
    });
    expect(out.edits[1]).toMatchObject({ key: 'bark.weavers', field: 'say', voiced: true });
    expect(out.edits[2]).toMatchObject({ key: 'title.shed', lang: 'de', voiced: false });
    expect(Object.keys(out.edits[0] ?? {}).sort()).toEqual([
      'field',
      'from',
      'key',
      'lang',
      'table',
      'to',
      'voiced',
    ]);
    expect(exportFileName(out.exportedAt)).toBe('tarantal-text-edits-2026-11-08-1405.json');
  });
});
