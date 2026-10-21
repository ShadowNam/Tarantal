import { describe, expect, it } from 'vitest';
import { EMPTY_INDEX, type AssetIndex } from '../src/game/assets/assetIndex';
import { lazyAssetFiles, MB, splitInitialLazy, verdict, type ViteManifest } from './sizeBudget';

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
    expect([...lazy]).toEqual(['assets/bv/bush.png']);
    const files = [
      'assets/index-a.js',
      'assets/common/shell.png',
      'assets/bv/bush.png',
      'assets/karoo/mid-0.png',
    ];
    expect(splitInitialLazy(manifest, files, lazy)).toEqual({
      initial: ['assets/index-a.js', 'assets/common/shell.png', 'assets/karoo/mid-0.png'],
      lazy: ['assets/bv/bush.png'],
    });
  });

  it('5 MB budget, 8 MB hard fail', () => {
    expect(verdict(4.9 * MB)).toBe('ok');
    expect(verdict(5.1 * MB)).toBe('over-budget');
    expect(verdict(8.1 * MB)).toBe('hard-fail');
  });
});
