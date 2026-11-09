// v1.17b (D-080): the true-size Namibië pair stands in front of the far and Ver bands (the check
// with sizeMul finds it); its pellets pass through instead (hitTest.test.ts), so the map passes.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../tools/testContent';
import { ostrichBehind, ostrichIssues } from './ostrichChecks';

const content = loadContent();
const nam = content.biomes.find((b) => b.id === 'namibie');

describe('ostrich checks at true size (D-080)', () => {
  it('the pair covers the bands behind it (so it must pass pellets through)', () => {
    if (nam === undefined) throw new Error('no Namibië');
    expect(ostrichBehind(content, nam).length).toBeGreaterThan(0);
  });
  it('every map passes the rest of the checks', () => {
    for (const b of content.biomes) expect(ostrichIssues(content, b)).toEqual([]);
  });
});
