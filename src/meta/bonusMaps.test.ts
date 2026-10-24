// v1.2 (D-033): Verder unlock, UTC-midnight reset and its own best.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BONUS_MAP_IDS } from '../content/schemas';
import { loadContent } from '../../tools/testContent';
import {
  bonusOpenFor,
  applyBonusResult,
  bonusAllowsSight,
  bonusKeys,
  bonusSlug,
  isScope,
  isUnlocked,
  mapQuota,
  nextBonus,
  unlocksOn,
} from './bonusMaps';
import { dayNumber } from './dailyCalendar';
import { layoutForDay } from './maps';
import { defaultSave } from './saveSchema';

const content = loadContent();
const quota = mapQuota(content, 'karoo-autumn');
// Sunday 25 Oct 2026, one millisecond before UTC midnight, and Monday right after it.
const lateSunday = Date.UTC(2026, 9, 25, 23, 59, 59, 999);
const sun = dayNumber(lateSunday);
const mon = dayNumber(lateSunday + 1);
const empty = defaultSave().bonusMaps;
const KAROO = 'karoo-autumn';

const hunt = (over: Partial<Parameters<typeof applyBonusResult>[1]> = {}) => ({
  mode: 'classic' as const,
  biome: 'karoo-autumn',
  layout: layoutForDay(sun),
  bonus: null,
  score: quota,
  rank: 'bosveldjagter',
  ...over,
});

describe('bonus maps (v1.2)', () => {
  it('the quota is the season plain-hunt quota (run.json)', () => {
    expect(quota).toBe(content.run.seasons.find((s) => s.biome === 'karoo-autumn')?.quotas[0]);
    expect(nextBonus(null)).toBe('verder');
    // v1.3: Verder → Nog Verder → Die Verste, then nothing.
    expect(nextBonus('verder')).toBe('nogVerder');
    expect(nextBonus('nogVerder')).toBe('dieVerste');
    expect(nextBonus('dieVerste')).toBeNull();
  });

  it('beating the quota on today’s map unlocks Verder for today', () => {
    const r = applyBonusResult(empty, hunt(), sun, sun, content, KAROO);
    expect(r.unlocked).toBe('verder');
    expect(isUnlocked(r.save, sun, 'karoo-autumn', 'verder')).toBe(true);
    expect(isUnlocked(r.save, sun, 'bushveld-winter', 'verder')).toBe(false);
    // Once is enough: a second pass reports nothing new.
    expect(applyBonusResult(r.save, hunt(), sun, sun, content, KAROO).unlocked).toBeNull();
  });

  it('one point short, another day’s layout, a Season Run or an FTUE hunt unlock nothing', () => {
    expect(
      applyBonusResult(empty, hunt({ score: quota - 1 }), sun, sun, content, KAROO).unlocked,
    ).toBeNull();
    expect(
      applyBonusResult(empty, hunt({ layout: 'tue' }), sun, sun, content, KAROO).unlocked,
    ).toBeNull();
    expect(
      applyBonusResult(empty, hunt({ layout: null }), sun, sun, content, KAROO).unlocked,
    ).toBeNull();
    expect(
      applyBonusResult(empty, hunt({ mode: 'seasonHunt' }), sun, sun, content, KAROO).unlocked,
    ).toBeNull();
    expect(
      applyBonusResult(empty, hunt({ mode: 'ftue' }), sun, sun, content, KAROO).unlocked,
    ).toBeNull();
    // The Daily plays today's map too.
    expect(
      applyBonusResult(empty, hunt({ mode: 'daily' }), sun, sun, content, KAROO).unlocked,
    ).toBe('verder');
  });

  it('only the Classic biome unlocks: a Bushveld Daily over its quota unlocks nothing', () => {
    const bush = hunt({ mode: 'daily', biome: 'bushveld-winter', score: 99_999 });
    const r = applyBonusResult(empty, bush, sun, sun, content, KAROO);
    expect(r.unlocked).toBeNull();
    expect(r.save.unlocked).toEqual([]);
  });

  it('resets at UTC midnight', () => {
    const unlocked = applyBonusResult(empty, hunt(), sun, sun, content, KAROO).save;
    expect(isUnlocked(unlocked, sun, 'karoo-autumn', 'verder')).toBe(true);
    expect(isUnlocked(unlocked, mon, 'karoo-autumn', 'verder')).toBe(false);
    expect(unlocksOn(unlocked, mon)).toEqual([]);
    // The next hunt after midnight clears the stored unlocks.
    const next = applyBonusResult(
      unlocked,
      hunt({ layout: layoutForDay(mon), score: 0 }),
      mon,
      mon,
      content,
      KAROO,
    );
    expect(next.save).toMatchObject({ day: mon, unlocked: [] });
  });

  it('a hunt started before midnight and finished after it unlocks nothing (its map is gone)', () => {
    const r = applyBonusResult(empty, hunt(), sun, mon, content, KAROO);
    expect(r.unlocked).toBeNull();
    expect(isUnlocked(r.save, mon, 'karoo-autumn', 'verder')).toBe(false);
    expect(isUnlocked(r.save, sun, 'karoo-autumn', 'verder')).toBe(false);
  });

  it('Verder keeps its own best across days', () => {
    const v = (score: number, day: number) =>
      hunt({ layout: layoutForDay(day), bonus: 'verder', score });
    const a = applyBonusResult(empty, v(1800, sun), sun, sun, content, KAROO);
    expect(a.newBest).toEqual({ previous: null });
    const b = applyBonusResult(a.save, v(1500, mon), mon, mon, content, KAROO);
    expect(b.newBest).toBeNull();
    const c = applyBonusResult(b.save, v(2100, mon), mon, mon, content, KAROO);
    expect(c.newBest).toEqual({ previous: 1800 });
    expect(c.save.bests['karoo-autumn/verder']).toEqual({ score: 2100, rank: 'bosveldjagter' });
    // v1.3: beating the quota on today's Verder unlocks Nog Verder (once).
    expect(c.unlocked).toBe('nogVerder');
    expect(isUnlocked(c.save, mon, 'karoo-autumn', 'nogVerder')).toBe(true);
  });

  it('v1.3: Nog Verder unlocks Die Verste; Die Verste unlocks nothing; each keeps its best', () => {
    const on = (bonus: string, score: number) => hunt({ layout: layoutForDay(mon), bonus, score });
    const a = applyBonusResult(empty, on('nogVerder', quota), mon, mon, content, KAROO);
    expect(a.unlocked).toBe('dieVerste');
    expect(a.save.bests['karoo-autumn/nogVerder']?.score).toBe(quota);
    const b = applyBonusResult(a.save, on('dieVerste', quota + 5), mon, mon, content, KAROO);
    expect(b.unlocked).toBeNull();
    expect(b.save.bests['karoo-autumn/dieVerste']?.score).toBe(quota + 5);
  });
});

describe('bonus maps and sights (v1.3, D-036)', () => {
  it('Die Verste starts only with a scope fitted, on every biome that has it', () => {
    expect(isScope(content, 'scope_small')).toBe(true);
    expect(isScope(content, 'iron')).toBe(false);
    expect(isScope(content, undefined)).toBe(false);
    for (const b of content.biomes) {
      if (!b.bonusMaps.some((m) => m.id === 'dieVerste')) continue;
      expect(bonusAllowsSight(content, b.id, 'dieVerste', 'scope_small'), b.id).toBe(true);
      expect(bonusAllowsSight(content, b.id, 'dieVerste', 'peep'), b.id).toBe(false);
      expect(bonusAllowsSight(content, b.id, 'dieVerste', undefined), b.id).toBe(false);
      expect(bonusAllowsSight(content, b.id, 'nogVerder', undefined), b.id).toBe(true);
      expect(bonusAllowsSight(content, b.id, 'verder', undefined), b.id).toBe(true);
    }
  });

  it('every bonus map has its name, best and unlock lines in all four languages', () => {
    for (const lang of ['en', 'af', 'de', 'nl'] as const) {
      const strings = JSON.parse(
        readFileSync(join(import.meta.dirname, '..', 'i18n', `${lang}.json`), 'utf8'),
      ) as Record<string, string>;
      for (const id of BONUS_MAP_IDS)
        for (const key of Object.values(bonusKeys(id)))
          expect(strings[key], `${lang} ${key}`).toBeTypeOf('string');
    }
    expect(bonusKeys('nogVerder').best).toBe('title.nog_verder_best');
  });

  it('i18n slugs: camelCase ids become snake_case keys', () => {
    expect(bonusSlug('verder')).toBe('verder');
    expect(bonusSlug('nogVerder')).toBe('nog_verder');
    expect(bonusSlug('dieVerste')).toBe('die_verste');
  });
});

describe('v1.4 B: a bonus map opens for the Classic area that unlocked it', () => {
  const c = loadContent();
  const save = { day: 100, unlocked: ['namibie/verder', 'karoo-autumn/dieVerste'], bests: {} };
  it('Namibië picked, namibie/verder unlocked today: Verder opens there, not in the Karoo', () => {
    expect(bonusOpenFor(c, save, 100, 'namibie', 'verder', undefined)).toBe(true);
    expect(bonusOpenFor(c, save, 100, 'karoo-autumn', 'verder', undefined)).toBe(false);
  });
  it("yesterday's unlock is gone; Die Verste still needs a scope", () => {
    expect(bonusOpenFor(c, save, 101, 'namibie', 'verder', undefined)).toBe(false);
    expect(bonusOpenFor(c, save, 100, 'karoo-autumn', 'dieVerste', undefined)).toBe(false);
    expect(bonusOpenFor(c, save, 100, 'karoo-autumn', 'dieVerste', 'scope_small')).toBe(true);
  });
  it('an unknown area or bonus map never opens', () => {
    expect(bonusOpenFor(c, save, 100, 'nowhere', 'verder', undefined)).toBe(false);
    expect(bonusOpenFor(c, save, 100, 'namibie', 'nope', undefined)).toBe(false);
  });
});
