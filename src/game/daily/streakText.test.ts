// v1.11: the Daily streak line on the tally says "1 day", never "1 days", in every language.
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../../i18n/i18n';
import { streakText } from './DailyFlow';

describe('streakText', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it.each([
    ['en', 'Streak: 1 day', 'Streak: 2 days'],
    ['af', 'Reeks: 1 dag', 'Reeks: 2 dae'],
    ['de', 'Serie: 1 Tag', 'Serie: 2 Tage'],
    ['nl', 'Reeks: 1 dag', 'Reeks: 2 dagen'],
  ] as const)('%s: singular for 1, the plural otherwise', (lang, one, two) => {
    setLanguage(lang);
    expect(streakText(1)).toBe(one);
    expect(streakText(2)).toBe(two);
    expect(streakText(0)).not.toBe(one);
  });
});
