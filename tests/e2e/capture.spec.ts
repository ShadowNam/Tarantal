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
  const h = await hook(page);
  expect(h.huntSeed).toBe(42);
  expect(h.capture).toMatchObject({ speed: 1, frozen: false, panning: false, hud: false });

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
  // The hook updates on the next frame.
  await page.waitForFunction(() => window.__TM__?.capture?.panning === false);
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

test('a fresh capture session skips the tutorial and plays the Classic seed', async ({
  page,
}, info) => {
  test.skip(
    isTouchProject(info) || info.project.metadata['orientation'] !== 'landscape',
    'keyboard: desktop',
  );
  // `ftue=1` keeps the boot helper from marking the tutorial done: this is the live web path.
  await boot(page, 'capture=1&ftue=1');
  await startHunt(page, false);
  await page.waitForFunction(() => window.__TM__?.capture !== null, null, { timeout: 30_000 });
  const h = await hook(page);
  expect(h.mode).toBe('classic');
  expect(h.huntSeed).toBe(42);
});

test('capture mode is unranked: no Daily entry on the title, no share on the tally', async ({
  page,
}, info) => {
  test.skip(
    isTouchProject(info) || info.project.metadata['orientation'] !== 'landscape',
    'keyboard: desktop',
  );
  await boot(page, 'capture=1&ftue=1&huntSeconds=2');
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined);
  expect((await hook(page)).rects['daily']).toBeUndefined();
  await startHunt(page, false);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__TM__?.rects['again'] !== undefined);
  const rects = (await hook(page)).rects;
  expect(rects['share']).toBeUndefined();
});

// v1.0.1 (D-028 §5): entering capture mode shows "S slow · F freeze · C pan" for ~3 s, then it
// fades out on real time (a freeze doesn't hold it) and is removed before any capture.
test('capture mode shows its key hint, then fades it out even while frozen', async ({
  page,
}, info) => {
  test.skip(
    isTouchProject(info) || info.project.metadata['orientation'] !== 'landscape',
    'keyboard: desktop',
  );
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await boot(page, 'capture=1');
  await startHunt(page, false);
  await page.waitForFunction(() => window.__TM__?.capture?.hint === true, null, {
    timeout: 30_000,
  });
  await page.screenshot({ path: `${SCREENSHOTS}/capture-hint-${info.project.name}.png` });
  // Freeze straight away: the hint must still go.
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__TM__?.capture?.frozen === true);
  await page.waitForFunction(() => window.__TM__?.capture?.hint === false, null, {
    timeout: 30_000,
  });
  await page.screenshot({ path: `${SCREENSHOTS}/capture-hint-gone-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
