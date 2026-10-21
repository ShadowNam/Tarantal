import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash, loadDailyMeta } from '../../tools/testContent';
import { createSim } from '../sim/Sim';
import type { SimEvent } from '../sim/events';
import {
  dailyBiome,
  dailyMode,
  dailyNumber,
  dailySeed,
  dailySetup,
  defaultDaily,
  finishAttempt,
  freezeReady,
  liveStreak,
  officialEntry,
  playedToday,
  startAttempt,
} from './daily';
import { parseDayKey } from './dailyCalendar';
import { sha256HexOfString } from '../content/hash';
import type { DailySave } from './saveSchema';
import { DailySaveSchema } from './saveSchema';

const meta = loadDailyMeta();
const day = (k: string): number => {
  const d = parseDayKey(k);
  if (d === null) throw new Error(k);
  return d;
};
/** Plays the official attempt on each day key in order, from `s`. */
function playDays(keys: readonly string[], s: DailySave = defaultDaily()): DailySave {
  return keys.reduce((acc, k) => startAttempt(acc, day(k), meta).save, s);
}

describe('daily seed (Tech §12)', () => {
  it('is u32 of the first 4 SHA-256 bytes of tm-daily|date|contentHash', () => {
    const hash = 'ab'.repeat(32);
    const hex = sha256HexOfString(`tm-daily|2026-10-21|${hash}`);
    expect(dailySeed('2026-10-21', hash)).toBe(parseInt(hex.slice(0, 8), 16));
    // Pinned value: a change here changes every player's Daily Hunt.
    expect(dailySeed('2026-10-21', hash)).toMatchInlineSnapshot(`761924613`);
  });

  it('differs by day and by content', () => {
    const h = loadContentHash();
    expect(dailySeed('2026-10-21', h)).not.toBe(dailySeed('2026-10-22', h));
    expect(dailySeed('2026-10-21', h)).not.toBe(dailySeed('2026-10-21', '0'.repeat(64)));
    expect(dailySeed('2026-10-21', h)).toBeGreaterThanOrEqual(0);
    expect(dailySeed('2026-10-21', h)).toBeLessThan(2 ** 32);
  });

  it('the same day gives the same omen and crate schedule; another day a different one', () => {
    const content = loadContent();
    const schedule = (seed: number): string => {
      const sim = createSim({ seed, content, mode: { id: 'daily' }, inputKind: 'pointer' });
      const out: string[] = [];
      const keep = (events: readonly SimEvent[]): void => {
        for (const e of events)
          if (
            e.type === 'windChanged' ||
            e.type === 'crateSpawned' ||
            e.type === 'dustDevilSpawned'
          )
            out.push(`${e.tick}:${e.type}`);
      };
      keep(sim.drainEvents());
      while (!sim.isOver()) {
        sim.step([]);
        keep(sim.drainEvents());
      }
      return out.join(',');
    };
    const h = loadContentHash();
    const a = schedule(dailySeed('2026-10-21', h));
    expect(a).toContain('windChanged');
    expect(a).toContain('crateSpawned');
    expect(schedule(dailySeed('2026-10-21', h))).toBe(a);
    expect(schedule(dailySeed('2026-10-22', h))).not.toBe(a);
  });
});

describe('daily number and biome', () => {
  it('the epoch is #1', () => {
    expect(dailyNumber(day(meta.epoch), meta.epoch)).toBe(1);
    expect(dailyNumber(day(meta.epoch) + 141, meta.epoch)).toBe(142);
  });

  it('indexes the whole rotation; an unplayable day falls back (D-025)', () => {
    const rot = ['a', 'b', 'c'];
    expect([0, 1, 2, 3].map((d) => dailyBiome(d, rot, ['a', 'b', 'c'], 'z'))).toEqual([
      'a',
      'b',
      'c',
      'a',
    ]);
    // A client that can't draw 'b' plays the fallback on b's day, not another rotation biome.
    expect([0, 1, 2].map((d) => dailyBiome(d, rot, ['a', 'c'], 'z'))).toEqual(['a', 'z', 'c']);
    expect(dailyBiome(5, rot, [], 'z')).toBe('z');
    expect(dailyBiome(-1, rot, rot, 'z')).toBe('c');
  });

  it('with only the Karoo playable, today is a Karoo daily with the omen from modes.json', () => {
    const content = loadContent();
    const setup = dailySetup(day('2026-10-21'), {
      meta,
      contentHash: loadContentHash(),
      playable: ['karoo-autumn'],
      fallbackBiome: content.modes.modes.daily.biome,
    });
    expect(setup).toMatchObject({ key: '2026-10-21', number: 1, biome: 'karoo-autumn' });
    expect(dailyMode(setup, undefined)).toEqual({ id: 'daily', biome: 'karoo-autumn' });
    expect(dailyMode(setup, 'windbuks')).toEqual({
      id: 'daily',
      biome: 'karoo-autumn',
      weapon: 'windbuks',
    });
    const sim = createSim({
      seed: setup.seed,
      content,
      mode: dailyMode(setup, undefined),
      inputKind: 'touch',
    });
    expect(sim.snapshot().wind).not.toBeNull();
  });

  it("plays the rotation's biome for the day; a client that can't draw it falls back (D-025)", () => {
    const content = loadContent();
    const playable = ['karoo-autumn', 'bushveld-winter'];
    const setup = (key: string) =>
      dailySetup(day(key), {
        meta,
        contentHash: loadContentHash(),
        playable,
        fallbackBiome: content.modes.modes.daily.biome,
      });
    // Day 20745 ≡ 1 (mod 4): rotation[1] = Bushveld, playable here.
    expect(day('2026-10-19') % 4).toBe(1);
    const bush = setup('2026-10-19');
    expect(bush.biome).toBe('bushveld-winter');
    // Day 20747 ≡ 3: rotation[3] = Kalahari, not playable here → the fallback, never another
    // biome from the rotation (every client agrees on the day's biome when it can draw it).
    expect(setup('2026-10-21').biome).toBe(content.modes.modes.daily.biome);
    const sim = createSim({
      seed: bush.seed,
      content,
      mode: dailyMode(bush, undefined),
      inputKind: 'pointer',
    });
    expect(sim.snapshot().glare).not.toBeNull();
  });
});

describe('first attempt rule', () => {
  it('only the first attempt of the UTC day is official; later ones are practice', () => {
    const d = day('2026-10-21');
    const first = startAttempt(defaultDaily(), d, meta);
    expect(first.official).toBe(true);
    expect(playedToday(first.save, d)).toBe(true);
    const again = startAttempt(first.save, d, meta);
    expect(again.official).toBe(false);
    expect(again.save).toBe(first.save);
    // The next UTC day is a new first attempt.
    expect(startAttempt(first.save, d + 1, meta).official).toBe(true);
  });

  it('a clock moved back never opens a second official attempt', () => {
    const s = playDays(['2026-10-21']);
    expect(startAttempt(s, day('2026-10-20'), meta).official).toBe(false);
  });

  it('records the official result once; practice never touches it', () => {
    const d = day('2026-10-21');
    const s = startAttempt(defaultDaily(), d, meta).save;
    const r = finishAttempt(s, d, {
      score: 2840,
      rank: 'bosveldjagter',
      wholeFlocks: 2,
      grid: '🟩',
    });
    expect(officialEntry(r.save, d)?.score).toBe(2840);
    expect(r.save.bestScore).toBe(2840);
    expect(r.newBest).toBe(false); // the first one is not "new best" news
    const second = finishAttempt(r.save, d, { score: 9999, rank: 'x', wholeFlocks: 0, grid: '' });
    expect(second.save).toBe(r.save);
    const next = startAttempt(r.save, d + 1, meta).save;
    expect(
      finishAttempt(next, d + 1, { score: 3000, rank: 'r', wholeFlocks: 0, grid: '' }).newBest,
    ).toBe(true);
  });

  it('an abandoned attempt keeps the streak but has no score', () => {
    const s = playDays(['2026-10-21', '2026-10-22']);
    expect(s.streak).toBe(2);
    expect(officialEntry(s, day('2026-10-22'))).toBeNull();
  });
});

describe('streak and weekly freeze (GDD §15)', () => {
  it('counts consecutive UTC days', () => {
    const s = playDays(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(liveStreak(s, day('2026-10-22'))).toBe(3);
    expect(liveStreak(s, day('2026-10-23'))).toBe(3);
  });

  it('one missed day uses that week’s freeze', () => {
    // Tue 20, (Wed 21 missed), Thu 22 — all ISO week 2026-W43.
    const before = playDays(['2026-10-20']);
    const r = startAttempt(before, day('2026-10-22'), meta);
    expect(r.save.streak).toBe(2);
    expect(r.frozen).toEqual(['2026-W43']);
    expect(freezeReady(r.save, day('2026-10-23'))).toBe(false);
    // A second miss in the same week breaks the streak.
    const broken = startAttempt(r.save, day('2026-10-24'), meta);
    expect(broken.save.streak).toBe(1);
    expect(broken.frozen).toEqual([]);
  });

  it('a new ISO week (Monday) brings a new freeze', () => {
    // Freeze used in W43 (missed Wed 21), then miss Tue 27 (W44): saved again.
    const s = playDays([
      '2026-10-20',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
    expect(s.streak).toBe(6);
    const r = startAttempt(s, day('2026-10-28'), meta);
    expect(r.frozen).toEqual(['2026-W44']);
    expect(r.save.streak).toBe(7);
  });

  it('missing Sunday and Monday uses two different weeks’ freezes', () => {
    const s = playDays(['2026-10-24']); // Saturday, W43
    const r = startAttempt(s, day('2026-10-27'), meta); // Sun 25 (W43) + Mon 26 (W44) missed
    expect(r.frozen).toEqual(['2026-W43', '2026-W44']);
    expect(r.save.streak).toBe(2);
  });

  it('two missed days in one week, or three in a row, reset the streak', () => {
    const s = playDays(['2026-10-19', '2026-10-20']); // Mon, Tue
    expect(startAttempt(s, day('2026-10-23'), meta).save.streak).toBe(1); // Wed+Thu missed
    expect(liveStreak(s, day('2026-10-23'))).toBe(0);
    expect(startAttempt(s, day('2026-10-24'), meta).save.streak).toBe(1);
  });

  it('across UTC midnight and the year-end ISO week', () => {
    // 2026-12-31 (Thu) is in 2026-W53; 2027-01-04 (Mon) starts 2027-W01.
    const s = playDays(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(s.streak).toBe(4);
    const r = startAttempt(s, day('2027-01-04'), meta); // missed Sun 3 Jan (2026-W53)
    expect(r.frozen).toEqual(['2026-W53']);
    expect(r.save.streak).toBe(5);
  });

  it('liveStreak shows 0 once the streak can’t be saved by playing today', () => {
    const s = playDays(['2026-10-20']);
    expect(liveStreak(s, day('2026-10-22'))).toBe(1); // a freeze would save it
    expect(liveStreak(s, day('2026-10-25'))).toBe(0);
    expect(liveStreak(defaultDaily(), day('2026-10-25'))).toBe(0);
  });

  it('milestones award each cosmetic once', () => {
    const keys = Array.from({ length: 8 }, (_, i) => `2026-10-${String(20 + i).padStart(2, '0')}`);
    let s = defaultDaily();
    const won: string[] = [];
    for (const k of keys) {
      const r = startAttempt(s, day(k), meta);
      won.push(...r.cosmetics);
      s = r.save;
    }
    expect(won).toEqual(['streak_3', 'streak_7']);
    expect(s.cosmetics).toEqual(['streak_3', 'streak_7']);
    // Losing and rebuilding the streak doesn't award them again.
    const later = playDays(['2026-11-10', '2026-11-11', '2026-11-12'], s);
    expect(later.cosmetics).toEqual(['streak_3', 'streak_7']);
  });

  it('keeps history and freeze weeks bounded and the save schema valid', () => {
    let s = defaultDaily();
    const start = day('2026-01-01');
    for (let d = start; d < start + 400; d += 2) s = startAttempt(s, d, meta).save;
    expect(s.history.length).toBeLessThanOrEqual(meta.historyDays);
    expect(s.freezesUsed.length).toBeLessThanOrEqual(meta.freezeWeeksKept);
    expect(DailySaveSchema.safeParse(s).success).toBe(true);
  });
});

describe('golden daily replays (M7, pinned in M8)', () => {
  it('are Karoo dailies with the omen on and the seed pinned at M7 (D-025)', async () => {
    const { default: replays } = await import('../sim/replay/golden/replays.json');
    const daily = replays.filter((g) => g.name.startsWith('daily-2026-10-21-'));
    expect(daily.map((g) => g.inputKind).sort()).toEqual(['pointer', 'touch']);
    for (const g of daily) {
      expect(g.seed, g.name).toBe(1286298468);
      expect(g.modeConfig, g.name).toEqual({ id: 'daily', biome: 'karoo-autumn' });
    }
  });
});
