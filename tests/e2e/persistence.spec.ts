// M5 "Done when": closing the tab mid-menu and reopening restores settings and progress; a
// corrupted save falls back safely; storage that throws (private mode) still lets the game run.
// Desktop Chromium + iPhone 14 (touch, WebKit in CI).
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { collectErrors, hook, isTouchProject, tapRect } from './helpers';

function onlyDesktopAndIphone(info: TestInfo): void {
  test.skip(
    !['desktop-chromium', 'iphone14-landscape', 'iphone14-landscape-chromium-fallback'].includes(
      info.project.name,
    ),
    'one desktop and one phone profile',
  );
}

async function ready(page: Page, query = ''): Promise<void> {
  await page.goto(`/?e2e=1&reenbui=0&brakkie=0&seed=7${query}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
}

/** START → FTUE hunt → Skip: the lesson counts as seen and the title opens up. */
async function skipFtue(page: Page, touch: boolean): Promise<void> {
  await tapRect(page, touch, 'start');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.mode === 'ftue',
  );
  await page.waitForFunction(() => window.__TM__?.rects['skip'] !== undefined);
  await tapRect(page, touch, 'skip');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
}

async function openMenu(page: Page, touch: boolean, button: string, menu: string): Promise<void> {
  await tapRect(page, touch, button);
  await page.waitForFunction((m) => window.__TM__?.menu === m, menu);
}

test('closing the tab mid-menu and reopening restores settings and progress', async ({
  page,
  context,
}, info) => {
  test.setTimeout(240_000);
  onlyDesktopAndIphone(info);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await ready(page);
  expect((await hook(page)).save.status).toBe('new');
  await skipFtue(page, touch);

  // Change settings through the UI: left-handed on, aim assist off, Afrikaans.
  await openMenu(page, touch, 'settings', 'settings');
  await tapRect(page, touch, 'settings.left_handed');
  await tapRect(page, touch, 'settings.aimAssist'); // standard → off
  await tapRect(page, touch, 'settings.language'); // auto → en
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await tapRect(page, touch, 'settings.language'); // en → af
  await page.waitForFunction(() => document.documentElement.lang === 'af');
  await page.screenshot({
    path: `tests/e2e/__screenshots__/persist-settings-${info.project.name}.png`,
  });

  // Close the tab while the Settings menu is still open.
  await page.close({ runBeforeUnload: true });
  const again = await context.newPage();
  const errors2 = collectErrors(again);
  await ready(again);
  const h = await hook(again);
  expect(h.save.status).toBe('loaded');
  expect(h.save.storage).toBe('local');
  // Progress: the FTUE stays done, so the title shows the Skiet-Skuur and Settings.
  expect(h.rects['shed']).toBeDefined();
  // Settings: language applied at boot, and the rest restored.
  expect(await again.evaluate(() => document.documentElement.lang)).toBe('af');
  await expect(again.locator('#rotate-card h1')).toHaveText('Draai jou toestel dwars');
  const saved = await again.evaluate(
    () =>
      JSON.parse(localStorage.getItem('tm.e2e.save.v1') ?? '{}') as Record<
        string,
        Record<string, unknown>
      >,
  );
  expect(saved['settings']).toMatchObject({ leftHanded: true, aimAssist: 'off', language: 'af' });
  expect(saved['ftue']).toMatchObject({ done: true, skipped: true });

  // The settings reach the game: left-handed HUD (belt bottom-left) and aim assist in the hunt.
  await tapRect(again, touch, 'start');
  await again.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.rects['belt'] !== undefined,
  );
  const hunt = await hook(again);
  expect(hunt.mode).toBe('classic');
  expect((hunt.rects['belt']?.x ?? 0) < hunt.designWidth / 2).toBe(true);
  const start = hunt.analytics.find(
    (a) => a.event === 'hunt_start' && a.data['mode'] === 'classic',
  );
  expect(start?.data['aimAssist']).toBe('off');
  await again.screenshot({
    path: `tests/e2e/__screenshots__/persist-lefthanded-${info.project.name}.png`,
  });
  expect([...errors, ...errors2]).toEqual([]);
});

test('a corrupted save falls back to defaults safely and keeps the bad text', async ({
  page,
}, info) => {
  onlyDesktopAndIphone(info);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('corrupted') === null) {
      sessionStorage.setItem('corrupted', '1');
      localStorage.setItem('tm.e2e.save.v1', '{"v":1,"settings":{"leftHa');
    }
  });
  await ready(page);
  expect((await hook(page)).save.status).toBe('corrupt');
  // Defaults: a new player gets the FTUE.
  await tapRect(page, touch, 'start');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.mode === 'ftue',
  );
  const stored = await page.evaluate(() => ({
    save: localStorage.getItem('tm.e2e.save.v1'),
    corrupt: localStorage.getItem('tm.e2e.save.corrupt'),
  }));
  expect(stored.corrupt).toBe('{"v":1,"settings":{"leftHa');
  expect(() => JSON.parse(stored.save ?? '') as unknown).not.toThrow();
  expect(errors).toEqual([]);
});

test('storage that throws (private mode) still lets the game run', async ({ page }, info) => {
  test.setTimeout(180_000);
  onlyDesktopAndIphone(info);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  await ready(page);
  expect((await hook(page)).save.storage).toBe('memory');
  // Progress holds for the session: skip the FTUE, then play Classic.
  await skipFtue(page, touch);
  await tapRect(page, touch, 'start');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.mode === 'classic',
  );
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30);
  expect(errors).toEqual([]);
});
