// M8 arsenal on every landscape profile: the Kettie (no belt, a draw meter, a stone that lands
// later) and the Plaas-Pomp (6-shell belt, a shot cuts its per-shell reload). The weapon is
// equipped through the save, as the Skiet-Skuur would; the sim behaviour itself is proven
// headless (src/sim/arsenal.test.ts).
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  reload,
  startHunt,
  tapAt,
  waitTicks,
} from './helpers';

/** A returning player with this gun unlocked and equipped (save sections load one by one). */
async function equip(page: Page, weapon: string): Promise<void> {
  await page.addInitScript((w) => {
    if (localStorage.getItem('tm.e2e.save.v1') !== null) return;
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: w },
        unlocks: { weapons: [w] },
        bestRank: 'plaaswerker',
      }),
    );
  }, weapon);
}

test('Kettie: no belt, a stone flies and lands after the shot', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await equip(page, 'kettie');
  await boot(page, 'huntSeconds=20');
  await startHunt(page, touch);
  let h = await hook(page);
  expect(h.weapon).toBe('kettie');
  expect(h.magazine).toBe(-1);
  // Aim into the sky: a miss that has to fly all the way to the far band.
  await tapAt(page, touch, h.designWidth / 2, 120);
  await page.waitForFunction(() => (window.__TM__?.shots ?? 0) >= 1);
  h = await hook(page);
  await page.screenshot({ path: `${SCREENSHOTS}/arsenal-kettie-${info.project.name}.png` });
  const firedAt = h.tick;
  await waitTicks(page, 40, firedAt);
  h = await hook(page);
  expect(h.stones).toBe(0);
  expect(h.shells).toBe(-1);
  expect(errors).toEqual([]);
});

test('Plaas-Pomp: six shells, a shot cuts the reload', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await equip(page, 'pomp');
  await boot(page, 'huntSeconds=20');
  await startHunt(page, touch);
  let h = await hook(page);
  expect(h.weapon).toBe('pomp');
  expect(h.magazine).toBe(6);
  for (let i = 0; i < 2; i++) {
    const before = (await hook(page)).shots;
    await tapAt(page, touch, h.designWidth / 2, 120);
    await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, before);
    await waitTicks(page, 20);
  }
  expect((await hook(page)).shells).toBe(4);
  await reload(page, touch);
  await page.waitForFunction(() => window.__TM__?.reloading === true);
  await page.waitForFunction(() => (window.__TM__?.shells ?? 0) >= 5, null, { timeout: 30_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/arsenal-pomp-${info.project.name}.png` });
  const before = (await hook(page)).shots;
  await tapAt(page, touch, h.designWidth / 2, 120);
  await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, before);
  h = await hook(page);
  expect(h.reloading).toBe(false);
  expect(errors).toEqual([]);
});
