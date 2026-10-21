// Picks the PlatformAdapter from the VITE_PLATFORM build flag (Tech §8), never by sniffing the
// page. Vite replaces the flag at build time, so each build carries one adapter's code path.
import { CrazyGamesPlatform } from './crazygames';
import type { PlatformOptions } from './local';
import type { PlatformAdapter, PlatformId } from './PlatformAdapter';
import { PokiPlatform } from './poki';
import { WebPlatform } from './web';

/** Platforms this build can be made for (capacitor and desktop wrappers come later). */
export const BUILD_PLATFORMS = ['web', 'poki', 'crazygames'] as const;
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

export function createPlatform(
  opts: PlatformOptions & { readonly serviceWorker: boolean },
): PlatformAdapter {
  // Compared against the raw flag (a literal after Vite's replacement) so the minifier drops the
  // other adapters: a portal build carries no other portal's SDK URL.
  const flag = import.meta.env.VITE_PLATFORM;
  if (flag === 'poki') return new PokiPlatform(opts);
  if (flag === 'crazygames') return new CrazyGamesPlatform(opts);
  currentPlatformId(); // throws on an unknown flag
  return new WebPlatform(opts);
}
