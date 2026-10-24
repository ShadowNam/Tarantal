import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import {
  areaCards,
  biomeOrFirst,
  classicAreaId,
  isAreaUnlocked,
  newlyUnlockedAreas,
  unlockedBiomes,
} from './areas';
import { defaultSave } from './saveSchema';

const content = loadContent();
const playable = content.biomes.map((b) => b.id);
const namibie = content.biomes.find((b) => b.id === 'namibie');
if (namibie === undefined) throw new Error('no namibie biome');

describe('area packs (v1.4 B, D-039)', () => {
  it('Namibië is locked on a new save, and Classic plays the home area', () => {
    const save = defaultSave();
    expect(isAreaUnlocked(namibie, save)).toBe(false);
    expect(
      classicAreaId(content, { ...save, areas: { unlocked: [], classic: 'namibie' } }, playable),
    ).toBe(content.modes.modes.classic.biome);
    const cards = areaCards(content, save, playable);
    expect(cards.map((c) => c.biome)).toEqual([content.modes.modes.classic.biome, 'namibie']);
    expect(cards[1]).toMatchObject({ unlocked: false, unlockBonus: 'dieVerste' });
  });

  it('reaching Die Verste in any area unlocks it, and the unlock is kept', () => {
    const save = defaultSave();
    const reached = {
      ...save,
      bonusMaps: { day: 9, unlocked: ['bushveld-winter/dieVerste'], bests: {} },
    };
    expect(isAreaUnlocked(namibie, reached)).toBe(true);
    expect(newlyUnlockedAreas(content, reached)).toEqual(['namibie']);
    // Next day the bonus unlock is gone, but the stored area unlock stays.
    const nextDay = {
      ...save,
      areas: { unlocked: ['namibie'], classic: 'namibie' },
      bonusMaps: { day: 10, unlocked: [], bests: {} },
    };
    expect(isAreaUnlocked(namibie, nextDay)).toBe(true);
    expect(newlyUnlockedAreas(content, nextDay)).toEqual([]);
    expect(classicAreaId(content, nextDay, playable)).toBe('namibie');
  });

  it('a Die Verste best (played on an earlier day) counts too; Nog Verder does not', () => {
    const save = defaultSave();
    const played = {
      ...save,
      bonusMaps: {
        day: 3,
        unlocked: [],
        bests: { 'karoo-autumn/dieVerste': { score: 90, rank: 'x' } },
      },
    };
    expect(isAreaUnlocked(namibie, played)).toBe(true);
    const nog = { ...save, bonusMaps: { day: 3, unlocked: ['karoo-autumn/nogVerder'], bests: {} } };
    expect(isAreaUnlocked(namibie, nog)).toBe(false);
  });

  it('an area that is not playable on this build falls back to home', () => {
    const save = { ...defaultSave(), areas: { unlocked: ['namibie'], classic: 'namibie' } };
    expect(
      classicAreaId(
        content,
        save,
        playable.filter((b) => b !== 'namibie'),
      ),
    ).toBe(content.modes.modes.classic.biome);
  });

  it('the Skietbaan and the bird book list only unlocked areas; a locked choice falls back', () => {
    const fresh = defaultSave();
    const list = unlockedBiomes(content, fresh, playable);
    expect(list).toHaveLength(4);
    expect(list).not.toContain('namibie');
    expect(biomeOrFirst('namibie', list)).toBe(list[0]);
    expect(biomeOrFirst('kalahari-summer', list)).toBe('kalahari-summer');
    const open = { ...fresh, areas: { unlocked: ['namibie'], classic: null } };
    expect(unlockedBiomes(content, open, playable)).toHaveLength(5);
    expect(unlockedBiomes(content, open, playable)).toContain('namibie');
  });
});
