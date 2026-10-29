import { describe, expect, it } from 'vitest';
import { EMPTY_INDEX, type AssetIndex } from '../src/game/assets/assetIndex';
import {
  alternateAssetFiles,
  lazyAssetFiles,
  lazyGroups,
  MB,
  splitInitialLazy,
  verdict,
  type ViteManifest,
} from './sizeBudget';

const manifest: ViteManifest = {
  'index.html': {
    file: 'assets/index-a.js',
    isEntry: true,
    imports: ['_draw.js'],
    dynamicImports: ['src/biomes/bushveld.ts'],
    css: ['assets/index-a.css'],
  },
  '_draw.js': { file: 'assets/draw-b.js' },
  'src/biomes/bushveld.ts': { file: 'assets/bushveld-c.js', imports: ['_draw.js'] },
};

describe('size budget (M9)', () => {
  it('entry + static imports + non-chunk files are initial; dynamic-only chunks are lazy', () => {
    const files = [
      '.vite/manifest.json',
      'assets/bushveld-c.js',
      'assets/draw-b.js',
      'assets/index-a.css',
      'assets/index-a.js',
      'icons/icon-192.png',
      'index.html',
      'sw.js',
    ];
    expect(splitInitialLazy(manifest, files)).toEqual({
      initial: [
        'assets/draw-b.js',
        'assets/index-a.css',
        'assets/index-a.js',
        'icons/icon-192.png',
        'index.html',
        'sw.js',
      ],
      lazy: ['assets/bushveld-c.js'],
      alternate: [],
    });
  });

  it('M10: delivered assets of non-initial groups are lazy, the rest initial', () => {
    const f = (path: string) => ({ path, bytes: 1, hash: '0123456789ab' });
    const index: AssetIndex = {
      ...EMPTY_INDEX,
      initialGroups: ['common', 'karoo-autumn'],
      images: {
        'ui/shell': { group: 'common', file: f('assets/common/shell.png'), width: 1, height: 1 },
        'prop/bush': {
          group: 'bushveld-winter',
          file: f('assets/bv/bush.png'),
          width: 1,
          height: 1,
        },
      },
      layers: {
        'karoo/mid': {
          group: 'karoo-autumn',
          tiles: [f('assets/karoo/mid-0.png')],
          tileWidth: 2048,
          left: -300,
          top: 500,
          height: 400,
        },
      },
    };
    const lazy = lazyAssetFiles(index);
    // D-053: the HD half of the index is never in the first download (nor precached); v1.8b
    // (D-062): nor the voice half.
    expect([...lazy]).toEqual([
      'assets/bv/bush.png',
      'assets/asset-index-hd.json',
      'assets/asset-index-voice.json',
    ]);
    const files = [
      'assets/index-a.js',
      'assets/common/shell.png',
      'assets/bv/bush.png',
      'assets/karoo/mid-0.png',
    ];
    expect(splitInitialLazy(manifest, files, lazy)).toEqual({
      initial: ['assets/index-a.js', 'assets/common/shell.png', 'assets/karoo/mid-0.png'],
      lazy: ['assets/bv/bush.png'],
      alternate: [],
    });
  });

  it('M10: the smaller audio twin and @1x pages beside @2x are alternates, not counted', () => {
    const f = (path: string, bytes = 1) => ({ path, bytes, hash: '0123456789ab' });
    const page = (n: string) => ({ image: f(`${n}.png`), data: f(`${n}.json`) });
    const index: AssetIndex = {
      ...EMPTY_INDEX,
      audio: {
        'sfx/shot': {
          group: 'common',
          kind: 'sfx',
          ogg: f('a.ogg', 900),
          mp3: f('a.mp3', 700),
          loop: false,
          lufs: -14,
          peakDb: -1,
        },
      },
      birds: {
        tarentaal: {
          mid: {
            group: 'common',
            x1: { pages: [page('m1')] },
            x2: { pages: [page('m2')] },
            scale: 1,
            originX: 0.5,
            originY: 0.5,
            clips: {},
          },
        },
      },
    };
    expect([...alternateAssetFiles(index)].sort()).toEqual(['a.mp3', 'm1.json', 'm1.png']);
    const split = splitInitialLazy(
      manifest,
      ['a.ogg', 'a.mp3', 'm2.png'],
      new Set(),
      alternateAssetFiles(index),
    );
    expect(split.initial).toEqual(['a.ogg', 'm2.png']);
    expect(split.alternate).toEqual(['a.mp3']);
  });

  it('5 MB budget, 8 MB hard fail', () => {
    expect(verdict(4.9 * MB)).toBe('ok');
    expect(verdict(5.1 * MB)).toBe('over-budget');
    expect(verdict(8.1 * MB)).toBe('hard-fail');
  });
});

describe('lazy chunks per biome (v1.1, D-032)', () => {
  it('groups lazy files by asset group folder and by code chunk name', () => {
    const g = lazyGroups(
      [
        'assets/bushveld-DnKz.js',
        'assets/bushveld-winter/audio/music/calm.1.ogg',
        'assets/okavango-spring/layers/near-0.png',
        'assets/late/birds/x.png',
        'assets/draw-abc.js',
      ],
      ['bushveld-winter', 'common', 'karoo-autumn', 'late', 'okavango-spring'],
    );
    expect(g.get('bushveld-winter')).toEqual([
      'assets/bushveld-DnKz.js',
      'assets/bushveld-winter/audio/music/calm.1.ogg',
    ]);
    expect(g.get('okavango-spring')).toHaveLength(1);
    expect(g.get('late')).toHaveLength(1);
    expect(g.get('other')).toEqual(['assets/draw-abc.js']);
  });
});
