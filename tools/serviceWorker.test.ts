import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cacheVersion, precacheList, serviceWorkerSource } from './serviceWorker';

describe('service worker generation', () => {
  it('precaches the scope root and every built file except maps and the worker', () => {
    expect(
      precacheList([
        'index.html',
        'assets/index-abc.js',
        'assets/index-abc.js.map',
        'sw.js',
        'icons/icon-192.png',
      ]),
    ).toEqual(['./', 'assets/index-abc.js', 'icons/icon-192.png', 'index.html']);
  });

  it('changes the cache version when any file changes', () => {
    const a = cacheVersion([
      ['index.html', '1'],
      ['a.js', '2'],
    ]);
    expect(
      cacheVersion([
        ['a.js', '2'],
        ['index.html', '1'],
      ]),
    ).toBe(a);
    expect(
      cacheVersion([
        ['index.html', '1'],
        ['a.js', '3'],
      ]),
    ).not.toBe(a);
  });

  it('serves navigations from the cached index.html when offline, ignoring the query', () => {
    const src = serviceWorkerSource('v1', ['./', 'index.html']);
    expect(src).toContain("const CACHE = 'tm-v1'");
    expect(src).toMatch(/match\(abs\('.\/index.html'\), \{ ignoreSearch: true \}\)/);
    expect(src).toContain('self.skipWaiting()');
    expect(src).toContain('self.clients.claim()');
    // It must be valid JavaScript.
    expect(() => new Script(src)).not.toThrow();
  });
});
