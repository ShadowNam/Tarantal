// M5 "Done when": PWA installability. The manifest (name, icons, display, start_url) is served,
// the service worker registers, and the game loads offline after one visit. Chromium profiles
// only (desktop + Pixel 7): service-worker offline emulation is a Chromium feature in Playwright.
// The DevTools → Application → Manifest spot-check on the deployed preview stays manual.
import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

test.describe('PWA', () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(
      browserName !== 'chromium' ||
        !['desktop-chromium', 'pixel7-landscape'].includes(info.project.name),
      'Chromium desktop + Pixel 7',
    );
  });

  test('manifest is served with name, icons, display and start_url', async ({ page, request }) => {
    await page.goto('/?e2e=1&reenbui=0');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('manifest.webmanifest');
    const res = await request.get(`/${href ?? ''}`);
    expect(res.ok()).toBe(true);
    const m = (await res.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(m.name).toBe('Tarantal Madness');
    expect(m.short_name.length).toBeGreaterThan(0);
    expect(['fullscreen', 'standalone']).toContain(m.display);
    expect(m.start_url).toBe('./');
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of m.icons) {
      const r = await request.get(`/${icon.src}`);
      expect(r.ok(), icon.src).toBe(true);
      expect(r.headers()['content-type']).toContain('image/png');
    }
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });

  test('service worker registers and the game loads offline after one visit', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('/?e2e=1&reenbui=0&ftue=0');
    await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 60_000 });
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toMatch(/\/$/);
    // clients.claim() makes this page controlled once the worker activates.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 30_000,
    });
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const c = await caches.open(keys.find((k) => k.startsWith('tm-')) ?? '');
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toEqual(expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest']));
    expect(cached.some((p) => p.startsWith('/assets/') && p.endsWith('.js'))).toBe(true);

    await context.setOffline(true);
    try {
      // A different query string still loads (navigations fall back to the cached index.html).
      await page.goto('/?e2e=1&reenbui=0&ftue=0&seed=5');
      await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 60_000 });
      await expect(page.locator('#game canvas')).toHaveCount(1);
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
      expect(await page.evaluate(() => window.__TM__?.missingTextures ?? [])).toEqual([]);
    } finally {
      await context.setOffline(false);
    }
    expect(errors).toEqual([]);
  });
});
