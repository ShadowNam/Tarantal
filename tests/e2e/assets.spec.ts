// M10 asset swap path (docs/06-ASSET-DELIVERY.md). The stand-in delivery made by
// tools/make-standins.ts (one tarentaal atlas, the Karoo mid layer, two SFX) is served with
// page.route, as if it had been packed into public/assets/ — it is never in a build. With it the
// game loads those keys as final through the manifest; without it (the shipped state today) or with
// a file broken, the same keys fall back to their procedural placeholders, and no texture is missing.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  waitTicks,
} from './helpers';

const STANDIN = join(import.meta.dirname, '..', 'fixtures', 'standin-assets');
/** The stand-in keys and how the hook names them. */
const FINAL_KEYS = [
  'bird/tarentaal/near',
  'bird/tarentaal/mid',
  'bird/tarentaal/far',
  'karoo/mid',
  'sfx/shot',
  'sfx/poof',
];

/** Serves tests/fixtures/standin-assets/assets/** in place of the build's assets/ (where present). */
// The PWA service worker would fetch delivered files itself once it controls the page, and
// page.route never sees those requests (CI saw the server's index.html instead of the art).
test.use({ serviceWorkers: 'block' });

async function serveStandins(page: Page, broken: RegExp | null = null): Promise<string[]> {
  const served: string[] = [];
  await page.route('**/assets/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const rel = path.slice(path.indexOf('/assets/') + 1);
    const file = join(STANDIN, rel);
    if (!existsSync(file)) return route.fallback();
    if (broken?.test(rel)) return route.fulfill({ status: 404, body: '' });
    served.push(rel);
    return route.fulfill({ path: file });
  });
  return served;
}

async function statuses(page: Page): Promise<Record<string, string>> {
  const h = await hook(page);
  const entries = h.assets.byBiome['karoo-autumn'] ?? [];
  return Object.fromEntries(entries.map((e) => [e.key, e.status]));
}

test('a stand-in delivery loads through the manifest with no code change', async ({
  page,
  browserName,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  const touch = isTouchProject(info);
  const served = await serveStandins(page);
  await boot(page, 'seed=42');
  const h = await hook(page);
  expect(h.assets.problem).toBeNull();
  const st = await statuses(page);
  for (const key of FINAL_KEYS) expect(st[key], key).toBe('final');
  // Everything not delivered stays a placeholder.
  const others = Object.entries(st).filter(([k]) => !FINAL_KEYS.includes(k));
  expect(others.length).toBeGreaterThan(50);
  for (const [k, s] of others) expect(s, k).toBe('placeholder');
  expect(served).toContain('assets/asset-index.json');
  expect(served.some((p) => p.includes('/layers/mid-'))).toBe(true);
  expect(served.some((p) => p.includes('/birds/tarentaal-'))).toBe(true);

  await startHunt(page, touch);
  expect((await hook(page)).missingTextures).toEqual([]);
  // The start tap unlocked audio: the two recordings are decoded and replace the synth. (Chromium
  // only: Linux WebKit builds may lack the codecs; real Safari plays the MP3s.)
  if (browserName === 'chromium') {
    await page.waitForFunction(
      () => ['sfx/shot', 'sfx/poof'].every((k) => window.__TM__?.assets.recorded.includes(k)),
      null,
      { timeout: 30_000 },
    );
  }
  // Give the flock time to come on screen, then record what the swap looks like.
  await waitTicks(page, 240);
  await page.screenshot({ path: `${SCREENSHOTS}/assets-standin-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('with no delivery every key falls back to its placeholder', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  await boot(page, 'seed=42');
  const h = await hook(page);
  // The shipped build has no asset index yet.
  expect(h.assets.problem).toMatch(/^no asset index/);
  const st = await statuses(page);
  for (const key of FINAL_KEYS) expect(st[key], key).toBe('placeholder');
  expect(Object.values(st).every((s) => s === 'placeholder')).toBe(true);
  await startHunt(page, isTouchProject(info));
  expect((await hook(page)).missingTextures).toEqual([]);
  expect((await hook(page)).assets.recorded).toEqual([]);
  await waitTicks(page, 240);
  await page.screenshot({ path: `${SCREENSHOTS}/assets-fallback-${info.project.name}.png` });
  // A 404 for the index is expected and not a game error.
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});

test('a broken delivered file falls back for its key only', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  // Every tile of the mid layer fails: the layer is all-or-nothing, the birds still swap.
  await serveStandins(page, /\/layers\/mid-1\./);
  await boot(page, 'seed=42');
  const st = await statuses(page);
  expect(st['karoo/mid']).toBe('placeholder');
  expect(st['bird/tarentaal/mid']).toBe('final');
  await startHunt(page, isTouchProject(info));
  expect((await hook(page)).missingTextures).toEqual([]);
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});
