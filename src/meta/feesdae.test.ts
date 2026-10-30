// D-048: the special-day calendar (UTC boundaries), the override, the Daily's setup and mode on
// a special day, the share card's frame and title, and challenge links that carry the special.
import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash, loadDailyMeta } from '../../tools/testContent';
import { isI18nKey, translator } from '../i18n/i18n';
import { challengeFor, challengeHunt, decodeChallenge, encodeChallenge } from './challenge';
import { dailyMode, dailySetup } from './daily';
import { dayNumber, daysFromCivil } from './dailyCalendar';
import {
  feesdagById,
  feesdagForDay,
  shareYear,
  specialDays,
  todaysFeesdag,
  yearOfDay,
} from './feesdae';
import { buildShareText, joinShare, type ShareInput } from './share';

const content = loadContent();
const meta = loadDailyMeta();
const hash = loadContentHash();
const F = content.feesdae;
const utc = (iso: string): number => dayNumber(Date.parse(iso));
const PLAYABLE = meta.biomeRotation;

describe('Feesdae calendar (UTC, D-048)', () => {
  it('31 Oct is Halloween from 00:00 UTC to 23:59 UTC, and not a minute either side', () => {
    expect(feesdagForDay(F, utc('2026-10-30T23:59:59Z'))).toBeNull();
    expect(feesdagForDay(F, utc('2026-10-31T00:00:00Z'))?.id).toBe('halloween');
    expect(feesdagForDay(F, utc('2026-10-31T23:59:59Z'))?.id).toBe('halloween');
    expect(feesdagForDay(F, utc('2026-11-01T00:00:00Z'))).toBeNull();
    // Every year, and the device's time zone never moves it (the day is UTC).
    expect(feesdagForDay(F, daysFromCivil(2027, 10, 31))?.id).toBe('halloween');
    expect(feesdagForDay(F, daysFromCivil(2026, 12, 24))).toBeNull();
  });

  it('25 Dec is Christmas in the sun (D-064): 24 Dec 23:59 no, 25 Dec 00:00 yes, 26 Dec 00:00 no', () => {
    expect(feesdagForDay(F, utc('2026-12-24T23:59:59Z'))).toBeNull();
    expect(feesdagForDay(F, utc('2026-12-25T00:00:00Z'))?.id).toBe('christmas');
    expect(feesdagForDay(F, utc('2026-12-25T23:59:59Z'))?.id).toBe('christmas');
    expect(feesdagForDay(F, utc('2026-12-26T00:00:00Z'))).toBeNull();
    expect(feesdagForDay(F, daysFromCivil(2027, 12, 25))?.id).toBe('christmas');
    // Halloween keeps its own day.
    expect(feesdagForDay(F, utc('2026-10-31T12:00:00Z'))?.id).toBe('halloween');
  });

  it('31 Dec and 1 Jan are New Year (D-065): 30 Dec 23:59 no, 31 Dec 00:00 and 1 Jan 23:59 yes, 2 Jan no', () => {
    expect(feesdagForDay(F, utc('2026-12-30T23:59:59Z'))).toBeNull();
    expect(feesdagForDay(F, utc('2026-12-31T00:00:00Z'))?.id).toBe('newyear');
    expect(feesdagForDay(F, utc('2026-12-31T23:59:59Z'))?.id).toBe('newyear');
    expect(feesdagForDay(F, utc('2027-01-01T00:00:00Z'))?.id).toBe('newyear');
    expect(feesdagForDay(F, utc('2027-01-01T23:59:59Z'))?.id).toBe('newyear');
    expect(feesdagForDay(F, utc('2027-01-02T00:00:00Z'))).toBeNull();
    // Halloween and Christmas keep their own days.
    expect(feesdagForDay(F, utc('2026-10-31T12:00:00Z'))?.id).toBe('halloween');
    expect(feesdagForDay(F, utc('2026-12-25T12:00:00Z'))?.id).toBe('christmas');
    expect(feesdagForDay(F, utc('2026-12-26T12:00:00Z'))).toBeNull();
  });

  it("the share card names the year that starts on New Year, the day's own year otherwise", () => {
    const ny = feesdagById(F, 'newyear');
    expect(shareYear(ny, utc('2026-12-31T12:00:00Z'))).toBe(2027);
    expect(shareYear(ny, utc('2027-01-01T12:00:00Z'))).toBe(2027);
    expect(shareYear(feesdagById(F, 'halloween'), utc('2026-10-31T12:00:00Z'))).toBe(2026);
    expect(shareYear(feesdagById(F, 'christmas'), utc('2026-12-25T12:00:00Z'))).toBe(2026);
    expect(shareYear(null, utc('2026-12-31T12:00:00Z'))).toBe(2026);
    expect(todaysFeesdag(F, daysFromCivil(2026, 10, 26), 'newyear')?.id).toBe('newyear');
    expect(todaysFeesdag(F, daysFromCivil(2026, 12, 31), 'none')).toBeNull();
  });

  it('no two specials share a date (content cross-check)', () => {
    const dates = F.specials.flatMap((f) => specialDays(f).map((d) => `${d.month}-${d.day}`));
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('the override forces a special (or none) whatever the date; unknown ids fall back', () => {
    const plain = daysFromCivil(2026, 10, 26);
    const hall = daysFromCivil(2026, 10, 31);
    expect(todaysFeesdag(F, plain, 'halloween')?.id).toBe('halloween');
    expect(todaysFeesdag(F, hall, 'none')).toBeNull();
    expect(todaysFeesdag(F, plain, 'kersfees')).toBeNull();
    expect(todaysFeesdag(F, plain, 'christmas')?.id).toBe('christmas');
    expect(todaysFeesdag(F, daysFromCivil(2026, 12, 25), 'none')).toBeNull();
    expect(todaysFeesdag(F, daysFromCivil(2026, 12, 25), 'halloween')?.id).toBe('halloween');
    expect(todaysFeesdag(F, hall, null)?.id).toBe('halloween');
    expect(feesdagById(F, undefined)).toBeNull();
    expect(yearOfDay(hall)).toBe(2026);
  });

  it("puts the special in the Daily's mode; the seed stays the day's own", () => {
    const day = daysFromCivil(2026, 10, 31);
    const opts = { meta, contentHash: hash, playable: PLAYABLE, fallbackBiome: 'karoo-autumn' };
    const plain = dailySetup(day, opts);
    const special = dailySetup(day, { ...opts, feesdag: feesdagById(F, 'halloween') });
    expect(special.seed).toBe(plain.seed);
    expect(special.biome).toBe(plain.biome);
    expect(special.layout).toBe(plain.layout);
    expect(dailyMode(special, undefined).feesdag).toBe('halloween');
    expect(dailyMode(plain, undefined).feesdag).toBeUndefined();
  });
});

describe('Spookjag share card and links (D-048)', () => {
  const input: ShareInput = {
    dailyNumber: 11,
    biome: 'bushveld-winter',
    layout: 'sat',
    score: 4272,
    rank: 'bosveldjagter',
    grid: '🟩🟨🟩🟩⬛',
    wholeFlocks: 1,
    url: 'https://example.test/?c=x',
    feesdag: { title: 'Spookjag 2026', frame: 'halloween' },
  };

  it('frames the card with a pumpkin, bats and the moon and names "Spookjag 2026"', () => {
    const text = joinShare(buildShareText(input, translator('en')));
    expect(text.startsWith('🎃🦇 🐦 Tarantal Madness · Spookjag 2026 · Daily #11')).toBe(true);
    expect(text).toContain('🦇🌕');
    const plain = joinShare(buildShareText({ ...input, feesdag: null }, translator('en')));
    expect(plain).not.toContain('Spookjag');
    expect(plain).not.toContain('🎃');
  });

  it("a daily challenge carries the special; Classic never does; unknown ids don't decode", () => {
    const c = challengeFor(
      {
        seed: 7,
        mode: 'daily',
        biome: 'bushveld-winter',
        weapon: 'dubbelloop',
        score: 900,
        dailyNumber: 11,
        layout: 'sat',
        feesdag: 'halloween',
      },
      hash,
    );
    expect(c.f).toBe('halloween');
    expect(challengeHunt(c).mode.feesdag).toBe('halloween');
    const ctx = { content, playableBiomes: PLAYABLE, contentHash: hash, limits: meta.challenge };
    const got = decodeChallenge(encodeChallenge(c), ctx);
    expect(got.ok && got.challenge.f).toBe('halloween');
    expect(decodeChallenge(encodeChallenge({ ...c, f: 'kersfees' }), ctx)).toEqual({
      ok: false,
      reason: 'badShape',
    });
    const classic = challengeFor(
      { ...c, mode: 'classic', dailyNumber: null, feesdag: 'halloween' },
      hash,
    );
    expect(classic.f).toBeUndefined();
  });
});

describe('Christmas share card (D-064)', () => {
  it('frames the card with tinsel, a present and Santa and names "Christmas in the sun 2026"', () => {
    const input: ShareInput = {
      dailyNumber: 66,
      biome: 'karoo-autumn',
      layout: 'fri',
      score: 3120,
      rank: 'bosveldjagter',
      grid: '🟩🟨🟩🟩⬛',
      wholeFlocks: 0,
      url: '',
      feesdag: { title: 'Christmas in the sun 2026', frame: 'christmas' },
    };
    const text = joinShare(buildShareText(input, translator('en')));
    expect(
      text.startsWith('✨🎁 🐦 Tarantal Madness · Christmas in the sun 2026 · Daily #66'),
    ).toBe(true);
    expect(text).toContain('🎅☀️');
  });
});

describe('New Year share card (D-065)', () => {
  it('frames the card with streamers, a party hat and a firework, and names "New Year 2027"', () => {
    const input: ShareInput = {
      dailyNumber: 72,
      biome: 'okavango-spring',
      layout: 'thu',
      score: 3664,
      rank: 'bosveldjagter',
      grid: '🟩🟨🟩🟩⬛',
      wholeFlocks: 0,
      url: '',
      feesdag: { title: 'New Year 2027', frame: 'newyear' },
    };
    const text = joinShare(buildShareText(input, translator('en')));
    expect(text.startsWith('🎊🥳 🐦 Tarantal Madness · New Year 2027 · Daily #72')).toBe(true);
    expect(text).toContain('🎆🎊');
    // The title the tally builds: the special's name and the year that starts.
    const ny = feesdagById(F, 'newyear');
    const day = daysFromCivil(2026, 12, 31);
    const key = ny?.nameKey ?? '';
    if (!isI18nKey(key)) throw new Error(`New Year's name key ${key} is not a string key`);
    expect(`${translator('en').text(key)} ${shareYear(ny, day)}`).toBe('New Year 2027');
    expect(`${translator('af').text(key)} ${shareYear(ny, day)}`).toBe('Nuwejaar 2027');
  });
});
