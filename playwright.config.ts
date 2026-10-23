import { existsSync } from 'node:fs';
import { defineConfig, devices, webkit, type Project } from '@playwright/test';

// Smoke tests run against the production build (`vite preview`).
// Profiles from docs/04-BUILD-PLAN.md M0: desktop Chromium + WebKit, Pixel 7 and iPhone 14 in
// landscape, plus portrait for the rotate card.
//
// Some sandboxes (e.g. Claude Code cloud sessions on the Trusted network) cannot download WebKit.
// Outside CI, a missing WebKit swaps the WebKit profiles for Chromium emulation of the same
// device (same viewport, touch and user agent) so layout can still be checked; CI always needs
// the real WebKit and fails without it.
const isCI = process.env['CI'] === 'true';
const hasWebKit = existsSync(webkit.executablePath());
// PW_NO_WEBKIT=1 (local only): WebKit is installed but the host lacks its system libraries.
const useWebKit = isCI || (hasWebKit && process.env['PW_NO_WEBKIT'] !== '1');

// Print once from the main process, not from every worker.
if (!useWebKit && process.env['TEST_WORKER_INDEX'] === undefined) {
  console.warn(
    '[playwright] WebKit not installed: running WebKit profiles on Chromium (local only).',
  );
}

function profile(name: string, device: (typeof devices)[string], orientation: string): Project {
  const needsWebKit = device.defaultBrowserType === 'webkit';
  const fallback = needsWebKit && !useWebKit;
  return {
    name: fallback ? `${name}-chromium-fallback` : name,
    use: { ...device, ...(fallback ? { browserName: 'chromium' as const } : {}) },
    metadata: { orientation },
  };
}

// CI splits the long Season Run spec into its own desktop job so it doesn't starve the timing
// tests (perf, menus) that share a runner with it, and runs the perf specs alone in their own job
// (one worker): E2E_ONLY takes a spec glob, E2E_SKIP one or more comma-separated globs (the PR
// lane skips the Season Run and perf specs, D-030).
const only = process.env['E2E_ONLY'] || undefined;
// M9: E2E_PLATFORM=poki|crazygames builds and serves that portal build (with its test hooks,
// VITE_TEST_HOOKS=1) instead of the web build; platform.spec.ts tests it against a fake SDK.
const e2ePlatform = process.env['E2E_PLATFORM'] || 'web';
// v1.0.1 (D-028): every e2e build is a CI test build (VITE_TEST_HOOKS=1: `?e2e` may record
// official Dailies and share). E2E_BUILD=public builds what Pages ships instead (no flag), for
// daily-public.spec.ts, which proves that build refuses them.
const publicBuild = process.env['E2E_BUILD'] === 'public';
/** Exported for playwright.local*.config.ts (scratch configs on other ports). */
export const buildEnv = publicBuild
  ? ''
  : e2ePlatform === 'web'
    ? 'VITE_TEST_HOOKS=1 '
    : `VITE_PLATFORM=${e2ePlatform} VITE_TEST_HOOKS=1 `;
const skip = process.env['E2E_SKIP'] || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  // M10 visual regression (tests/e2e/visual.spec.ts): committed baselines, one per screen and
  // profile; Linux (CI) is the reference platform. Update with --update-snapshots (docs/06 §7).
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}-{projectName}{ext}',
  expect: {
    // Software-rendered WebGL (SwiftShader) and font antialiasing differ slightly between runs and
    // machines: allow 2 % of pixels to differ, each by a colour distance of up to 0.25.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.25, animations: 'disabled' },
  },
  // The public-build spec runs only against that build, and nothing else does.
  ...(publicBuild ? { testMatch: '**/daily-public.spec.ts' } : only ? { testMatch: only } : {}),
  testIgnore: [
    ...(publicBuild ? [] : ['**/daily-public.spec.ts']),
    ...(skip ? skip.split(',').filter(Boolean) : []),
  ],
  outputDir: 'test-results',
  fullyParallel: true,
  // Software-rendered WebGL (CI, sandboxes) runs the game at a few fps; give boots room.
  timeout: 90_000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // No trace screenshots: each one is a full-canvas GPU readback, which stalls software-rendered
    // WebGL (CI, sandboxes) for long enough to distort timing tests. DOM snapshots stay on.
    trace: { mode: 'retain-on-failure', screenshots: false },
  },
  projects: [
    profile('desktop-chromium', devices['Desktop Chrome'], 'landscape'),
    profile('desktop-webkit', devices['Desktop Safari'], 'landscape'),
    profile('pixel7-landscape', devices['Pixel 7 landscape'], 'landscape'),
    profile('iphone14-landscape', devices['iPhone 14 landscape'], 'landscape'),
    profile('pixel7-portrait', devices['Pixel 7'], 'portrait'),
    profile('iphone14-portrait', devices['iPhone 14'], 'portrait'),
  ],
  webServer: {
    command: `${buildEnv}npm run build && ${buildEnv}npx vite preview --port 4173 --strictPort`,
    url: 'http://localhost:4173',
    // A special build (public, portal) must never reuse a server left running with another one.
    reuseExistingServer: !isCI && !publicBuild && e2ePlatform === 'web',
    timeout: 120_000,
  },
});
