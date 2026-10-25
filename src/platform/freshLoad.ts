// v1.6 (D-042 (14)): the Skietbaan's "Fresh load" button (dev builds). After a deploy a page could
// hold stale or placeholder art until a hard refresh; this does that refresh from the game: the
// web adapter (web.ts hardRefresh) unregisters the service worker, deletes the game's caches and
// reloads with a cache-busting parameter. The save (localStorage) is never touched. Pure parts
// here (unit-tested).
import type { PlatformAdapter } from './PlatformAdapter';
import { CACHE_PREFIX } from './swUpdate';

/** The cache-busting query parameter the reload adds (or replaces). */
export const FRESH_PARAM = 'fresh';

/**
 * The page's URL with `fresh=<now>` set: every other parameter (`admin`, `e2e`, `seed`, …) and
 * the hash stay, so the player lands back on the same page with the same setup.
 */
export function freshUrl(href: string, now: number): string {
  const url = new URL(href);
  url.searchParams.set(FRESH_PARAM, String(Math.floor(now)));
  return url.toString();
}

/** The Cache Storage entries the game's service worker owns (tools/serviceWorker.ts: `tm-*`). */
export function ownedCaches(keys: readonly string[]): string[] {
  return keys.filter((k) => k.startsWith(CACHE_PREFIX));
}

/**
 * Whether a service worker registration belongs to this game: its scope is the page's directory
 * or below it. GitHub Pages serves many projects from one origin, so a worker scoped above the
 * game (another site's) is left alone.
 */
export function ownsScope(scope: string, href: string): boolean {
  return scope.startsWith(new URL('./', href).href);
}

/** How long one clean-up step may take before the reload goes ahead anyway (ms). */
export const FRESH_STEP_MS = 3000;

/** What a fresh load does to the browser (web.ts passes the real ones; tests pass fakes). */
export interface FreshLoadDeps {
  /** The page's URL now. */
  readonly href: string;
  /** Wall-clock ms (the cache-busting value). */
  readonly now: number;
  /** Service worker registrations of this origin (none without the API). */
  registrations(): Promise<readonly { readonly scope: string; unregister(): Promise<boolean> }[]>;
  /** Cache Storage names of this origin (none without the API). */
  cacheKeys(): Promise<readonly string[]>;
  deleteCache(key: string): Promise<boolean>;
  /** Resolves after `ms` (a step that hangs must not keep the page from reloading). */
  wait(ms: number): Promise<void>;
  /** Navigates to the URL (location.replace: no extra history entry). */
  go(url: string): void;
}

/** Runs a clean-up step; a failure or a hang (FRESH_STEP_MS) never stops the reload. */
async function step(d: FreshLoadDeps, run: () => Promise<unknown>): Promise<void> {
  try {
    await Promise.race([run(), d.wait(FRESH_STEP_MS)]);
  } catch {
    // Blocked storage, no API, a private window: reload regardless.
  }
}

/**
 * Unregisters this game's service worker, deletes its caches, then reloads with `fresh=<now>`.
 * Never touches localStorage (the save stays). Every step is guarded: the reload always happens.
 */
export async function freshLoad(d: FreshLoadDeps): Promise<void> {
  await step(d, async () => {
    const regs = (await d.registrations()).filter((r) => ownsScope(r.scope, d.href));
    await Promise.all(regs.map((r) => r.unregister()));
  });
  await step(d, async () => {
    await Promise.all(ownedCaches(await d.cacheKeys()).map((k) => d.deleteCache(k)));
  });
  let url = d.href;
  try {
    url = freshUrl(d.href, d.now);
  } catch {
    // An unparsable URL: a plain reload of the same address.
  }
  d.go(url);
}

/**
 * Whether the Skietbaan offers "Fresh load": the web build with the playtest admin page (the dev
 * server and the GitHub Pages build), never a portal build (Poki, CrazyGames: no admin page, and
 * their page owns caching). The same gate as the admin page and the Skietbaan itself (D-034).
 */
export function freshLoadShown(platform: Pick<PlatformAdapter, 'id' | 'adminPage'>): boolean {
  return platform.id === 'web' && platform.adminPage;
}
