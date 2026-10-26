// D-048: the special-day calendar (UTC boundaries), the override, the Daily's setup and mode on
// a special day, the share card's frame and title, and challenge links that carry the special.
import { describe, expect, it } from 'vitest';
import { loadContent, loadContentHash, loadDailyMeta } from '../../tools/testContent';
import { translator } from '../i18n/i18n';
import { challengeFor, challengeHunt, decodeChallenge, encodeChallenge } from './challenge';
import { dailyMode, dailySetup } from './daily';
import { dayNumber, daysFromCivil } from './dailyCalendar';
import { feesdagById, feesdagForDay, todaysFeesdag, yearOfDay } from './feesdae';
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
    expect(feesdagForDay(F, daysFromCivil(2026, 12, 25))).toBeNull();
  });

  it('the override forces a special (or none) whatever the date; unknown ids fall back', () => {
    const plain = daysFromCivil(2026, 10, 26);
    const hall = daysFromCivil(2026, 10, 31);
    expect(todaysFeesdag(F, plain, 'halloween')?.id).toBe('halloween');
    expect(todaysFeesdag(F, hall, 'none')).toBeNull();
    expect(todaysFeesdag(F, plain, 'kersfees')).toBeNull();
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
