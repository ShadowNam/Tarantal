// v1.9 (D-066): client/soundscape.json's cross-references, and every call's voice is held at
// least as long as its interim sound lasts.
import { describe, expect, it } from 'vitest';
import { loadContent, loadFeel, loadSoundscape } from '../../tools/testContent';
import { renderCall, SOUNDSCAPE_CALLS, SOUNDSCAPE_RATE } from '../../tools/audio/soundscape';
import { checkSoundscape, type SoundscapeRefs } from './soundscape';

const content = loadContent();
const sc = loadSoundscape();
const refs: SoundscapeRefs = {
  biomes: content.biomes.map((b) => b.id),
  lights: Object.keys(loadFeel().lights),
  layoutLights: [...new Set(content.biomes.flatMap((b) => b.layouts.map((l) => l.light)))],
  bonusLights: [
    ...new Set(
      content.biomes.flatMap((b) => b.bonusMaps.flatMap((m) => (m.light === undefined ? [] : [m.light]))),
    ),
  ],
  creatures: new Map(content.birds.creatures.map((c) => [c.id, c.kind])),
  sounds: new Set(SOUNDSCAPE_CALLS.map((id) => `sfx/${id}`)),
};

describe('client/soundscape.json (D-066)', () => {
  it('passes its cross-checks; every biome, the Harvest too, has a soundscape', () => {
    expect(checkSoundscape(sc, refs)).toEqual([]);
    expect(Object.keys(sc.areas)).toEqual(expect.arrayContaining(['oes', 'okavango-spring']));
  });

  it('catches a missing area, a near penalty call, an unknown light and a silent sound', () => {
    const areas = Object.fromEntries(Object.entries(sc.areas).filter(([a]) => a !== 'oes'));
    const bad = {
      ...sc,
      areas: {
        ...areas,
        'okavango-spring': [
          ...(sc.areas['okavango-spring'] ?? []),
          { call: 'fish_eagle', weight: 1, perMinute: 1, levelDb: 0, distance: 'near' as const, profile: 'nope' },
        ],
      },
      hazeDb: { ...sc.hazeDb, sunset_glow: -1 },
      calls: { ...sc.calls, owl: { sound: 'sfx/amb_owl', lengthMs: 100 } },
    };
    const errors = checkSoundscape(bad, refs).join('\n');
    expect(errors).toContain('biome oes has no soundscape');
    expect(errors).toContain('far only');
    expect(errors).toContain('no profile nope');
    expect(errors).toContain('hazeDb.sunset_glow: no such light');
    expect(errors).toContain('sfx/amb_owl has no sound');
    expect(errors).toContain('calls.owl: no area plays it');
  });

  it("each call's lengthMs covers its interim sound", () => {
    for (const [id, c] of Object.entries(sc.calls)) {
      const ms = (renderCall(c.sound.slice('sfx/'.length)).length / SOUNDSCAPE_RATE) * 1000;
      expect(c.lengthMs, id).toBeGreaterThanOrEqual(Math.floor(ms));
    }
  });
});
