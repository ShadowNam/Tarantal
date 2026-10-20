// Picks the PlatformAdapter from the VITE_PLATFORM build flag (Tech §8). Portal adapters
// (Poki, CrazyGames, Capacitor) arrive in M9.
import type { PlatformAdapter } from './PlatformAdapter';
import { WebPlatform } from './web';

export function createPlatform(opts: { serviceWorker: boolean; log: boolean }): PlatformAdapter {
  const id = (import.meta.env['VITE_PLATFORM'] as string | undefined) ?? 'web';
  switch (id) {
    case 'web':
      return new WebPlatform(opts);
    default:
      throw new Error(`VITE_PLATFORM=${id}: adapter arrives in M9`);
  }
}
