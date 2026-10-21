// M10 marketing capture mode (?capture=1): no HUD or reticle in the hunt, the fixed capture seed,
// S slow-mo, F freeze, C auto-pan. Desktop keys, so desktop profiles only.
import { expect, test, type Page } from '@playwright/test';
import { SCREENSHOTS, boot, collectErrors, hook, isTouchProject, startHunt } from './helpers';

const tickAfter = async (page: Page, ms: number): Promise<number> => {
  await page.waitForTimeout(ms);
  return (await hook(page)).tick;
};

test('capture mode hides the HUD, fixes the seed, and slows, freezes and pans on keys', async ({
  page,
}, info) => {
  test.skip(
    isTouchProject(info) || info.project.metadata['orientation'] !== 'landscape',
    'keyboard: desktop',
  );
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await boot(page, 'capture=1');
  await startHunt(page, false);
  await page.waitForFunction(() => window.__TM__?.capture !== null, null, { timeout: 30_000 });
  let h = await hook(page);
  expect(h.huntSeed).toBe(42);
  expect(h.capture).toEqual({ speed: 1, frozen: false, panning: false, hud: false });

  await page.keyboard.press('KeyS');
  await page.waitForFunction(() => window.__TM__?.capture?.speed === 0.5);

  // Frozen: the sim holds still (rendering goes on).
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__TM__?.capture?.frozen === true);
  const t0 = (await hook(page)).tick;
  expect(await tickAfter(page, 1500)).toBe(t0);
  await page.keyboard.press('KeyF');
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t, t0, { timeout: 30_000 });

  // Auto-pan: the camera sweeps on its own.
  const x0 = (await hook(page)).cameraX;
  await page.keyboard.press('KeyC');
  await page.waitForFunction((x) => Math.abs((window.__TM__?.cameraX ?? x) - x) > 200, x0, {
    timeout: 60_000,
  });
  await page.keyboard.press('KeyC');
  h = await hook(page);
  expect(h.capture?.panning).toBe(false);
  await page.screenshot({ path: `${SCREENSHOTS}/capture-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('without ?capture=1 the HUD shows and capture keys do nothing', async ({ page }, info) => {
  test.skip(
    isTouchProject(info) || info.project.metadata['orientation'] !== 'landscape',
    'keyboard: desktop',
  );
  await boot(page, 'seed=7');
  await startHunt(page, false);
  await page.keyboard.press('KeyF');
  const h = await hook(page);
  expect(h.capture).toBeNull();
  expect(h.huntSeed).toBe(7);
  const t0 = h.tick;
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) > t + 30, t0, { timeout: 30_000 });
});
