// v1.2 (D-033): Verder unlock, UTC-midnight reset and its own best.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { applyBonusResult, isUnlocked, mapQuota, nextBonus, unlocksOn } from './bonusMaps';
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
    expect(nextBonus('verder')).toBeNull();
  });

  it('beating the quota on today’s map unlocks Verder for today', () => {
    const r = applyBonusResult(empty, hunt(), sun, sun, content);
    expect(r.unlocked).toBe('verder');
    expect(isUnlocked(r.save, sun, 'karoo-autumn', 'verder')).toBe(true);
    expect(isUnlocked(r.save, sun, 'bushveld-winter', 'verder')).toBe(false);
    // Once is enough: a second pass reports nothing new.
    expect(applyBonusResult(r.save, hunt(), sun, sun, content).unlocked).toBeNull();
  });

  it('one point short, another day’s layout, a Season Run or an FTUE hunt unlock nothing', () => {
    expect(
      applyBonusResult(empty, hunt({ score: quota - 1 }), sun, sun, content).unlocked,
    ).toBeNull();
    expect(applyBonusResult(empty, hunt({ layout: 'tue' }), sun, sun, content).unlocked).toBeNull();
    expect(applyBonusResult(empty, hunt({ layout: null }), sun, sun, content).unlocked).toBeNull();
    expect(
      applyBonusResult(empty, hunt({ mode: 'seasonHunt' }), sun, sun, content).unlocked,
    ).toBeNull();
    expect(applyBonusResult(empty, hunt({ mode: 'ftue' }), sun, sun, content).unlocked).toBeNull();
    // The Daily plays today's map too.
    expect(applyBonusResult(empty, hunt({ mode: 'daily' }), sun, sun, content).unlocked).toBe(
      'verder',
    );
  });

  it('resets at UTC midnight', () => {
    const unlocked = applyBonusResult(empty, hunt(), sun, sun, content).save;
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
    );
    expect(next.save).toMatchObject({ day: mon, unlocked: [] });
  });

  it('a hunt started before midnight and finished after it unlocks nothing (its map is gone)', () => {
    const r = applyBonusResult(empty, hunt(), sun, mon, content);
    expect(r.unlocked).toBeNull();
    expect(isUnlocked(r.save, mon, 'karoo-autumn', 'verder')).toBe(false);
    expect(isUnlocked(r.save, sun, 'karoo-autumn', 'verder')).toBe(false);
  });

  it('Verder keeps its own best across days', () => {
    const v = (score: number, day: number) =>
      hunt({ layout: layoutForDay(day), bonus: 'verder', score });
    const a = applyBonusResult(empty, v(1800, sun), sun, sun, content);
    expect(a.newBest).toEqual({ previous: null });
    const b = applyBonusResult(a.save, v(1500, mon), mon, mon, content);
    expect(b.newBest).toBeNull();
    const c = applyBonusResult(b.save, v(2100, mon), mon, mon, content);
    expect(c.newBest).toEqual({ previous: 1800 });
    expect(c.save.bests['karoo-autumn/verder']).toEqual({ score: 2100, rank: 'bosveldjagter' });
    // A Verder hunt never unlocks another Verder (v1.3 adds Nog Verder).
    expect(c.unlocked).toBeNull();
  });
});
