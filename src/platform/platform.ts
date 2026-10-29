// Picks the PlatformAdapter from the VITE_PLATFORM build flag (Tech §8), never by sniffing the
// page. Vite replaces the flag at build time, so each build carries one adapter's code path.
import { CapacitorPlatform } from './capacitor';
import { CrazyGamesPlatform } from './crazygames';
import type { PlatformOptions } from './local';
import type { PlatformAdapter, PlatformId } from './PlatformAdapter';
import { PokiPlatform } from './poki';
import { WebPlatform } from './web';

/** Platforms this build can be made for (capacitor: the Android test app, D-058; desktop later). */
export const BUILD_PLATFORMS = ['web', 'poki', 'crazygames', 'capacitor'] as const;
export type BuildPlatform = (typeof BUILD_PLATFORMS)[number];

export function buildPlatform(flag: string | undefined): BuildPlatform {
  const id = flag === undefined || flag === '' ? 'web' : flag;
  if ((BUILD_PLATFORMS as readonly string[]).includes(id)) return id as BuildPlatform;
  throw new Error(`VITE_PLATFORM=${id}: no adapter (one of ${BUILD_PLATFORMS.join(', ')})`);
}

/** This build's platform. */
export function currentPlatformId(): PlatformId {
  return buildPlatform(import.meta.env.VITE_PLATFORM);
}

/**
 * v1.2x (D-034): does this build open the playtest admin page for `?admin=1`? The adapter's own
 * answer (`adminPage`), readable before the adapter exists: the admin page keeps its own save,
 * which must be chosen before the save loads.
 */
export function adminPageInBuild(): boolean {
  const flag = import.meta.env.VITE_PLATFORM;
  if (flag === 'poki') return PokiPlatform.ADMIN_PAGE;
  if (flag === 'crazygames') return CrazyGamesPlatform.ADMIN_PAGE;
  if (flag === 'capacitor') return CapacitorPlatform.ADMIN_PAGE;
  return WebPlatform.ADMIN_PAGE;
}

export function createPlatform(
  opts: PlatformOptions & { readonly serviceWorker: boolean; readonly buildId?: string },
): PlatformAdapter {
  // Compared against the raw flag (a literal after Vite's replacement) so the minifier drops the
  // other adapters: a portal build carries no other portal's SDK URL.
  const flag = import.meta.env.VITE_PLATFORM;
  if (flag === 'poki') return new PokiPlatform(opts);
  if (flag === 'crazygames') return new CrazyGamesPlatform(opts);
  if (flag === 'capacitor')
    return new CapacitorPlatform(
      opts,
      () => import('./capacitorNative').then((m) => m.capacitorNative()),
      document,
    );
  currentPlatformId(); // throws on an unknown flag
  return new WebPlatform(opts);
}
