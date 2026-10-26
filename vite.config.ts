import { execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildIdOf } from './src/platform/swUpdate';
import { serviceWorkerPlugin } from './tools/serviceWorker';
import { isContentJson, withoutComments } from './tools/stripComments';

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

/**
 * M10, dev server only: `STANDIN=1 npm run dev` serves the stand-in delivery
 * (tests/fixtures/standin-assets/, from tools/make-standins.ts) in place of public/assets/, to
 * look at the art swap path. Never part of a build.
 */
function standinAssets(): Plugin {
  const root = join(import.meta.dirname, 'tests', 'fixtures', 'standin-assets');
  const types: Record<string, string> = {
    '.json': 'application/json',
    '.png': 'image/png',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
  };
  return {
    name: 'tm-standin-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const at = path.indexOf('/assets/');
        const file = at < 0 ? '' : join(root, path.slice(at + 1));
        if (file === '' || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}
const standin = process.env['STANDIN'] === '1';

/** D-048: content JSON is bundled without its `$comment` keys (tools/stripComments.ts). */
function stripContentComments(): Plugin {
  return {
    name: 'tm-strip-content-comments',
    enforce: 'pre',
    transform(code, id) {
      if (!isContentJson(id)) return null;
      return { code: JSON.stringify(withoutComments(JSON.parse(code))), map: null };
    },
  };
}
/** M10: the release version (package.json), shown in Settings → Privacy. */
const version = (
  JSON.parse(readFileSync(join(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }
).version;

/** D-034: the commit a build was made from, for playtest reports (CI sets GITHUB_SHA). */
function buildSha(): string {
  const ci = process.env['GITHUB_SHA'];
  if (ci !== undefined && ci !== '') return ci.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const sha = buildSha();
// v1.6 (D-042): the build stamp's time (UTC, to the minute).
const builtAt = new Date().toISOString().slice(0, 16);

// Default export is required by Vite (config files are exempt from the named-exports rule).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_SHA__: JSON.stringify(sha),
    __BUILD_TIME__: JSON.stringify(builtAt),
  },
  plugins: [
    stripContentComments(),
    // The worker names this build, so a page offers a reload only when it runs another (D-042).
    ...(portal ? [stripPwa()] : [serviceWorkerPlugin(buildIdOf(sha, builtAt))]),
    ...(standin ? [standinAssets()] : []),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    outDir: portal ? `dist-${platform}` : 'dist',
    // .vite/manifest.json: which chunks the entry loads at once (tools/size-check.ts).
    manifest: true,
  },
  server: { host: true },
  preview: { host: true, port: 4173, strictPort: true },
});
