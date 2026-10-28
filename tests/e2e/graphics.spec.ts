// D-053: Standard or HD. The loading screen's card (first launch, both choices, Remember my
// choice on and off, the reload), "Play now in Standard" while HD is slow, Settings → Graphics,
// HD drawn at exactly Standard's on-screen size, and Standard never asking for an HD file.
// Test builds skip the card unless ?graphics=card (main.ts), so every other spec starts as before.
import { expect, test, type Page, type Request } from '@playwright/test';
import { STANDARD_IN_HD_LAYERS } from '../../src/game/assets/hdPack';
import { FAUNA_HERDS } from '../../src/game/view/faunaHerds';
import { boot, isLandscape, isTouchProject, startHunt, tapRect } from './helpers';

// Routes below must see every request (the service worker would fetch them itself).
test.use({ serviceWorkers: 'block' });

const SAVE = 'tm.e2e.save.v1';
const HD_FILE = /\/assets\/[^/]+-hd\//;

/** Counts requests for HD files from now on. */
function watchHd(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (HD_FILE.test(r.url())) seen.push(r);
  });
  return seen;
}

async function savedGraphics(page: Page): Promise<unknown> {
  return page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: { graphics?: unknown } })
        .settings?.graphics,
    SAVE,
  );
}

/** Opens the page as a real build would (the card when no preset is saved). */
async function open(page: Page, extra = ''): Promise<void> {
  await page.goto(`/?e2e=1&graphics=card&ftue=0&layout=none&feesdag=none${extra}`);
}

async function titleUp(page: Page): Promise<void> {
  await expect(page.locator('#game canvas')).toHaveCount(1, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 120_000 });
}

/** Landscape screens only, with time for a build that loads HD on software GL. */
function landscapeOnly(): void {
  test.skip(!isLandscape(test.info()), 'landscape screens');
  test.setTimeout(300_000);
}

test.describe('the loading screen card', () => {
  test('Standard, remembered: saved, no HD file, the reload skips the card', async ({ page }) => {
    landscapeOnly();
    const hd = watchHd(page);
    await open(page);
    const card = page.locator('#tm-graphics');
    await expect(card).toBeVisible({ timeout: 60_000 });
    // The real MB for this area, and Remember my choice ticked by default.
    await expect(page.locator('#tm-graphics-hd')).toContainText(/\d+(\.\d)? MB/);
    await expect(page.locator('#tm-graphics-remember')).toBeChecked();
    const pick = await page.evaluate(() => window.__TM__?.graphics.pick);
    expect(['standard', 'hd']).toContain(pick);
    await expect(page.locator(`#tm-graphics-${String(pick)}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('#tm-graphics-standard').click();
    await titleUp(page);
    expect(await savedGraphics(page)).toBe('standard');
    expect(await page.evaluate(() => window.__TM__?.graphics.mode)).toBe('standard');
    await page.reload();
    await titleUp(page);
    await expect(page.locator('#tm-graphics')).toHaveCount(0);
    // Standard: a hunt and back, and still not one HD file asked for.
    await startHunt(page, isTouchProject(test.info()));
    expect(hd.map((r) => r.url())).toEqual([]);
    expect(await page.evaluate(() => window.__TM__?.graphics.hdTextures)).toBe(0);
  });

  test('HD, not remembered: loads behind the loading screen; the next start asks again', async ({
    page,
  }) => {
    landscapeOnly();
    const hd = watchHd(page);
    await open(page);
    await expect(page.locator('#tm-graphics')).toBeVisible({ timeout: 60_000 });
    await page.locator('#tm-graphics-remember').uncheck();
    await page.locator('#tm-graphics-hd').click();
    await titleUp(page);
    // The home area's HD pack was in before the title (or "Play now" was offered: not pressed).
    expect(await page.evaluate(() => window.__TM__?.graphics.loading)).toBe('done');
    expect(await page.evaluate(() => window.__TM__?.graphics.mode)).toBe('hd');
    expect(hd.length).toBeGreaterThan(0);
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 60_000,
    });
    expect(await savedGraphics(page)).toBe('ask');
    await page.reload();
    await expect(page.locator('#tm-graphics')).toBeVisible({ timeout: 60_000 });
  });

  test('HD remembered: the reload skips the card and loads HD', async ({ page }) => {
    landscapeOnly();
    await open(page);
    await page.locator('#tm-graphics-hd').click();
    await titleUp(page);
    expect(await savedGraphics(page)).toBe('hd');
    await page.reload();
    await titleUp(page);
    await expect(page.locator('#tm-graphics')).toHaveCount(0);
    expect(await page.evaluate(() => window.__TM__?.graphics.mode)).toBe('hd');
  });
});

test('HD slow: "Play now in Standard" (loading screen and hunt veil), then HD swaps in mid-hunt', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(420_000);
  const touch = isTouchProject(info);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Throttle the HD files: each waits until the test lets them through.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(HD_FILE, async (route) => {
    await gate;
    await route.continue();
  });
  // Classic hunts in the Bushveld (a lazy area): its hunt puts up the in-game HD veil.
  await page.goto(
    '/?e2e=1&graphics=hd&ftue=0&layout=none&feesdag=none&biome=bushveld-winter&seed=3&huntSeconds=600',
  );
  const now = page.locator('#tm-hd-standard');
  await expect(page.locator('#tm-hd-loading')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#tm-hd-line')).toContainText(/MB/);
  await expect(now).toBeVisible({ timeout: 30_000 });
  await now.click();
  await titleUp(page);
  expect(await page.evaluate(() => window.__TM__?.graphics.loading)).toBe('skipped');
  // The Bushveld hunt waits for its HD pack behind the Phaser veil; its button lets the hunt go.
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(() => window.__TM__?.menu === 'hdLoading', null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'hd.standard');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__TM__?.biome)).toBe('bushveld-winter');
  // Mid-hunt: the HD files land now and go in during play (renamed, never removed; D-046).
  release();
  await page.waitForFunction(
    () => (window.__TM__?.graphics.hdTextures ?? 0) > 0 && (window.__TM__?.graphics.epoch ?? 0) > 0,
    null,
    { timeout: 180_000 },
  );
  const tick = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 120, tick, {
    timeout: 120_000,
  });
  expect(await page.evaluate(() => window.__TM__?.graphics.mode)).toBe('hd');
  expect(errors).toEqual([]);
});

test('Settings → Graphics shows the choice and switches back to Standard', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await boot(page, 'graphics=hd');
  await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await tapRect(page, touch, 'settings.page.1');
  await page.waitForFunction(() => window.__TM__?.rects['settings.graphics'] !== undefined);
  // Nothing saved yet ("Ask on start"); one tap: Standard.
  expect(await page.evaluate(() => window.__TM__?.graphics.setting)).toBe('ask');
  await tapRect(page, touch, 'settings.graphics');
  await page.waitForFunction(() => window.__TM__?.graphics.setting === 'standard');
  expect(await page.evaluate(() => window.__TM__?.graphics.mode)).toBe('standard');
  await tapRect(page, touch, 'settings.back');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  // The HD textures go once nothing draws them: the hunt keeps the title's views, so they are
  // swapped back in place (GraphicsControl.settle, every 30 frames) and freed.
  await startHunt(page, touch);
  await page.waitForFunction(() => window.__TM__?.graphics.hdTextures === 0, null, {
    timeout: 60_000,
  });
});

/** The Karoo title's far-animal herds (late group, D-054). */
const KAROO_HERDS = (FAUNA_HERDS['karoo-autumn'] ?? []).map((h) => h.key);

test('HD draws every sampled image at Standard’s on-screen size', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(300_000);
  const bounds = async (mode: string) => {
    // R10: the herds' idle motion (sim time) moves their drawn bounds between the two samples'
    // ticks: hold them at rest so Standard and HD compare exactly.
    await boot(page, `graphics=${mode}&faunaIdle=0`);
    if (mode === 'hd')
      await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
        timeout: 120_000,
      });
    await page.waitForFunction(() => (window.__TM__?.graphics.bounds.length ?? 0) > 0, null, {
      timeout: 60_000,
    });
    // D-054: the Karoo's herds come with the late group: sample only once it has settled and
    // every herd is drawn, in both modes (the HD run waited longer and caught more herds).
    await page.waitForFunction(
      () => window.__TM__?.assets.lateDone['karoo-autumn'] === true,
      null,
      {
        timeout: 120_000,
      },
    );
    await page.waitForFunction(
      (herds) => {
        const b = window.__TM__?.graphics.bounds ?? [];
        return herds.every((k) => b.some((x) => x.key === k));
      },
      KAROO_HERDS,
      { timeout: 60_000 },
    );
    // A couple of frames, so the sample is taken after the herds are drawn.
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              r();
            }),
          ),
        ),
    );
    return page.evaluate(() =>
      [...(window.__TM__?.graphics.bounds ?? [])].sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
  };
  const standard = await bounds('standard');
  const hd = await bounds('hd');
  expect(hd.map((b) => b.key)).toEqual(standard.map((b) => b.key));
  standard.forEach((s, i) => {
    const h = hd[i];
    // Layer spans may differ by the last tile's rounding (≤ 2 px); everything else is exact.
    const tol = s.key.startsWith('layer:') ? 2 : 1;
    expect(Math.abs((h?.x ?? 0) - s.x), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.y ?? 0) - s.y), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.w ?? 0) - s.w), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.h ?? 0) - s.h), s.key).toBeLessThanOrEqual(tol);
  });
});

test('a lazy area (Bushveld): HD layers and props at the same pan sit where Standard’s do', async ({
  page,
}, info) => {
  // The supervisor's phone crops showed different far/mid scenery behind the same key; this pins
  // the layer tiles (far ridge, far veld, mid, near …) and props at one camera x in both modes.
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(420_000);
  const sample = async (mode: string) => {
    // R10: herds at rest (their idle motion moved giraffe x 3 px and elephant w 15 px between the
    // Standard and HD samples' ticks on CI).
    await boot(
      page,
      `graphics=${mode}&biome=bushveld-winter&seed=3&huntSeconds=600&birds=0&faunaIdle=0`,
    );
    await startHunt(page, isTouchProject(info));
    if (mode === 'hd')
      await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
        timeout: 240_000,
      });
    // Read the camera and the boxes in the same callback that sees the Bushveld layers (in HD:
    // drawing HD files: the home Karoo's HD alone must not satisfy this test).
    const handle = await page.waitForFunction(
      (wantHd) => {
        const tm = window.__TM__;
        const b = tm?.graphics.bounds ?? [];
        const mid = b.find((x) => x.key === 'layer:bushveld/mid');
        if (mid === undefined || !b.some((x) => x.key === 'layer:bushveld/far_veld')) return null;
        if (mid.hd !== wantHd) return null;
        return {
          cameraX: tm?.cameraX ?? NaN,
          bounds: [...b].sort((p, q) => (p.key < q.key ? -1 : 1)),
        };
      },
      mode === 'hd',
      { timeout: 120_000 },
    );
    return (await handle.jsonValue()) as {
      cameraX: number;
      bounds: { key: string; x: number; y: number; w: number; h: number; hd: boolean }[];
    };
  };
  const standard = await sample('standard');
  const hd = await sample('hd');
  // No input yet: the hunt opens at the same seeded pan in both modes.
  expect(hd.cameraX).toBeCloseTo(standard.cameraX, 3);
  expect(hd.bounds.map((b) => b.key)).toEqual(standard.bounds.map((b) => b.key));
  expect(standard.bounds.some((b) => b.key === 'layer:bushveld/mid')).toBe(true);
  // The Bushveld layers with an HD version draw HD files in HD and none in Standard. The layers
  // D-054 keeps in Standard in HD (src/game/assets/hdPack.ts STANDARD_IN_HD_LAYERS: the sky, the
  // far ridge, the far veld and the Ver strip) draw Standard files in both.
  const layerId = (b: { key: string }): string => b.key.slice('layer:bushveld/'.length);
  const area = (b: { key: string }): boolean =>
    b.key.startsWith('layer:bushveld/') && !STANDARD_IN_HD_LAYERS.includes(layerId(b));
  expect(hd.bounds.filter(area).every((b) => b.hd)).toBe(true);
  expect(standard.bounds.filter(area).some((b) => b.hd)).toBe(false);
  // D-054 pinned: the far ridge and far veld draw Standard files in HD too.
  for (const id of ['far_ridge', 'far_veld']) {
    expect(STANDARD_IN_HD_LAYERS).toContain(id);
    const layer = hd.bounds.find((b) => b.key === `layer:bushveld/${id}`);
    expect(layer, `layer:bushveld/${id} sampled`).toBeDefined();
    expect(layer?.hd, `layer:bushveld/${id} in HD`).toBe(false);
  }
  standard.bounds.forEach((s, i) => {
    const h = hd.bounds[i];
    const tol = s.key.startsWith('layer:') ? 2 : 1;
    expect(Math.abs((h?.x ?? 0) - s.x), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.y ?? 0) - s.y), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.w ?? 0) - s.w), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.h ?? 0) - s.h), s.key).toBeLessThanOrEqual(tol);
  });
});

test('HD chosen but the HD index is gone (404): the lazy area’s hunt starts in Standard, no veil loop', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/asset-index-hd.json', (route) => route.fulfill({ status: 404, body: '' }));
  await boot(page, 'graphics=hd&biome=bushveld-winter&seed=3&huntSeconds=600&birds=0');
  await startHunt(page, isTouchProject(info));
  // The hunt runs (ticks advance) well within the budget: before the fix every restart put up a
  // new HD veil and "Play now in Standard" never came.
  const tick = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 60, tick, {
    timeout: 120_000,
  });
  const h = await page.evaluate(() => ({
    hdTextures: window.__TM__?.graphics.hdTextures ?? -1,
    menu: window.__TM__?.menu ?? null,
  }));
  expect(h.hdTextures).toBe(0);
  expect(h.menu).not.toBe('hdLoading');
  expect(errors).toEqual([]);
});

test('Standard chosen mid-hunt in the rain (Pause → Settings): the hunt keeps running', async ({
  page,
}, info) => {
  // The freeze: freeing an HD texture live rain drops still drew stopped the game loop.
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(420_000);
  const touch = isTouchProject(info);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, 'graphics=hd&biome=okavango-spring&omen=1&seed=3&huntSeconds=600');
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
    timeout: 240_000,
  });
  if (touch) await tapRect(page, touch, 'pause');
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__TM__?.menu === 'pause');
  await tapRect(page, touch, 'pause.settings');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await tapRect(page, touch, 'settings.page.1');
  await page.waitForFunction(() => window.__TM__?.rects['settings.graphics'] !== undefined);
  // "Ask on start" → Standard (one tap, as the Settings test shows).
  await tapRect(page, touch, 'settings.graphics');
  await page.waitForFunction(() => window.__TM__?.graphics.setting === 'standard');
  await tapRect(page, touch, 'settings.back');
  await page.waitForFunction(() => window.__TM__?.menu === 'pause');
  await tapRect(page, touch, 'pause.resume');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  // Well past several 30-frame settle passes: the game loop keeps going.
  const tick = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 300, tick, {
    timeout: 180_000,
  });
  expect(errors).toEqual([]);
});

/** A save with Namibië open (as namibie.spec: Die Verste reached), on a fixed day. */
const NAMIBIE_DAY = '2026-10-20';
async function seedNamibie(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        settings: { quality: 'medium' },
        ftue: { done: true, skipped: false, step: '' },
        bestRank: 'bosveldjagter',
        bonusMaps: {
          day: 20700,
          unlocked: [],
          bests: { 'karoo-autumn/dieVerste': { score: 900, rank: 'bosveldjagter' } },
        },
      }),
    );
  }, SAVE);
}

/** Karoo's on-screen sizes at the title (layers and props), once its views are up. */
async function karooSizes(page: Page): Promise<{ key: string; w: number; h: number }[]> {
  const handle = await page.waitForFunction(
    () => {
      const b = window.__TM__?.graphics.bounds ?? [];
      if (window.__TM__?.scene !== 'start' || !b.some((x) => x.key === 'layer:karoo/mid'))
        return null;
      return b
        .filter((x) => x.key.startsWith('layer:karoo/') || x.key.startsWith('karoo/'))
        .map((x) => ({ key: x.key, w: x.w, h: x.h }))
        .sort((p, q) => (p.key < q.key ? -1 : 1));
    },
    null,
    { timeout: 180_000 },
  );
  return (await handle.jsonValue()) as { key: string; w: number; h: number }[];
}

async function pickArea(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['area'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'area');
  await page.waitForFunction(() => window.__TM__?.menu === 'area', null, { timeout: 30_000 });
  await tapRect(page, touch, `area_${id}`);
  await page.waitForFunction((a) => window.__TM__?.classicArea === a, id, { timeout: 60_000 });
}

test('HD round trip: Karoo → a Namibië hunt → back to Karoo: all of Karoo’s scenery, at Standard’s size', async ({
  page,
}, info) => {
  // The stale-bookkeeping bug: back in an area its HD layer tiles were taken for installed (they
  // had been released) and drew the missing texture; props kept the HD half scale.
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedNamibie(page);
  await boot(page, `graphics=standard&today=${NAMIBIE_DAY}&seed=46`);
  const standard = await karooSizes(page);
  expect(standard.length).toBeGreaterThan(3);

  await boot(page, `graphics=hd&today=${NAMIBIE_DAY}&seed=46&huntSeconds=4`);
  await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
    timeout: 240_000,
  });
  await pickArea(page, touch, 'namibie');
  await startHunt(page, touch);
  await page.waitForFunction(() => window.__TM__?.biome === 'namibie', null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['menu'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'menu');
  await page.waitForFunction(() => window.__TM__?.scene === 'start', null, { timeout: 120_000 });
  await pickArea(page, touch, 'karoo-autumn');
  const hd = await karooSizes(page);
  expect(hd.map((b) => b.key)).toEqual(standard.map((b) => b.key));
  standard.forEach((s, i) => {
    const h = hd[i];
    const tol = s.key.startsWith('layer:') ? 2 : 1;
    expect(Math.abs((h?.w ?? 0) - s.w), `${s.key} w`).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.h ?? 0) - s.h), `${s.key} h`).toBeLessThanOrEqual(tol);
  });
  expect(errors).toEqual([]);
});
