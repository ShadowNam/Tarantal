// M5: pause anywhere (Esc on desktop, the HUD pause button on touch), keyboard menus, and WebGL
// context loss: the hunt holds while the context is lost and continues after Phaser restores it.
import { expect, test, type Page } from '@playwright/test';
import {
  boot,
  collectErrors,
  hook,
  isTouchProject,
  SCREENSHOTS,
  startHunt,
  tapRect,
  waitTicks,
} from './helpers';

async function tickAfter(page: Page, ms: number): Promise<number> {
  await page.waitForTimeout(ms);
  return (await hook(page)).tick;
}

test('pause holds the hunt; resume continues; quit returns to the title', async ({
  page,
}, info) => {
  test.skip(
    !['desktop-chromium', 'pixel7-landscape'].includes(info.project.name),
    'desktop + Pixel 7',
  );
  test.setTimeout(240_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await boot(page, 'seed=3&huntSeconds=60');
  await startHunt(page, touch);
  await waitTicks(page, 30);
  if (touch) await tapRect(page, touch, 'pause');
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__TM__?.menu === 'pause' && window.__TM__.paused);
  const a = (await hook(page)).tick;
  expect(await tickAfter(page, 1500)).toBe(a);
  await page.screenshot({ path: `${SCREENSHOTS}/pause-${info.project.name}.png` });
  await tapRect(page, touch, 'pause.resume');
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 10, a, { timeout: 60_000 });
  expect((await hook(page)).menu).toBeNull();

  // Pause again and quit: back on the title, no tally for an abandoned hunt.
  if (touch) await tapRect(page, touch, 'pause');
  else await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.__TM__?.menu === 'pause');
  await tapRect(page, touch, 'pause.quit');
  await page.waitForFunction(() => window.__TM__?.scene === 'start');
  expect(errors).toEqual([]);
});

test('menus work from the keyboard alone', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'desktop');
  const errors = collectErrors(page);
  await boot(page, 'seed=3');
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
  // START has focus; ↓ walks the bottom row left to right until Settings (the row grows by
  // milestone, so the test doesn't count buttons).
  for (let i = 0; i < 10 && (await hook(page)).focus !== 'settings'; i++) {
    await page.keyboard.press('ArrowDown');
  }
  expect((await hook(page)).focus).toBe('settings');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await page.screenshot({ path: `${SCREENSHOTS}/settings-keyboard-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => window.__TM__?.menu === null && window.__TM__.rects['start'] !== undefined,
  );
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt');
  expect((await hook(page)).inputKind).toBe('pointer');
  expect(errors).toEqual([]);
});

test('WebGL context loss: the hunt holds, then resumes after the context is restored', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'desktop Chromium');
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await boot(page, 'seed=3&huntSeconds=60');
  await startHunt(page, false);
  await waitTicks(page, 60);
  const lost = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    (window as unknown as { __loseCtx: WEBGL_lose_context }).__loseCtx = ext;
    ext.loseContext();
    return true;
  });
  expect(lost).toBe(true);
  await page.waitForFunction(() => window.__TM__?.paused === true);
  const held = (await hook(page)).tick;
  expect(await tickAfter(page, 1000)).toBe(held);
  await page.evaluate(() => {
    (window as unknown as { __loseCtx: WEBGL_lose_context }).__loseCtx.restoreContext();
  });
  await page.waitForFunction(() => window.__TM__?.contextRestores === 1, null, { timeout: 30_000 });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 30, held, { timeout: 60_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/context-restored-${info.project.name}.png` });
  expect(pageErrors).toEqual([]);
});
