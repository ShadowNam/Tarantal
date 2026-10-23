import { describe, expect, it } from 'vitest';
import { atlasRegion, checkBirdAtlas } from './atlasCheck';
import { resolveClip } from './birdClips';

const clip = (frames: string[]) => ({ frames, fps: 12, loop: true });
const page = (names: string[]) => ({
  frames: Object.fromEntries(names.map((n) => [n, {}])),
  meta: {},
});

describe('bird atlas check (M10 review)', () => {
  it('keeps clips whose frames all exist across the pages', () => {
    const r = checkBirdAtlas({ flap: clip(['flap/00', 'flap/01']), peck: clip(['peck/00']) }, [
      page(['flap/00']),
      page(['flap/01', 'peck/00']),
    ]);
    expect(Object.keys(r.clips ?? {}).sort()).toEqual(['flap', 'peck']);
    expect(r.dropped).toEqual([]);
  });

  it('drops a clip with a missing frame, so its fallback plays', () => {
    const six = ['00', '01', '02', '03', '04', '05'].map((n) => `peck/${n}`);
    const r = checkBirdAtlas({ peck: clip(six), forage_walk: clip(['forage_walk/00']) }, [
      page([...six.slice(0, 5), 'forage_walk/00']),
    ]);
    expect(r.dropped).toEqual(['peck']);
    expect(resolveClip('peck', (c) => r.clips?.[c] !== undefined)).toBe('forage_walk');
  });

  it('a corrupt page ({}, [], no frames) or no usable clip rejects the whole atlas', () => {
    const clips = { flap: clip(['flap/00']) };
    for (const bad of [{}, [], { frames: [] }, { frames: null }, null, 'x'])
      expect(checkBirdAtlas(clips, [bad]).clips).toBeNull();
    expect(checkBirdAtlas({ flap: clip([]) }, [page([])]).clips).toBeNull();
    expect(checkBirdAtlas(clips, [page(['other/00'])]).clips).toBeNull();
  });
});

describe('atlasRegion (D-035 shed gun icons)', () => {
  const page = (frames: Record<string, unknown>): object => ({ frames, meta: {} });
  it('finds a frame on any page', () => {
    const pages = [
      page({ 'fire/00': { frame: { x: 2, y: 2, w: 10, h: 20 } } }),
      page({ 'idle/00': { frame: { x: 30, y: 40, w: 414, h: 520 }, rotated: false } }),
    ];
    expect(atlasRegion(pages, 'idle/00')).toEqual({
      page: 1,
      x: 30,
      y: 40,
      w: 414,
      h: 520,
      rotated: false,
    });
  });
  it('is null for a missing or malformed frame', () => {
    expect(atlasRegion([page({})], 'idle/00')).toBeNull();
    expect(atlasRegion([page({ 'idle/00': { frame: { x: 'a' } } })], 'idle/00')).toBeNull();
    expect(atlasRegion([{}], 'idle/00')).toBeNull();
  });
});
