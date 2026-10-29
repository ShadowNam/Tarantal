// v1.7d (D-059): identical layer tiles share one texture key (one texture on the GPU).
import { describe, expect, it } from 'vitest';
import { sharedTileKeys, type FileRef } from './assetIndex';

const tile = (hash: string, i: number): FileRef => ({
  path: `assets/x/layers/fg-${String(i)}.${hash}.png`,
  bytes: 220,
  hash,
});

describe('sharedTileKeys', () => {
  it('gives tiles with the same file the first copy’s key', () => {
    const h = ['aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'aaaaaaaaaaaa', 'cccccccccccc'];
    expect(sharedTileKeys('final:layer/namibie/foreground/hd', h.map(tile))).toEqual([
      'final:layer/namibie/foreground/hd/0',
      'final:layer/namibie/foreground/hd/0',
      'final:layer/namibie/foreground/hd/2',
      'final:layer/namibie/foreground/hd/0',
      'final:layer/namibie/foreground/hd/4',
    ]);
  });
  it('keeps one key per tile when every file differs', () => {
    expect(sharedTileKeys('k', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].map(tile))).toEqual(['k/0', 'k/1']);
  });
});
