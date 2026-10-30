// v1.8b (D-062, review round 2): on every map, no seat a mother can take sits in the line of fire
// of a fruit, a secret's part or a tell in front of the ridge, anywhere in the camera's sweep (a
// player aiming at the sausages must never lose 15 points to a mother behind them).
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../testContent';
import { lineOfFireIssues, loadArtData } from './troopLineOfFire';

describe('baboon mothers sit out of the line of fire (D-062)', () => {
  const content = loadContent();
  const art = loadArtData(join(import.meta.dirname, '..', '..'));
  for (const b of content.biomes)
    it(`${b.id}: every map`, () => {
      expect(lineOfFireIssues(content, b, art)).toEqual([]);
    });

  it('catches the Okavango troop where it sat in review round 1 (behind the sausage tree)', () => {
    const b = content.biomes.find((x) => x.id === 'okavango-spring');
    if (b === undefined) throw new Error('no Okavango');
    expect(lineOfFireIssues(content, b, art, 0.575).length).toBeGreaterThan(0);
  });
});
