// M10 asset swap path (docs/06-ASSET-DELIVERY.md). The stand-in delivery made by
// tools/make-standins.ts (one tarentaal atlas, the Karoo mid layer, two SFX) is served with
// page.route, as if it had been packed into public/assets/ — it is never in a build. With it the
// game loads those keys as final through the manifest; without it (the shipped state today) or with
// a file broken, the same keys fall back to their procedural placeholders, and no texture is missing.
// D-029: the build itself ships interim (code-drawn) art for the guns and the tarentaal family.
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
  // D-029: the build ships interim art, so "nothing delivered" is an index that isn't there.
  await page.route('**/assets/asset-index.json', (r) => r.fulfill({ status: 404, body: '' }));
  await boot(page, 'seed=42');
  const h = await hook(page);
  expect(h.assets.problem).toMatch(/^no asset index/);
  const st = await statuses(page);
  for (const key of FINAL_KEYS) expect(st[key], key).toBe('placeholder');
  expect(Object.values(st).every((s) => s === 'placeholder')).toBe(true);
  // v1.8b (D-062): the Karoo has a baboon troop; with no delivery the hunt still starts at once
  // (it never waits for a sheet the index doesn't have; the troop's placeholder draws nothing).
  await startHunt(page, isTouchProject(info));
  expect((await hook(page)).biome).toBe('karoo-autumn');
  expect((await hook(page)).baboonRaid).toBeNull();
  expect((await hook(page)).missingTextures).toEqual([]);
  expect((await hook(page)).assets.recorded).toEqual([]);
  await waitTicks(page, 240);
  await page.screenshot({ path: `${SCREENSHOTS}/assets-fallback-${info.project.name}.png` });
  // A 404 for the index is expected and not a game error.
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});

test('the shipped interim art loads as interim (D-029)', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  const errors = collectErrors(page);
  await boot(page, 'seed=42');
  expect((await hook(page)).assets.problem).toBeNull();
  // Guns other than the Dubbelloop are in the late group: they arrive after boot.
  await page.waitForFunction(
    () => {
      const entries = window.__TM__?.assets.byBiome['karoo-autumn'] ?? [];
      return entries.filter((e) => e.key.startsWith('gun/') && e.status === 'interim').length >= 6;
    },
    null,
    { timeout: 60_000 },
  );
  const st = await statuses(page);
  const interim = Object.entries(st).filter(([, s]) => s === 'interim');
  for (const id of ['dubbelloop', 'windbuks', 'kettie', 'pomp', 'voorlaaier', 'mielie_masjien'])
    expect(st[`gun/${id}`], id).toBe('interim');
  expect(Object.values(st).includes('final')).toBe(false);
  expect(interim.length).toBeGreaterThanOrEqual(6);
  await startHunt(page, isTouchProject(info));
  expect((await hook(page)).missingTextures).toEqual([]);
  expect(errors).toEqual([]);
});

// v1.6 (D-042): a delivered file that keeps failing no longer falls back silently: the game says
// so (naming the file in the console) and offers Retry; it never starts on placeholders.
test('a delivered file that keeps failing stops the start with a Retry message', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(180_000);
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  // Every tile request of the mid layer fails (all retries too).
  let broken = true;
  await serveStandins(page, null);
  await page.route(/\/layers\/mid-1\./, (r) =>
    broken ? r.fulfill({ status: 404, body: '' }) : r.fallback(),
  );
  await page.goto('/?e2e=1&reenbui=0&brakkie=0&seed=42&layout=none&ftue=0');
  await expect(page.locator('#tm-art-error')).toBeVisible({ timeout: 90_000 });
  expect(warnings.some((w) => /layers\/mid-1\..*HTTP 404|mid-1\..*failed/.test(w))).toBe(true);
  expect(await page.evaluate(() => window.__TM__?.ready === true)).toBe(false);
  // The connection is back: Retry boots the game with the art in.
  broken = false;
  await page.locator('#tm-art-error button').click();
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 90_000 });
  expect((await statuses(page))['karoo/mid']).toBe('final');
});

test('a corrupt bird atlas stops the start with a Retry message', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(180_000);
  // The mid-plane atlas data arrives as {} (no frames): it can't be used, so it counts as missing.
  await serveStandins(page, null, { match: /tarentaal-mid@1x-0\..*\.json$/, edit: () => ({}) });
  await page.goto('/?e2e=1&reenbui=0&brakkie=0&seed=42&layout=none&ftue=0');
  await expect(page.locator('#tm-art-error')).toBeVisible({ timeout: 90_000 });
});

// v1.6 (D-042): a biome pack that fails once (a deploy, a dropped connection) is fetched again;
// the hunt then starts with every delivered key in: none on its placeholder.
test('a pack that fails once is retried; the hunt never starts on placeholders', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(240_000);
  let failures = 0;
  await page.route(/kalahari-summer\/layers\/mid-0\./, (r) => {
    if (failures === 0) {
      failures++;
      return r.fulfill({ status: 404, body: '' });
    }
    return r.fallback();
  });
  await boot(page, 'seed=42&biome=kalahari-summer&huntSeconds=4');
  // The Kalahari pack is lazy: it is fetched when the hunt starts, not at boot.
  await startHunt(page, isTouchProject(info));
  expect(failures).toBe(1);
  const h = await hook(page);
  const entries = h.assets.byBiome['kalahari-summer'] ?? [];
  const layers = entries.filter((e) => e.kind === 'layer');
  expect(layers.length).toBeGreaterThan(4);
  for (const e of layers) expect(e.status, e.key).not.toBe('placeholder');
  expect(h.assets.failed.filter((f) => f.path.includes('kalahari'))).toEqual([]);
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
