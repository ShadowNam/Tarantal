// v1.3 review: bonus-map names reach i18n through bonusSlug (map.nog_verder, not map.nogVerder).
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { adminEntries } from '../../meta/admin';
import { entryLabel } from './adminLabels';

const content = loadContent();
const entries = adminEntries(
  content,
  content.biomes.map((b) => b.id),
);

describe('admin entry labels', () => {
  it('names every bonus map by its i18n name, never its id', () => {
    for (const [id, name] of [
      ['verder', 'Verder'],
      ['nogVerder', 'Nog Verder'],
      ['dieVerste', 'Die Verste'],
    ] as const) {
      const e = entries.find((x) => x.bonus === id);
      if (e === undefined) throw new Error(`no admin entry for ${id}`);
      const label = entryLabel(e, content);
      expect(label).toMatch(new RegExp(` · ${name}$`));
      expect(label).not.toContain(id === 'verder' ? 'map.' : id);
    }
  });
});
