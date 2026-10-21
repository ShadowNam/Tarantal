import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContent, type RawContent } from './bundle';
import { checkCrossRefs } from './crossRefs';
import { readContentDir, readI18nKeys } from './loadNode';
import { CharmEffectSchema, CONTENT_FILES } from './schemas';
import { loadNotaboek } from '../../tools/testContent';

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

  it('allow $comment on nested objects too', () => {
    const c = clone();
    const biome = asObj(c.biomes['biomes/karoo-autumn.json']);
    const firstProp = asArr(biome['props'])[0];
    if (firstProp) firstProp['$comment'] = 'windpomp sits left of the reservoir';
    expect(parseContent(c).ok).toBe(true);
  });

  it('reject a typo in an omen visual flag', () => {
    const c = clone();
    const omen = asObj(asObj(c.biomes['biomes/karoo-autumn.json'])['omen']);
    asObj(omen['visual'])['windsock'] = true;
    expect(parseContent(c).ok).toBe(false);
  });

  it('reject weapon as an event-bonus multiplier (GDD §5.3)', () => {
    const c = clone();
    asObj(c.files['scoring.json'])['eventBonusMultipliers'] = ['frenzy', 'stampede', 'weapon'];
    expect(parseContent(c).ok).toBe(false);
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
  it('pass for the current content; every biome is in (M8), only Notaboek-dependent warnings', () => {
    const report = checkCrossRefs(parseOk(raw), { i18nKeys });
    expect(report.errors).toEqual([]);
    const text = report.warnings.map((w) => w.message).join('\n');
    expect(text).not.toMatch(/bushveld|okavango|kalahari|not loaded yet|does not exist yet/);
    expect(text).toMatch(/bag_50_far/);
    // M6: Bles's farmDog has its own handler; the last charm warning is gone.
    expect(text).not.toMatch(/farmDog|charms\.json/);
  });

  it('Notaboek challenges resolve the weapon unlocks (M5)', () => {
    const notaboek = loadNotaboek();
    const report = checkCrossRefs(parseOk(raw), { i18nKeys, notaboek });
    expect(report.errors).toEqual([]);
    const text = report.warnings.map((w) => w.message).join('\n');
    expect(text).not.toMatch(/bag_50_far|whole_flock_x3/);
  });

  it('catch a weapon unlock challenge missing from the Notaboek', () => {
    const notaboek = loadNotaboek();
    const broken = { ...notaboek, challenges: notaboek.challenges.filter((c) => c.id !== 'bag_50_far') };
    const report = checkCrossRefs(parseOk(raw), { i18nKeys, notaboek: broken });
    expect(report.errors.map((e) => e.message).join('\n')).toMatch(/windbuks.*bag_50_far.*not in meta\/notaboek/);
  });

  it('catch a Notaboek reward that does not match the weapon unlock', () => {
    const notaboek = loadNotaboek();
    const broken = {
      ...notaboek,
      challenges: notaboek.challenges.map((c) =>
        c.id === 'whole_flock_x3' ? { ...c, reward: { type: 'weapon' as const, id: 'pomp' } } : c,
      ),
    };
    const msgs = checkCrossRefs(parseOk(raw), { i18nKeys, notaboek: broken }).errors.map((e) => e.message);
    expect(msgs.join('\n')).toMatch(/whole_flock_x3/);
  });

  it('catch a secrets challenge whose target is not the biome secret count', () => {
    const notaboek = loadNotaboek();
    const broken = {
      ...notaboek,
      challenges: notaboek.challenges.map((c) => (c.metric === 'distinctSecrets' ? { ...c, target: 9 } : c)),
    };
    const msgs = checkCrossRefs(parseOk(raw), { i18nKeys, notaboek: broken }).errors.map((e) => e.message);
    expect(msgs.join('\n')).toMatch(/target 9 != 4 secrets/);
  });

  it('turn warnings into errors with strict; the real content passes strict (CI, M8)', () => {
    const report = checkCrossRefs(parseOk(raw), { i18nKeys, strict: true });
    expect(report.warnings).toEqual([]);
    expect(report.errors.some((e) => /bag_50_far/.test(e.message))).toBe(true);
    const full = checkCrossRefs(parseOk(raw), { i18nKeys, notaboek: loadNotaboek(), strict: true });
    expect(full.errors).toEqual([]);
  });

  it('catch a peekFromCover boss without peek timings or cover (M8)', () => {
    const c = clone();
    const biome = asObj(c.biomes['biomes/bushveld-winter.json']);
    const boss = asArr(biome['events']).find((e) => e['id'] === 'bossAppearance');
    if (boss === undefined) throw new Error('no boss event');
    delete boss['peekMs'];
    boss['perchProps'] = ['boulder_a'];
    const text = checkCrossRefs(parseOk(c), { i18nKeys })
      .errors.map((e) => e.message)
      .join('\n');
    expect(text).toMatch(/peekMs and hideMs/);
    expect(text).toMatch(/two or more perchProps/);
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

  it('catch a mode whose weapon is not a primary weapon', () => {
    const c = clone();
    const classic = asObj(asObj(asObj(c.files['modes.json'])['modes'])['classic']);
    classic['weapon'] = 'voorlaaier';
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /voorlaaier/.test(e.message))).toBe(true);
  });

  it('catch a plane layer whose scroll factor disagrees with scoring.json (Tech §3.3)', () => {
    const c = clone();
    const biome = asObj(c.biomes['biomes/karoo-autumn.json']);
    const mid = asArr(biome['layers']).find((l) => l['id'] === 'mid');
    if (mid) mid['scrollFactor'] = 0.5;
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /scrollFactor 0.5/.test(e.message))).toBe(true);
  });

  it('catch a panorama width that is not the mid-plane core width', () => {
    const c = clone();
    asObj(c.biomes['biomes/karoo-autumn.json'])['panoramaWidth'] = 4000;
    const report = checkCrossRefs(parseOk(c), { i18nKeys });
    expect(report.errors.some((e) => /panoramaWidth 4000/.test(e.message))).toBe(true);
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

  // M4 (biome cross-references).
  const karoo = (c: ReturnType<typeof clone>): Json => asObj(c.biomes['biomes/karoo-autumn.json']);
  const propOf = (c: ReturnType<typeof clone>, id: string): Json => {
    const p = asArr(karoo(c)['props']).find((x) => x['id'] === id);
    if (p === undefined) throw new Error(`no prop ${id}`);
    return p;
  };
  const eventOf = (c: ReturnType<typeof clone>, id: string): Json => {
    const e = asArr(karoo(c)['events']).find((x) => x['id'] === id);
    if (e === undefined) throw new Error(`no event ${id}`);
    return e;
  };
  const errorsOf = (c: ReturnType<typeof clone>): string =>
    checkCrossRefs(parseOk(c), { i18nKeys })
      .errors.map((e) => e.message)
      .join('\n');

  it('catch a secret reward at a prop that does not exist', () => {
    const c = clone();
    asObj(asObj(propOf(c, 'windpomp')['secret'])['reward'])['at'] = 'dam';
    expect(errorsOf(c)).toMatch(/reward is at unknown prop "dam"/);
  });

  it('catch a secret that grants an unknown power-up', () => {
    const c = clone();
    asObj(asObj(propOf(c, 'fence_bell')['secret'])['reward'])['powerup'] = 'rooibos';
    expect(errorsOf(c)).toMatch(/unknown power-up "rooibos"/);
  });

  it('catch a perch prop without a perch point, and an unknown perch prop', () => {
    const c = clone();
    delete propOf(c, 'windpomp')['perch'];
    expect(errorsOf(c)).toMatch(/kwevoel" perches on prop "windpomp", which has no perch point/);
    const d = clone();
    eventOf(d, 'bossAppearance')['perchProps'] = ['kraal'];
    expect(errorsOf(d)).toMatch(/perches on unknown prop "kraal"/);
  });

  it('catch a boss appearance whose creature is not a boss', () => {
    const c = clone();
    eventOf(c, 'bossAppearance')['creature'] = 'tarentaal';
    expect(errorsOf(c)).toMatch(/bossAppearance" needs a boss creature/);
  });

  it('catch a dust devil without its plane and radius', () => {
    const c = clone();
    delete eventOf(c, 'dustDevil')['radiusPx'];
    expect(errorsOf(c)).toMatch(/dustDevil" needs plane, radiusPx/);
  });

  it('reject a single-hit secret that is neither once per hunt nor on a cooldown', () => {
    const c = clone();
    delete asObj(propOf(c, 'bakkie')['secret'])['oncePerHunt'];
    expect(parseContent(c).ok).toBe(false);
  });

  it('make tools/validate-content.ts exit non-zero on a broken cross-reference', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tarantal-content-'));
    try {
      cpSync(join(root, 'content'), dir, { recursive: true });
      const file = join(dir, 'biomes', 'karoo-autumn.json');
      const biome = asObj(JSON.parse(readFileSync(file, 'utf8')));
      const pomp = asArr(biome['props']).find((x) => x['id'] === 'windpomp');
      asObj(asObj(asObj(pomp)['secret'])['reward'])['at'] = 'dam';
      writeFileSync(file, JSON.stringify(biome));
      const run = (): string =>
        execFileSync(
          process.execPath,
          ['--import', 'tsx', join(root, 'tools/validate-content.ts'), '--dir', dir],
          { cwd: root, encoding: 'utf8', stdio: 'pipe' },
        );
      let failed: { status: number | null; stderr: string } | null = null;
      try {
        run();
      } catch (e) {
        failed = e as { status: number | null; stderr: string };
      }
      expect(failed?.status).toBe(1);
      expect(failed?.stderr).toMatch(/unknown prop "dam"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
