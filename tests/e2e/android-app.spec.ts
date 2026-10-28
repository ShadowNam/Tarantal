// D-058, the Android test app's web build (dist-android/, VITE_PLATFORM=capacitor with
// VITE_TEST_HOOKS=1: CI's `E2E_PLATFORM=capacitor` job on Pixel 7 landscape). In a browser the
// Capacitor plugins run their web versions, so the spec dispatches the App plugin's `backButton`
// event in-page, as the Android shell does: in a hunt it opens the pause menu, again resumes; in
// a menu it is Back; the hunt still ends normally. The APK itself is built by android.yml.
import { expect, test, type Page } from '@playwright/test';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  SCREENSHOTS,
  startHunt,
  tapRect,
} from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';

/** The Android back button: the App plugin's event, as Capacitor's shell fires it. */
async function pressBack(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const cap = (
      window as Window & {
        Capacitor?: {
          Plugins: Record<string, { notifyListeners(e: string, d: unknown): Promise<void> }>;
        };
      }
    ).Capacitor;
    if (cap === undefined) throw new Error('Capacitor is not loaded');
    const app = cap.Plugins['App'];
    if (app === undefined) throw new Error('the App plugin is not registered');
    await app.notifyListeners('backButton', { canGoBack: false });
  });
}

/** Capacitor's plugins are loaded by the adapter's init (a lazy chunk), before `ready`. */
async function capacitorReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as Window & { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
        ?.Plugins?.['App'] !== undefined,
    null,
    { timeout: 60_000 },
  );
}

test.describe('Android test app build (D-058)', () => {
  test.skip(PLATFORM !== 'capacitor', 'set E2E_PLATFORM=capacitor (the dist-android build)');

  test('the app build: capacitor adapter, no service worker, no PWA extras', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, 'graphics=standard');
    await capacitorReady(page);
    const h = await hook(page);
    expect(h.platform).toBe('capacitor');
    expect(h.admin).toBeNull();
    // Files are local in the app: no worker, no manifest, no install banner, no fullscreen button.
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations())).toHaveLength(0);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    await expect(page.locator('#fullscreen-btn')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('back pauses a hunt, back again resumes it, and the hunt ends normally', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'hunts are played in landscape');
    test.setTimeout(10 * 60_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await boot(page, 'graphics=standard&seed=42&huntSeconds=6');
    await capacitorReady(page);
    await startHunt(page, touch);
    await pressBack(page);
    await page.waitForFunction(() => window.__TM__?.menu === 'pause', null, { timeout: 60_000 });
    expect((await hook(page)).scene).toBe('hunt');
    await page.screenshot({ path: `${SCREENSHOTS}/android-back-pause-${info.project.name}.png` });
    // In the pause menu, back is Resume (never out of the hunt).
    await pressBack(page);
    await page.waitForFunction(
      () => window.__TM__?.scene === 'hunt' && window.__TM__.menu === null,
      null,
      { timeout: 60_000 },
    );
    expect((await hook(page)).scene).toBe('hunt');
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, {
      timeout: 5 * 60_000,
    });
    expect(errors).toEqual([]);
  });

  test('back is Back in menus; on the title it leaves the game alone', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'menus are checked in landscape');
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await boot(page, 'graphics=standard');
    await capacitorReady(page);
    await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined, null, {
      timeout: 60_000,
    });
    await tapRect(page, touch, 'settings');
    await page.waitForFunction(() => window.__TM__?.menu === 'settings', null, {
      timeout: 60_000,
    });
    await pressBack(page);
    await page.waitForFunction(
      () => window.__TM__?.scene === 'start' && window.__TM__.menu !== 'settings',
      null,
      { timeout: 60_000 },
    );
    // On the title the app would go to the background (minimizeApp, a no-op in a browser).
    await pressBack(page);
    await page.waitForTimeout(500);
    expect((await hook(page)).scene).toBe('start');
    expect(errors).toEqual([]);
  });
});
