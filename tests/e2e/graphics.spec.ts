// D-053: Standard or HD. The loading screen's card (first launch, both choices, Remember my
// choice on and off, the reload), "Play now in Standard" while HD is slow, Settings → Graphics,
// HD drawn at exactly Standard's on-screen size, and Standard never asking for an HD file.
// Test builds skip the card unless ?graphics=card (main.ts), so every other spec starts as before.
import { expect, test, type Page, type Request } from '@playwright/test';
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

test('HD slow: "Play now in Standard", then HD swaps in during play', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(300_000);
  // Throttle the HD files: each waits until the test lets them through.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(HD_FILE, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/?e2e=1&graphics=hd&ftue=0&layout=none&feesdag=none');
  const now = page.locator('#tm-hd-standard');
  await expect(page.locator('#tm-hd-loading')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#tm-hd-line')).toContainText(/MB/);
  await expect(now).toBeVisible({ timeout: 30_000 });
  await now.click();
  await titleUp(page);
  expect(await page.evaluate(() => window.__TM__?.graphics.loading)).toBe('skipped');
  // The game runs on the standard art; the HD files land now and go in during play (renamed,
  // never removed; D-046), and the hunt runs on.
  release();
  await page.waitForFunction(
    () => (window.__TM__?.graphics.hdTextures ?? 0) > 0 && (window.__TM__?.graphics.epoch ?? 0) > 0,
    null,
    { timeout: 120_000 },
  );
  await startHunt(page, isTouchProject(info));
  const tick = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 30, tick, {
    timeout: 60_000,
  });
  expect(await page.evaluate(() => window.__TM__?.graphics.mode)).toBe('hd');
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
  // The HD textures go at the next scene change (the hunt).
  await startHunt(page, touch);
  await page.waitForFunction(() => window.__TM__?.graphics.hdTextures === 0, null, {
    timeout: 60_000,
  });
});

test('HD draws every sampled image at Standard’s on-screen size', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape screens');
  test.setTimeout(300_000);
  const bounds = async (mode: string) => {
    await boot(page, `graphics=${mode}`);
    if (mode === 'hd')
      await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
        timeout: 120_000,
      });
    await page.waitForFunction(() => (window.__TM__?.graphics.bounds.length ?? 0) > 0, null, {
      timeout: 60_000,
    });
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
    await boot(page, `graphics=${mode}&biome=bushveld-winter&seed=3&huntSeconds=600&birds=0`);
    await startHunt(page, isTouchProject(info));
    if (mode === 'hd')
      await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
        timeout: 240_000,
      });
    // Read the camera and the boxes in the same callback that sees the Bushveld layers.
    const handle = await page.waitForFunction(
      () => {
        const tm = window.__TM__;
        const b = tm?.graphics.bounds ?? [];
        if (!b.some((x) => x.key === 'layer:bushveld/far_veld')) return null;
        return {
          cameraX: tm?.cameraX ?? NaN,
          bounds: [...b].sort((p, q) => (p.key < q.key ? -1 : 1)),
        };
      },
      null,
      { timeout: 120_000 },
    );
    return (await handle.jsonValue()) as {
      cameraX: number;
      bounds: { key: string; x: number; y: number; w: number; h: number }[];
    };
  };
  const standard = await sample('standard');
  const hd = await sample('hd');
  // No input yet: the hunt opens at the same seeded pan in both modes.
  expect(hd.cameraX).toBeCloseTo(standard.cameraX, 3);
  expect(hd.bounds.map((b) => b.key)).toEqual(standard.bounds.map((b) => b.key));
  expect(standard.bounds.some((b) => b.key === 'layer:bushveld/mid')).toBe(true);
  standard.bounds.forEach((s, i) => {
    const h = hd.bounds[i];
    const tol = s.key.startsWith('layer:') ? 2 : 1;
    expect(Math.abs((h?.x ?? 0) - s.x), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.y ?? 0) - s.y), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.w ?? 0) - s.w), s.key).toBeLessThanOrEqual(tol);
    expect(Math.abs((h?.h ?? 0) - s.h), s.key).toBeLessThanOrEqual(tol);
  });
});
