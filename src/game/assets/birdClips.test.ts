import { describe, expect, it } from 'vitest';
import { BIRD_CLIPS, type BirdClip } from './assetIndex';
import { CLIP_FALLBACK, clipFor, resolveClip } from './birdClips';

describe('bird clips (M10)', () => {
  it('maps flock phases to the §3.4 clips', () => {
    expect(clipFor('flock', 'alert', 1, 0, 90)).toBe('alert');
    expect(clipFor('flock', 'run', 1, 0, 90)).toBe('run');
    expect(clipFor('flock', 'launch', 1, 0, 90)).toBe('takeoff');
    expect(clipFor('flock', 'flap', 1, 0, 90)).toBe('flap');
    expect(clipFor('flock', 'glide', 1, 0, 90)).toBe('glide');
    expect(clipFor('flock', 'land', 1, 0, 90)).toBe('land');
    expect(clipFor('flyover', 'fly', 1, 0, 90)).toBe('flap');
    expect(clipFor('popup', 'stare', 1, 0, 90)).toBe('peek');
  });

  it('foraging birds alternate walk and peck spells, staggered by id', () => {
    const at = (id: number) =>
      Array.from({ length: 6 }, (_, spell) => clipFor('flock', 'walk', id, spell * 90, 90));
    expect(at(0)).toEqual([
      'peck',
      'forage_walk',
      'forage_walk',
      'peck',
      'forage_walk',
      'forage_walk',
    ]);
    expect(at(1)).not.toEqual(at(0));
  });

  it('D-067: a flock feeding at a Reënbui column pecks two spells in three', () => {
    let pecks = 0;
    let plain = 0;
    for (let tick = 0; tick < 300; tick += 10) {
      if (clipFor('flock', 'walk', 4, tick, 10, true) === 'peck') pecks++;
      if (clipFor('flock', 'walk', 4, tick, 10) === 'peck') plain++;
    }
    expect(pecks).toBe(20);
    expect(plain).toBe(10);
    expect(clipFor('flock', 'run', 4, 0, 10, true)).toBe('run');
  });

  it('every fallback chain ends, and a missing clip falls back along it', () => {
    for (const c of BIRD_CLIPS) expect(resolveClip(c, () => false)).toBeNull();
    const only = (have: readonly BirdClip[]) => (c: BirdClip) => have.includes(c);
    expect(resolveClip('land', only(['forage_walk']))).toBe('forage_walk');
    expect(resolveClip('glide', only(['flap']))).toBe('flap');
    expect(resolveClip('peek', only(['alert', 'forage_walk']))).toBe('alert');
    expect(resolveClip('flap', only(['forage_walk']))).toBeNull();
    expect(Object.keys(CLIP_FALLBACK).sort()).toEqual([...BIRD_CLIPS].sort());
  });
});
