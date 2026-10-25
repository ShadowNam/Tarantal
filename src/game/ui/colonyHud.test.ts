// v1.7 look round (D-044): every meerkat colony stays clear of the HUD corners and the gun at rest
// at each desert map's opening view, on every device (colonyScreen.ts has the geometry).
import { describe, expect, it } from 'vitest';
import { loadContent, loadFeel } from '../../../tools/testContent';
import { hasColonies } from '../../sim/meerkats/colony';
import { colonyScreenClashes } from './colonyScreen';

const content = loadContent();

describe('meerkat colonies stay clear of the HUD and the gun (v1.7 look round, D-044)', () => {
  for (const biome of content.biomes.filter(hasColonies))
    it(`${biome.id}: every map's opening view on every device`, () => {
      expect(colonyScreenClashes(content, biome, loadFeel().hud)).toEqual([]);
    });
});
