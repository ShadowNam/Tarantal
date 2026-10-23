// v1.2 (D-033): logs recorded before the map existed (InputLog v3, frozen from origin/main at
// 0ab15a5) still decode with no map and replay to their recorded events on the plain biome.
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../tools/testContent';
import fixtures from './golden/v3-fixtures.json';
import { decodeInputLogText } from './inputLog';
import { runReplay } from './verify';

describe('pre-v1.2 replays (InputLog v3 fixtures)', () => {
  const content = loadContent();
  it('include a Classic and a Season Run hunt', () => {
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      'classic-11-competent-pointer',
      'season-herfs-boss-competent',
    ]);
  });
  for (const f of fixtures) {
    it(`${f.name}: v3, no map, same events as recorded`, () => {
      const log = decodeInputLogText(f.log);
      expect(log.v).toBe(3);
      expect(log.mode.layout).toBeUndefined();
      expect(log.mode.bonus).toBeUndefined();
      const r = runReplay(log, content);
      expect(r.eventHash).toBe(f.expected.eventHash);
      expect(r.result.score).toBe(f.expected.score);
      expect(r.eventCount).toBe(f.expected.eventCount);
    });
  }
});
