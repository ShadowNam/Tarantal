import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from '../../tools/serviceWorker';
import { CrazyGamesPlatform } from './crazygames';
import {
  FRESH_PARAM,
  freshLoad,
  freshLoadShown,
  freshUrl,
  ownedCaches,
  ownsScope,
  type FreshLoadDeps,
} from './freshLoad';
import { PokiPlatform } from './poki';
import { WebPlatform } from './web';

const opts = { log: false, adTimeoutMs: 1000, sdkTimeoutMs: 1000 };

describe('Skietbaan fresh load (D-042 (14))', () => {
  it('keeps every parameter and the hash, and adds fresh=<now>', () => {
    const url = new URL(
      freshUrl('https://x.test/tarantal/?admin=1&seed=42#top', 1_761_380_000_123),
    );
    expect(url.pathname).toBe('/tarantal/');
    expect(url.searchParams.get('admin')).toBe('1');
    expect(url.searchParams.get('seed')).toBe('42');
    expect(url.searchParams.get(FRESH_PARAM)).toBe('1761380000123');
    expect(url.hash).toBe('#top');
  });

  it('replaces an earlier fresh value instead of piling them up', () => {
    const once = freshUrl('https://x.test/?admin=1', 100);
    const twice = new URL(freshUrl(once, 200));
    expect(twice.searchParams.getAll(FRESH_PARAM)).toEqual(['200']);
    expect(twice.searchParams.get('admin')).toBe('1');
  });

  it('works on a page without a query', () => {
    expect(freshUrl('http://localhost:5173/', 7)).toBe('http://localhost:5173/?fresh=7');
  });

  it("deletes only the worker's own caches", () => {
    expect(ownedCaches(['tm-0123abcd', 'other-app', 'tm-old', 'workbox-precache'])).toEqual([
      'tm-0123abcd',
      'tm-old',
    ]);
    // The prefix is the one the generated worker uses.
    expect(serviceWorkerSource('abc', ['./'])).toContain("const CACHE = 'tm-abc';");
  });

  it("unregisters only this game's worker scope (Pages shares one origin)", () => {
    const page = 'https://me.github.io/Tarantal/?admin=1';
    expect(ownsScope('https://me.github.io/Tarantal/', page)).toBe(true);
    expect(ownsScope('https://me.github.io/Tarantal/sub/', page)).toBe(true);
    expect(ownsScope('https://me.github.io/', page)).toBe(false);
    expect(ownsScope('https://me.github.io/Other/', page)).toBe(false);
  });

  /** Fakes for one fresh load (a test overrides a step to throw or never settle). */
  function fakes(over: Partial<FreshLoadDeps> = {}): {
    deps: FreshLoadDeps;
    log: string[];
  } {
    const log: string[] = [];
    const reg = (scope: string) => ({
      scope,
      unregister: () => {
        log.push(`unregister ${scope}`);
        return Promise.resolve(true);
      },
    });
    const deps: FreshLoadDeps = {
      href: 'https://me.github.io/Tarantal/?admin=1&e2e=1',
      now: 42,
      registrations: () =>
        Promise.resolve([reg('https://me.github.io/Tarantal/'), reg('https://me.github.io/')]),
      cacheKeys: () => Promise.resolve(['tm-a', 'other', 'tm-b']),
      deleteCache: (k) => {
        log.push(`delete ${k}`);
        return Promise.resolve(true);
      },
      wait: () => Promise.resolve(),
      go: (url) => {
        log.push(`go ${url}`);
      },
      ...over,
    };
    return { deps, log };
  }

  it('clears the worker and its caches, then reloads with the same params', async () => {
    const { deps, log } = fakes({ wait: () => new Promise<void>(() => undefined) });
    await freshLoad(deps);
    expect(log).toEqual([
      'unregister https://me.github.io/Tarantal/',
      'delete tm-a',
      'delete tm-b',
      'go https://me.github.io/Tarantal/?admin=1&e2e=1&fresh=42',
    ]);
  });

  it('still reloads when a step throws or hangs', async () => {
    const { deps, log } = fakes({
      registrations: () => Promise.reject(new Error('SecurityError')),
      cacheKeys: () => new Promise<readonly string[]>(() => undefined),
    });
    await freshLoad(deps);
    expect(log).toEqual(['go https://me.github.io/Tarantal/?admin=1&e2e=1&fresh=42']);
  });

  it('shows on the web build (dev server, GitHub Pages), never on portal builds', () => {
    expect(freshLoadShown(new WebPlatform({ ...opts, serviceWorker: false }))).toBe(true);
    expect(freshLoadShown(new PokiPlatform(opts))).toBe(false);
    expect(freshLoadShown(new CrazyGamesPlatform(opts))).toBe(false);
    expect(freshLoadShown({ id: 'web', adminPage: false })).toBe(false);
  });
});
