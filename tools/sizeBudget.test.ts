import { describe, expect, it } from 'vitest';
import { MB, splitInitialLazy, verdict, type ViteManifest } from './sizeBudget';

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

  it('5 MB budget, 8 MB hard fail', () => {
    expect(verdict(4.9 * MB)).toBe('ok');
    expect(verdict(5.1 * MB)).toBe('over-budget');
    expect(verdict(8.1 * MB)).toBe('hard-fail');
  });
});
