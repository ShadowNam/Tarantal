// M9 accessibility checklist (GDD §18.3), the parts that need the real game: the new Settings
// page by keyboard alone (tabs, toggles, text size), sound captions in a hunt, and hold to fire.
// The rest is unit-tested (see D-026 for the toggle → test table).
import { expect, test, type Page } from '@playwright/test';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  SCREENSHOTS,
  startHunt,
  tapAt,
  waitTicks,
} from './helpers';

const SAVE = 'tm.e2e.save.v1';

async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, s]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, JSON.stringify({ v: 1, settings: s }));
    },
    [SAVE, settings] as const,
  );
}

async function savedSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: Record<string, unknown> })
        .settings ?? {},
    SAVE,
  );
}

/**
 * Presses `key` until the menu focus is `id` (menus grow by milestone; no button counting). The
 * presses are dispatched inside the page: a round trip per key costs seconds on software GL.
 */
async function focusOn(page: Page, id: string, key = 'Tab'): Promise<void> {
  const ok = await page.evaluate(
    ([target, code]) => {
      for (let i = 0; i < 40; i++) {
        if (window.__TM__?.focus === target) return true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: code, code, bubbles: true }));
      }
      return window.__TM__?.focus === target;
    },
    [id, key] as const,
  );
  expect(ok, `focus reaches ${id}`).toBe(true);
}

test('keyboard only: Settings → Display & access, captions, contrast, large text', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'keyboard: desktop');
  const errors = collectErrors(page);
  await boot(page, '');
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
  await focusOn(page, 'settings', 'ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await focusOn(page, 'settings.page.0');
  // → on a tab turns the page.
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__TM__?.focus === 'settings.page.1');
  await focusOn(page, 'settings.captions');
  await page.keyboard.press('Enter');
  await focusOn(page, 'settings.colour_blind');
  await page.keyboard.press('Enter');
  await focusOn(page, 'settings.contrast');
  await page.keyboard.press('Enter');
  // Contrast restyles the screen and keeps the row focused.
  await page.waitForFunction(() => window.__TM__?.focus === 'settings.contrast');
  await focusOn(page, 'settings.textSize');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__TM__?.focus === 'settings.textSize');
  expect(await savedSettings(page)).toMatchObject({
    captions: true,
    colourBlind: true,
    highContrast: true,
    textSize: 'large',
  });
  await page.screenshot({ path: `${SCREENSHOTS}/a11y-settings-access-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  await page.screenshot({ path: `${SCREENSHOTS}/a11y-title-large-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('sound captions: a reload is captioned in the hunt', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'hunts are played in landscape');
  await seedSettings(page, { captions: true });
  await boot(page, 'seed=3&huntSeconds=20');
  const touch = info.project.use.hasTouch === true;
  await startHunt(page, touch);
  await waitTicks(page, 30);
  // One shot, so there is something to reload.
  const h = await hook(page);
  await tapAt(page, touch, h.designWidth / 2, h.designHeight * 0.3);
  await page.waitForFunction((s) => (window.__TM__?.shots ?? 0) > s, h.shots);
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => window.__TM__?.captions.includes('caption.reloaded') === true,
    null,
    { timeout: 60_000 },
  );
  await page.screenshot({ path: `${SCREENSHOTS}/a11y-captions-${info.project.name}.png` });
});

test('hold to fire: one held press keeps firing while the gun is ready', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'mouse hold: desktop');
  await seedSettings(page, { holdToFire: true });
  await boot(page, 'seed=3&huntSeconds=20');
  await startHunt(page, false);
  const h = await hook(page);
  const r = await page.locator('#game canvas').boundingBox();
  if (!r) throw new Error('no canvas');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * 0.4);
  await page.mouse.down();
  await page.waitForFunction((s) => (window.__TM__?.shots ?? 0) >= s + 2, h.shots, {
    timeout: 60_000,
  });
  await page.mouse.up();
  expect((await hook(page)).shots).toBeGreaterThanOrEqual(h.shots + 2);
});
