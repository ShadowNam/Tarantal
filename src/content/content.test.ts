import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContent, type RawContent } from './bundle';
import { checkCrossRefs } from './crossRefs';
import { readContentDir, readI18nKeys } from './loadNode';
import { CharmEffectSchema, CONTENT_FILES } from './schemas';

const root = join(import.meta.dirname, '..', '..');
const raw = readContentDir(join(root, 'content'));
const i18nKeys = readI18nKeys(join(root, 'src/i18n/en.json'));

/** Deep copy so tests can corrupt content without touching the shared fixture. */
function clone(): { files: Record<string, unknown>; biomes: Record<string, unknown> } {
  return structuredClone({ files: { ...raw.files }, biomes: { ...raw.biomes } });
}

function parseOk(content: RawContent) {
  const result = parseContent(content);
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.bundle;
}

// Minimal typed accessors into the raw JSON used by the corruption tests.
type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => v as Json;
const asArr = (v: unknown): Json[] => v as Json[];

describe('content schemas', () => {
  it('accept every file currently in content/', () => {
    const result = parseContent(raw);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('cover every top-level content file', () => {
    expect(Object.keys(raw.files).sort()).toEqual(Object.keys(CONTENT_FILES).sort());
  });

  it('reject unknown keys', () => {
    const c = clone();
    asObj(c.files['scoring.json'])['bogus'] = 1;
    const result = parseContent(c);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.file === 'scoring.json' && /bogus/.test(e.message))).toBe(true);
  });

  it('allow $comment keys', () => {
    const c = clone();
    asObj(c.files['run.json'])['$comment'] = 'notes are fine';
    expect(parseContent(c).ok).toBe(true);
  });

  it('reject an unknown charm trigger, condition or action', () => {
    expect(CharmEffectSchema.safeParse({ on: 'bagg', do: { addMult: 1 } }).success).toBe(false);
    expect(
      CharmEffectSchema.safeParse({ on: 'bag', if: { planee: ['far'] }, do: { addMult: 1 } }).success,
    ).toBe(false);
    expect(CharmEffectSchema.safeParse({ on: 'bag', do: { addMultt: 1 } }).success).toBe(false);
    expect(CharmEffectSchema.safeParse({ on: 'bag', do: {} }).success).toBe(false);
  });

  it('accept the parametrised triggers', () => {
    for (const on of ['tick:every:720', 'timeLeft:10', 'timeLeft:2.5']) {
      expect(CharmEffectSchema.safeParse({ on, do: { addMult: 1 } }).success).toBe(true);
    }
    for (const on of ['tick:every:0', 'tick:every:x', 'timeLeft:']) {
      expect(CharmEffectSchema.safeParse({ on, do: { addMult: 1 } }).success).toBe(false);
    }
  });

  it('reject an unknown world event id', () => {
    const c = clone();
    const biome = asObj(c.biomes['biomes/karoo-autumn.json']);
    const firstEvent = asArr(biome['events'])[0];
    if (firstEvent) firstEvent['id'] = 'meteorShower';
    expect(parseContent(c).ok).toBe(false);
  });

  it('reject windows outside 0..1 and reversed ranges', () => {
    const c = clone();
    const crates = asObj(asObj(c.files['powerups.json'])['crates']);
    crates['windows'] = [[0.5, 1.2]];
    expect(parseContent(c).ok).toBe(false);
    const d = clone();
    const flock = asObj(asObj(d.files['birds.json'])['flockDefaults']);
    flock['alertMs'] = [1200, 600];
    expect(parseContent(d).ok).toBe(false);
  });

  it('reject a boss rule that flashes more than 3 times per second', () => {
    const c = clone();
    const rules = asObj(asObj(c.files['run.json'])['bossRules']);
    asObj(rules['darkExceptLightning'])['maxFlashesPerSecond'] = 4;
    expect(parseContent(c).ok).toBe(false);
  });
});

describe('content cross-references', () => {
  it('pass for the current content with only deferred-content warnings', () => {
    const report = checkCrossRefs(parseOk(raw), { i18nKeys });
    expect(report.errors).toEqual([]);
    const text = report.warnings.map((w) => w.message).join('\n');
    expect(text).toMatch(/bushveld-winter/);
    expect(text).toMatch(/bag_50_far/);
    expect(text).toMatch(/farmDog/);
  });

  it('turn warnings into errors with strict', () => {
    const report = checkCrossRefs(parseOk(raw), { i18nKeys, strict: true });
    expect(report.warnings).toEqual([]);
    expect(report.errors.some((e) => /bushveld-winter/.test(e.message))).toBe(true);
  });

  it('catch a biome that spawns an unknown creature', () => {
    const c = clone();
    const biome = asObj(c.biomes['biomes/karoo-autumn.json']);
    const first = asArr(biome['spawnTable'])[0];
    if (first) first['creature'] = 'pelikaan';
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /pelikaan/.test(e.message))).toBe(true);
  });

  it('catch a season whose boss is not a boss', () => {
    const c = clone();
    const first = asArr(asObj(c.files['run.json'])['seasons'])[0];
    if (first) first['boss'] = 'tarentaal';
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /boss "tarentaal" is not a boss/.test(e.message))).toBe(true);
  });

  it('catch a crate entry that is not a crate weapon', () => {
    const c = clone();
    const table = asArr(asObj(asObj(c.files['powerups.json'])['crates'])['table']);
    table.push({ id: 'dubbelloop', weight: 1, type: 'weapon' });
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /dubbelloop/.test(e.message))).toBe(true);
  });

  it('catch a charm that replaces an unknown gadget', () => {
    const c = clone();
    const charms = asArr(asObj(c.files['charms.json'])['charms']);
    const fluitjie = charms.find((x) => x['id'] === 'fluitjie');
    if (fluitjie) fluitjie['gadget'] = { replaces: 'toeter', cooldownMs: 6000 };
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /toeter/.test(e.message))).toBe(true);
  });

  it('catch duplicate ids', () => {
    const c = clone();
    const charms = asArr(asObj(c.files['charms.json'])['charms']);
    const first = charms[0];
    if (first) charms.push(structuredClone(first));
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /duplicate charm id/.test(e.message))).toBe(true);
  });
});
