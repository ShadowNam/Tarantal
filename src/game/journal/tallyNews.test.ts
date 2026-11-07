import { expect, it } from 'vitest';
import { appendJournalNews } from './tallyNews';
it('never buries a challenge verdict or an earned unlock behind coaching or a shot label', () => {
  expect(appendJournalNews(['challenge won', 'rifle unlocked'], ['long shot', 'coach tip'])).toBe(
    'challenge won  ·  rifle unlocked',
  );
  expect(appendJournalNews(['sight unlocked'], ['long shot', 'coach tip'])).toBe(
    'sight unlocked  ·  long shot',
  );
  expect(appendJournalNews([], ['long shot', 'coach tip'])).toBe('long shot  ·  coach tip');
  expect(appendJournalNews([], [])).toBeNull();
});
