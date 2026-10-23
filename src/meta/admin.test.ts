import { beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import {
  ADMIN_SAVE_KEY,
  ISSUE_URL_MAX,
  adminEntries,
  adminReport,
  emptyAdminSave,
  issueUrl,
  loadAdminSave,
  reviewOf,
  storeAdminSave,
  withReview,
  type EntryFacts,
  type ReportContext,
} from './admin';
import { readText, resetStorageForTests, setStorageNamespace, writeText } from './storage';

const content = loadContent();
const playable = content.biomes.map((b) => b.id);

const facts = (id: string, label = id): EntryFacts => ({
  id,
  label,
  mode: 'classic',
  gun: 'dubbelloop',
  seed: '42',
});
const where: ReportContext = {
  build: 'abc1234',
  device: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)',
  viewport: '915×412 @2.6x',
};

describe('admin entries (D-034)', () => {
  const entries = adminEntries(content, playable);
  const ids = entries.map((e) => e.id);

  it('lists every biome plain, Mon…Sun and Verder, the Daily and every Season Run hunt', () => {
    for (const b of content.biomes) {
      expect(ids).toContain(`classic:${b.id}:plain`);
      for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
        expect(ids).toContain(`classic:${b.id}:${d}`);
      for (const m of b.bonusMaps) expect(ids).toContain(`classic:${b.id}:${m.id}`);
    }
    expect(ids).toContain('daily');
    const runHunts = content.run.seasons.length * content.run.huntPattern.length;
    expect(entries.filter((e) => e.kind === 'season')).toHaveLength(runHunts);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads the maps from content, so a new bonus map appears on its own', () => {
    const extra = {
      ...content,
      biomes: content.biomes.map((b, i) =>
        i === 0 ? { ...b, bonusMaps: [...b.bonusMaps, { ...b.bonusMaps[0], id: 'nogverder' }] } : b,
      ),
    } as typeof content;
    const first = content.biomes[0]?.id ?? '';
    expect(adminEntries(extra, playable).map((e) => e.id)).toContain(`classic:${first}:nogverder`);
  });

  it('season entries carry the run hunt index and stage', () => {
    const s = entries.find((e) => e.id === 'season:winter:3');
    expect(s?.huntIndex).toBe(content.run.huntPattern.length + 2);
    expect(s?.stage).toBe('boss');
    expect(s?.biome).toBe('bushveld-winter');
  });

  it('leaves out biomes this build cannot draw', () => {
    const only = adminEntries(content, ['karoo-autumn']);
    expect(only.some((e) => e.biome === 'okavango-spring')).toBe(false);
    expect(only.some((e) => e.id === 'season:herfs:1')).toBe(true);
  });
});

describe('admin save (D-034)', () => {
  beforeEach(() => {
    resetStorageForTests();
    setStorageNamespace('admin.');
  });

  it('round-trips through storage.ts under its own key', () => {
    let s = emptyAdminSave();
    s = withReview(s, 'classic:karoo-autumn:fri', { status: 'work', rating: 3, notes: 'too dark' });
    storeAdminSave(s);
    expect(readText(ADMIN_SAVE_KEY)).toContain('too dark');
    const back = loadAdminSave();
    expect(reviewOf(back, 'classic:karoo-autumn:fri')).toEqual({
      status: 'work',
      rating: 3,
      notes: 'too dark',
    });
    expect(reviewOf(back, 'daily')).toEqual({ status: 'none', rating: 0, notes: '' });
  });

  it('never shares the player save', () => {
    storeAdminSave(withReview(emptyAdminSave(), 'daily', { status: 'ok' }));
    resetStorageForTests(); // back to the plain `tm.` prefix, memory cleared
    expect(readText(ADMIN_SAVE_KEY)).toBeNull();
  });

  it('a damaged save falls back to an empty one', () => {
    writeText(ADMIN_SAVE_KEY, '{"v":1,"reviews":{"x":{"status":"maybe"}}}');
    expect(loadAdminSave()).toEqual(emptyAdminSave());
    writeText(ADMIN_SAVE_KEY, 'not json');
    expect(loadAdminSave()).toEqual(emptyAdminSave());
  });

  it('an untouched review is dropped; notes are capped', () => {
    let s = withReview(emptyAdminSave(), 'daily', { rating: 4 });
    expect(s.reviews['daily']).toBeDefined();
    s = withReview(s, 'daily', { rating: 0 });
    expect(s.reviews['daily']).toBeUndefined();
    s = withReview(s, 'daily', { notes: 'x'.repeat(10_000) });
    expect(reviewOf(s, 'daily').notes).toHaveLength(4000);
  });

  it('keeps the options and the pending play', () => {
    const s = {
      ...emptyAdminSave(),
      options: { ...emptyAdminSave().options, seed: 42, huntSeconds: 15, event: 'hadeda' },
      play: { entry: 'daily', options: { ...emptyAdminSave().options, date: '2026-10-23' } },
    };
    storeAdminSave(s);
    expect(loadAdminSave()).toEqual(s);
  });
});

describe('issue URL (D-034)', () => {
  const review = { status: 'work' as const, rating: 2, notes: 'The farmhouse is cut off.' };

  it('opens a prefilled new issue with the playtest label and every fact', () => {
    const url = issueUrl(facts('classic:karoo-autumn:fri', 'Karoo · Friday'), review, where);
    expect(
      url.startsWith('https://github.com/ShadowNam/Tarantal/issues/new?labels=playtest&'),
    ).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('labels')).toBe('playtest');
    expect(q.get('title')).toBe('[playtest] Karoo · Friday — needs work (2/5)');
    const body = q.get('body') ?? '';
    for (const s of [
      'classic:karoo-autumn:fri',
      'classic',
      'dubbelloop',
      '42',
      'abc1234',
      'Pixel 7',
      '915×412',
      'The farmhouse is cut off.',
    ])
      expect(body).toContain(s);
  });

  it('cuts long notes so the URL stays under ~7 KB', () => {
    const long = { ...review, notes: 'Ån ëmoji 🐦 and more. '.repeat(800) };
    const url = issueUrl(facts('daily'), long, where);
    expect(url.length).toBeLessThanOrEqual(ISSUE_URL_MAX);
    expect(url.length).toBeGreaterThan(ISSUE_URL_MAX - 200);
    expect(new URL(url).searchParams.get('body')).toContain('(cut, see the report)');
  });

  it('short notes are not cut', () => {
    expect(new URL(issueUrl(facts('daily'), review, where)).searchParams.get('body')).not.toContain(
      '(cut, see the report)',
    );
  });
});

describe('copy report (D-034)', () => {
  it('lists the reviewed entries in list order with their notes', () => {
    let s = emptyAdminSave();
    s = withReview(s, 'b', { status: 'ok', rating: 5 });
    s = withReview(s, 'a', { status: 'work', notes: 'line one\nline two' });
    const md = adminReport(s, [facts('a', 'Map A'), facts('b', 'Map B'), facts('c')], where);
    expect(md).toContain('2 of 3 maps reviewed.');
    expect(md.indexOf('Map A')).toBeLessThan(md.indexOf('Map B'));
    expect(md).toContain('> line one\n> line two');
    expect(md).toContain('**OK** · rating ★★★★★');
    expect(md).not.toContain('`c`');
  });

  it('says so when there are no notes', () => {
    expect(adminReport(emptyAdminSave(), [facts('a')], where)).toContain('_No notes yet._');
  });
});
