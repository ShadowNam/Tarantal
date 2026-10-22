// M10 asset swap path (docs/06-ASSET-DELIVERY.md). The stand-in delivery made by
// tools/make-standins.ts (one tarentaal atlas, the Karoo mid layer, two SFX) is served with
// page.route, as if it had been packed into public/assets/ — it is never in a build. With it the
// game loads those keys as final through the manifest; without it (the shipped state today) or with
// a file broken, the same keys fall back to their procedural placeholders, and no texture is missing.
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
import { serveStandins } from './standins';

// The PWA service worker would fetch delivered files itself once it controls the page, and
// page.route never sees those requests (CI saw the server's index.html instead of the art).
test.use({ serviceWorkers: 'block' });

/** The stand-in keys and how the hook names them (PR C added the Karoo music and ambience). */
const FINAL_KEYS = [
  'bird/tarentaal/near',
  'bird/tarentaal/mid',
  'bird/tarentaal/far',
  'karoo/mid',
  'sfx/shot',
  'sfx/poof',
  'music/karoo-autumn/calm',
  'music/karoo-autumn/build',
  'amb/karoo-autumn',
];

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
  // Recordings load beside the game (boot doesn't wait for them): wait until they report in.
  await page.waitForFunction(
    (keys) => {
      const entries = window.__TM__?.assets.byBiome['karoo-autumn'] ?? [];
      return keys.every((k) => entries.some((e) => e.key === k && e.status === 'final'));
    },
    FINAL_KEYS,
    { timeout: 60_000 },
  );
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

test('a corrupt bird atlas falls back to placeholder frames; the hunt plays on', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  // The mid-plane atlas data arrives as {} (no frames): every mid clip would have 0 frames.
  await serveStandins(page, null, { match: /tarentaal-mid@1x-0\..*\.json$/, edit: () => ({}) });
  await boot(page, 'seed=42');
  const st = await statuses(page);
  expect(st['bird/tarentaal/mid']).toBe('placeholder');
  expect(st['bird/tarentaal/far']).toBe('final');
  await startHunt(page, isTouchProject(info));
  await waitTicks(page, 240);
  expect((await hook(page)).missingTextures).toEqual([]);
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});

test('a clip naming a frame the atlas lacks is dropped; its fallback plays', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  const dropped: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('missing frames')) dropped.push(m.text());
  });
  // The mid atlas loses one peck frame: peck (6 frames listed, 5 present) must not play.
  await serveStandins(page, null, {
    match: /tarentaal-mid@1x-0\..*\.json$/,
    edit: (j) => {
      const d = j as { frames: Record<string, unknown> };
      delete d.frames['peck/05'];
      return d;
    },
  });
  await boot(page, 'seed=42');
  expect((await statuses(page))['bird/tarentaal/mid']).toBe('final');
  expect(dropped.join(' ')).toMatch(/mid: clips with missing frames dropped: peck/);
  await startHunt(page, isTouchProject(info));
  // Long enough for foraging birds to reach a peck spell (every third 1.5 s spell).
  await waitTicks(page, 400);
  expect((await hook(page)).missingTextures).toEqual([]);
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});
