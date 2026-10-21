import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { serviceWorkerPlugin } from './tools/serviceWorker';

// One build per platform (M9, Tech §8): VITE_PLATFORM=web (default, the PWA in dist/) or a
// portal (dist-poki/, dist-crazygames/). Portal builds carry no service worker and no PWA
// manifest: the portal's page owns install, fullscreen and caching.
const PLATFORMS = ['web', 'poki', 'crazygames'];
const platform = process.env['VITE_PLATFORM'] || 'web';
if (!PLATFORMS.includes(platform)) {
  throw new Error(`VITE_PLATFORM=${platform}: expected one of ${PLATFORMS.join(', ')}`);
}
const portal = platform !== 'web';

/** Portal builds: drop the PWA manifest and the iOS home-screen tags from index.html. */
function stripPwa(): Plugin {
  return {
    name: 'tm-strip-pwa',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/\s*<meta name="apple-mobile-web-app-[^>]*>/g, '')
        .replace(/\s*<meta name="mobile-web-app-capable"[^>]*>/, '');
    },
    // public/manifest.webmanifest is copied into every build; nothing references it here.
    writeBundle(options) {
      if (options.dir !== undefined)
        rmSync(join(options.dir, 'manifest.webmanifest'), { force: true });
    },
  };
}

// Default export is required by Vite (config files are exempt from the named-exports rule).
export default defineConfig({
  base: './',
  plugins: portal ? [stripPwa()] : [serviceWorkerPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    outDir: portal ? `dist-${platform}` : 'dist',
  },
  server: { host: true },
  preview: { host: true, port: 4173, strictPort: true },
});
