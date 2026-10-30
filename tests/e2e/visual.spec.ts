// M10 visual regression (Build plan M10 "visual regression screenshots approved"): the title, a
// hunt held at a fixed tick (seed 42, ?holdAt), the tally, the Padstal, both Settings pages and
// the privacy screen, compared with committed baselines (tests/e2e/visual-baselines/) on
// desktop-chromium and pixel7-landscape. Fonts are loaded before anything is drawn. After an
// intentional change, CI re-records them: label the PR `update-baselines` (D-030), then review.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadDailyMeta } from '../../tools/testContent';
import { boot, hook, isTouchProject, tapRect } from './helpers';

// The title shows Daily #1: today = the epoch, read from content (its only copy, D-028).
const EPOCH = loadDailyMeta().epoch;

const PROFILES = ['desktop-chromium', 'pixel7-landscape'];

function baselineProfile(info: TestInfo): void {
  test.skip(
    !PROFILES.includes(info.project.name),
    'baselines: desktop-chromium and pixel7-landscape',
  );
}
// The PWA worker plays no part in what is drawn; keep every run on the network path.
test.use({ serviceWorkers: 'block' });

// The quality tier ("auto" follows core count and a benchmark) changes the render scale, so it
// would differ between machines: baselines are taken at a fixed medium tier.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(key, JSON.stringify({ v: 1, settings: { quality: 'medium' } }));
  });
});

/** Lets the frame settle (fonts loaded, a few frames drawn) before a screenshot. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(800);
}

/** D-054: the Karoo's far-animal herds come with the late group: wait until all are drawn, so
 *  a baseline never catches the scene with or without them by chance. */
async function herdsDrawn(page: Page): Promise<void> {
  await page.waitForFunction(
    () => new Set((window.__TM__?.fauna ?? []).map((p) => p.herd)).size >= 3,
    null,
    { timeout: 60_000 },
  );
}

// v1.6 (D-042): ?stamp=0 masks the build stamp (it changes with every build).
const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(`${name}.png`, { timeout: 30_000 });

test('title and both Settings pages and privacy', async ({ page }, info) => {
  baselineProfile(info);
  // Four screens with a settle and a screenshot each: 1.1–1.5 min under software GL, so the
  // default 90 s timed out on loaded runners (CI pixel7 2/2 and locally).
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  await boot(page, `today=${EPOCH}&seed=42&stamp=0`);
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
  await herdsDrawn(page);
  await settled(page);
  await shot(page, 'title');

  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await settled(page);
  await shot(page, 'settings-sound');

  await tapRect(page, touch, 'settings.page.1');
  await page.waitForFunction(() => window.__TM__?.rects['settings.contrast'] !== undefined);
  await settled(page);
  await shot(page, 'settings-access');

  await tapRect(page, touch, 'settings.page.0');
  await page.waitForFunction(() => window.__TM__?.rects['settings.privacy'] !== undefined);
  await tapRect(page, touch, 'settings.privacy');
  await page.waitForFunction(() => window.__TM__?.menu === 'privacy');
  await settled(page);
  await shot(page, 'privacy');
});

test('hunt held at a fixed tick', async ({ page }, info) => {
  baselineProfile(info);
  await boot(page, `today=${EPOCH}&seed=42&holdAt=300&stamp=0`);
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, isTouchProject(info), 'start');
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 300, null, { timeout: 120_000 });
  await herdsDrawn(page);
  // v1.8b (D-062): the Karoo's baboon troop on the far ridge, from the late group's sheet: wait
  // until it is drawn so the screen never shows it on one run and not the next.
  await page.waitForFunction(
    () =>
      (
        (window as unknown as { __TM__?: { baboons?: readonly unknown[] | null } }).__TM__
          ?.baboons ?? []
      ).length > 0,
    null,
    { timeout: 120_000 },
  );
  // Move the pointer off the scene so no reticle or hover shows.
  await page.mouse.move(0, 0);
  await settled(page);
  expect((await hook(page)).tick).toBe(300);
  await shot(page, 'hunt');
});

test('tally after a short hunt', async ({ page }, info) => {
  baselineProfile(info);
  await boot(page, `today=${EPOCH}&seed=42&huntSeconds=2&stamp=0`);
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, isTouchProject(info), 'start');
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__TM__?.rects['again'] !== undefined);
  // Past the count-up, stamp and news line.
  await page.waitForTimeout(2500);
  await settled(page);
  await shot(page, 'tally');
});

test('Padstal', async ({ page }, info) => {
  baselineProfile(info);
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  await boot(page, `today=${EPOCH}&seed=4&huntSeconds=1&quotaMul=0&doppies=1&stamp=0`);
  await page.waitForFunction(() => window.__TM__?.rects['seasonRun'] !== undefined);
  await tapRect(page, touch, 'seasonRun');
  await page.waitForFunction(() => window.__TM__?.run?.view === 'intro', null, { timeout: 60_000 });
  await tapRect(page, touch, 'run.go');
  await page.waitForFunction(
    () => window.__TM__?.run?.view === 'tally' && window.__TM__.rects['run.padstal'] !== undefined,
    null,
    { timeout: 90_000 },
  );
  await tapRect(page, touch, 'run.padstal');
  await page.waitForFunction(() => window.__TM__?.run?.view === 'padstal', null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'run.helpClose');
  await page.waitForFunction(() => window.__TM__?.rects['run.next'] !== undefined);
  await settled(page);
  await shot(page, 'padstal');
});
