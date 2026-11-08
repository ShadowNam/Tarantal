import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyCorrections,
  CorrectionsSchema,
  fileOf,
  mergeRedo,
  REDO_PATH,
  VOICE_CONFIG,
  type Correction,
  type Corrections,
} from './textApply';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'text-apply');
const voiced = new Set(['bark.weavers', 'bark.miss', 'guide.brakkie.scold']);
let root = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'text-apply-'));
  cpSync(FIXTURES, root, { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const read = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, rel), 'utf8')) as Record<string, unknown>;
const raw = (rel: string): string => readFileSync(join(root, rel), 'utf8');

function file(edits: Partial<Correction>[]): Corrections {
  return CorrectionsSchema.parse({
    version: 1,
    exportedAt: '2026-11-08T14:05:00.000Z',
    build: { version: '1.18.0', commit: 'abc1234' },
    edits: edits.map((e) => ({ table: 'main', lang: 'en', field: 'text', voiced: false, ...e })),
  });
}

describe('fileOf', () => {
  it('maps each table and field to its file', () => {
    expect(fileOf({ table: 'main', lang: 'af', field: 'text' })).toBe('src/i18n/af.json');
    expect(fileOf({ table: 'guide', lang: 'de', field: 'text' })).toBe('src/i18n/guide/de.json');
    expect(fileOf({ table: 'braai', lang: 'nl', field: 'text' })).toBe('src/i18n/braai/nl.json');
    expect(fileOf({ table: 'privacy', lang: 'en', field: 'text' })).toBe(
      'src/i18n/privacy/en.json',
    );
    expect(fileOf({ table: 'names', lang: 'en', field: 'text' })).toBe(
      'src/i18n/flavour/afNames.json',
    );
    expect(fileOf({ table: 'main', lang: 'en', field: 'say' })).toBe(VOICE_CONFIG);
  });
});

describe('applyCorrections', () => {
  it('writes text and say edits into their files, keeping key order and layout', () => {
    const before = raw('src/i18n/en.json');
    const r = applyCorrections(
      root,
      file([
        { key: 'title.shed', from: 'Gun Shed', to: 'The Shed' },
        { key: 'guide.tip.slow', table: 'guide', from: 'Slow down.', to: 'Take it slow.' },
        { key: 'title.shed', table: 'names', from: 'Geweerskuur', to: 'Die Skuur' },
        { key: 'bark.miss', lang: 'af', field: 'say', from: '', to: 'Ag nee man!', voiced: true },
        {
          key: 'bark.weavers',
          field: 'say',
          from: '/tsː, tsː/ Leave our nest!',
          to: '',
          voiced: true,
        },
      ]),
      { forceRest: false, voiced },
    );
    expect(r.conflicts).toEqual([]);
    expect(r.applied).toHaveLength(5);
    expect(r.written).toEqual([
      'src/i18n/en.json',
      'src/i18n/flavour/afNames.json',
      'src/i18n/guide/en.json',
      VOICE_CONFIG,
    ]);
    expect(raw('src/i18n/en.json')).toBe(before.replace('"Gun Shed"', '"The Shed"'));
    expect(Object.keys(read('src/i18n/en.json'))).toEqual([
      'title.shed',
      'bark.weavers',
      'bark.miss',
      'hud.score',
    ]);
    expect(read('src/i18n/guide/en.json')['guide.tip.slow']).toBe('Take it slow.');
    expect(read('src/i18n/flavour/afNames.json')).toEqual({ en: { 'title.shed': 'Die Skuur' } });
    const say = read(VOICE_CONFIG)['say'] as Record<string, Record<string, string>>;
    // An emptied `say` is removed; a new one is added after the others.
    expect(say['en']).toEqual({});
    expect(say['af']).toEqual({
      'bark.weavers': '/tsː, tsː/ Los ons nes!',
      'bark.miss': 'Ag nee man!',
    });
    // Other parts of the voice config are untouched.
    expect(read(VOICE_CONFIG)['sampleRate']).toBe(22050);
    expect(raw('src/i18n/af.json')).toBe(readFileSync(join(FIXTURES, 'src/i18n/af.json'), 'utf8'));
  });

  it('skips an edit the files already have (last round’s corrections exported again)', () => {
    const f = file([
      { key: 'title.shed', from: 'Gun Shed', to: 'The Shed' },
      { key: 'bark.weavers', field: 'say', from: '/tsː, tsː/ Leave our nest!', to: '' },
    ]);
    const first = applyCorrections(root, f, { forceRest: false, voiced });
    expect(first.applied).toHaveLength(2);
    const again = applyCorrections(root, f, { forceRest: false, voiced });
    expect(again.conflicts).toEqual([]);
    expect(again.applied).toEqual([]);
    expect(again.already.map((e) => e.key)).toEqual(['title.shed', 'bark.weavers']);
    expect(again.written).toEqual([]);
    expect(again.redo).toEqual({ en: [], af: [], de: [] });
  });

  it('refuses everything when an edit’s `from` changed, unless --force-rest', () => {
    const edits = file([
      { key: 'title.shed', from: 'Gun Shed', to: 'The Shed' },
      { key: 'hud.score', from: '{n} pts', to: '{n} points!' },
      { key: 'no.such', from: 'x', to: 'y' },
      { key: 'bark.miss', lang: 'nl', field: 'say', from: '', to: 'x' },
    ]);
    const r = applyCorrections(root, edits, { forceRest: false, voiced });
    expect(r.applied).toEqual([]);
    expect(r.written).toEqual([]);
    expect(r.conflicts.map((c) => [c.edit.key, c.reason, c.now])).toEqual([
      ['hud.score', 'changed', '{n} points'],
      ['no.such', 'missing', null],
      ['bark.miss', 'not-voice-language', null],
    ]);
    expect(read('src/i18n/en.json')['title.shed']).toBe('Gun Shed');

    const f = applyCorrections(root, edits, { forceRest: true, voiced });
    expect(f.applied.map((e) => e.key)).toEqual(['title.shed']);
    expect(f.conflicts).toHaveLength(3);
    expect(read('src/i18n/en.json')['title.shed']).toBe('The Shed');
    expect(read('src/i18n/en.json')['hud.score']).toBe('{n} points');
  });

  it('refuses an edit that drops or adds a placeholder, or empties a line', () => {
    const r = applyCorrections(
      root,
      file([
        { key: 'hud.score', lang: 'af', from: '{n} punte', to: 'punte' },
        { key: 'hud.score', from: '{n} points', to: '{n} {x} points' },
        { key: 'title.shed', from: 'Gun Shed', to: '  ' },
        { key: 'title.shed', table: 'names', from: 'Geweerskuur', to: 'Skuur {n}' },
        { key: 'bark.miss', field: 'say', from: '', to: 'Ag nee {n}' },
      ]),
      { forceRest: true, voiced },
    );
    expect(r.applied).toEqual([]);
    expect(r.conflicts.map((c) => [c.edit.key, c.edit.table, c.reason])).toEqual([
      ['hud.score', 'main', 'placeholders'],
      ['hud.score', 'main', 'placeholders'],
      ['title.shed', 'main', 'empty'],
      ['title.shed', 'names', 'placeholders'],
      ['bark.miss', 'main', 'placeholders'],
    ]);
    expect(r.conflicts[0]?.missing).toEqual(['{n}']);
    expect(r.conflicts[1]?.extra).toEqual(['{x}']);
    expect(read('src/i18n/af.json')['hud.score']).toBe('{n} punte');
  });

  it('a dry run writes nothing', () => {
    const r = applyCorrections(root, file([{ key: 'title.shed', from: 'Gun Shed', to: 'X' }]), {
      forceRest: false,
      voiced,
      dryRun: true,
    });
    expect(r.applied).toHaveLength(1);
    expect(read('src/i18n/en.json')['title.shed']).toBe('Gun Shed');
  });
});

describe('redo list', () => {
  it('lists the voiced keys whose spoken text changed, per voice language', () => {
    const r = applyCorrections(
      root,
      file([
        // Spoken as its `say` line in en: a text edit changes nothing Oupa says.
        { key: 'bark.weavers', from: 'Tsk-tsk-tsk! Leave our nest!', to: 'Tsk! Off our nest!' },
        { key: 'bark.miss', from: 'Ag nee, man!', to: 'Ag nee!' },
        { key: 'bark.miss', lang: 'nl', from: 'Ag nee, man!', to: 'Ach nee!' },
        {
          key: 'bark.weavers',
          lang: 'af',
          field: 'say',
          from: '/tsː, tsː/ Los ons nes!',
          to: 'Los!',
        },
        { key: 'guide.brakkie.scold', table: 'guide', from: 'Not the dog!', to: 'Not Brakkie!' },
        // Not voiced.
        { key: 'title.shed', from: 'Gun Shed', to: 'The Shed' },
      ]),
      { forceRest: false, voiced },
    );
    expect(r.redo).toEqual({
      en: ['bark.miss', 'guide.brakkie.scold'],
      af: ['bark.weavers'],
      de: [],
    });
  });

  it('adds to an existing redo.json until the voices job empties it', () => {
    const path = join(root, REDO_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        $comment: '',
        sources: ['a.json'],
        redo: { en: ['bark.x'], af: [], de: [] },
      }),
    );
    const m = mergeRedo(root, 'b.json', { en: ['bark.miss', 'bark.x'], af: ['bark.y'], de: [] });
    expect(m.sources).toEqual(['a.json', 'b.json']);
    expect(m.redo).toEqual({ en: ['bark.miss', 'bark.x'], af: ['bark.y'], de: [] });
    rmSync(path);
    expect(mergeRedo(root, 'c.json', { en: [], af: [], de: ['bark.z'] }).sources).toEqual([
      'c.json',
    ]);
  });
});
