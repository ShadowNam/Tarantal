import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import { sheetHerds } from './faunaHerds';
import { FAUNA_SHEET_KEYS } from './faunaKeys';

describe('the far herds’ sheet keys (D-080)', () => {
  it('equal the herd tables’ sheets, biome by biome', () => {
    for (const b of loadContent().biomes)
      expect([...(FAUNA_SHEET_KEYS[b.id] ?? [])], b.id).toEqual(sheetHerds(b.id).map((h) => h.key));
  });
});
