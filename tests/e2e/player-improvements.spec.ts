import { expect, test } from '@playwright/test';
import { createRun } from '../../src/sim/run/run';
import { loadContent } from '../../tools/testContent';
import { boot, collectErrors, hook, isLandscape, isTouchProject, tapAt, tapRect } from './helpers';

test.beforeEach(({ browserName }, info) => {
  test.skip(!isLandscape(info), `landscape player flows (${browserName})`);
});

test('fresh players start in Standard without a graphics decision', async ({ page }) => {
  await page.goto('/?e2e=1&seed=7&ftue=1&layout=none');
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 120_000 });
  await expect(page.locator('#tm-graphics')).toHaveCount(0);
  expect((await hook(page)).graphics.mode).toBe('standard');
  // Test builds normally skip the card too; the persisted choice proves the new-player path ran.
  expect((await hook(page)).graphics.setting).toBe('standard');
});

test('help opens public practice and returns without changing progression', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&layout=none');
  const before = await page.evaluate(() => localStorage.getItem('tm.e2e.save.v1'));
  await tapRect(page, isTouchProject(info), 'help');
  await expect(page.getByRole('dialog')).toContainText('Your progress');
  await page.getByRole('button', { name: 'Open practice', exact: true }).click();
  await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
    timeout: 120_000,
  });
  await page.screenshot({ path: info.outputPath('public-practice.png') });
  await expect(page.locator('#tm-range [data-action=fresh-load]')).toHaveCount(0);
  const start = page.locator('#tm-range [data-action=start]');
  if (isTouchProject(info)) await start.tap();
  else await start.click();
  await page.waitForFunction(() => window.__TM__?.range?.view === 'range', null, {
    timeout: 120_000,
  });
  const h = await hook(page);
  await tapAt(page, isTouchProject(info), h.designWidth / 2, h.designHeight * 0.45);
  await page.waitForFunction(() => (window.__TM__?.shots ?? 0) > 0);
  await page.locator('#tm-range-bar [data-action=setup]').click();
  await page.waitForFunction(() => window.__TM__?.range?.view === 'setup');
  const after = await page.evaluate(() => localStorage.getItem('tm.e2e.save.v1'));
  expect(after).toBe(before);
  await page.locator('#tm-range [data-action=back]').click();
  await page.waitForFunction(() => window.__TM__?.scene === 'start');
  expect(errors).toEqual([]);
});

test('Harvest explains its content-driven bonus goal before starting', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await boot(page, 'seed=7&layout=none');
  await tapRect(page, isTouchProject(info), 'harvest');
  await expect(page.getByRole('dialog')).toContainText('crop bonus');
  await page.screenshot({ path: info.outputPath('harvest-goal.png') });
  await page.getByRole('button', { name: 'Start Harvest', exact: true }).click();
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('completed run recap shows recorded hunts and closes back to summary', async ({
  page,
}, info) => {
  const content = loadContent();
  const run = {
    ...createRun(content, { seed: 7, weapon: content.modes.modes.classic.weapon, pool: [] }),
    phase: 'victory',
    huntIndex: 11,
    history: [
      { huntIndex: 0, score: 1500, quota: 1000, passed: true, doppies: null },
      { huntIndex: 3, score: 2200, quota: 2000, passed: true, doppies: null },
    ],
  };
  await page.addInitScript((r) => {
    localStorage.setItem('tm.e2e.save.v1', JSON.stringify({ v: 1, run: r }));
  }, run);
  await boot(page, 'seed=7&layout=none');
  await tapRect(page, isTouchProject(info), 'seasonRun');
  await page.waitForFunction(() => window.__TM__?.run?.view === 'summary');
  await tapRect(page, isTouchProject(info), 'run.recap');
  expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollTop)).toBe(0);
  await expect(page.getByRole('dialog')).toContainText('1500');
  await expect(page.getByRole('dialog')).toContainText('individual charm');
  await page.screenshot({ path: info.outputPath('run-recap.png') });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await hook(page)).run?.view).toBe('summary');
});

test('performance and artwork explanations fit the accessibility page', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        stats: { hunts: 1, bagged: 0, shots: 0 },
        settings: { textSize: 'large', highContrast: true, graphics: 'standard' },
      }),
    );
  });
  await boot(page, 'seed=7&layout=none');
  const touch = isTouchProject(info);
  await page.screenshot({ path: info.outputPath('title-next-goal.png') });
  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.rects['settings.page.1'] !== undefined);
  await tapRect(page, touch, 'settings.page.1');
  await page.waitForFunction(
    () => window.__TM__?.rects['hint.settings.quality_hint'] !== undefined,
  );
  const h = await hook(page);
  const hint = h.rects['hint.settings.quality_hint'];
  const next = h.rects['settings.textSize'];
  expect(hint).toBeDefined();
  expect(next).toBeDefined();
  if (hint && next) expect(hint.y + hint.h).toBeLessThanOrEqual(next.y);
  await page.screenshot({ path: info.outputPath('artwork-performance-settings.png') });
});

for (const language of ['af', 'de', 'nl'] as const)
  test(`Large text explanations fit in ${language}`, async ({ page }, info) => {
    await page.addInitScript((language) => {
      localStorage.setItem(
        'tm.e2e.save.v1',
        JSON.stringify({
          v: 1,
          settings: { language, textSize: 'large', highContrast: true, graphics: 'standard' },
        }),
      );
    }, language);
    await boot(page, 'seed=7&layout=none');
    const touch = isTouchProject(info);
    await tapRect(page, touch, 'help');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    await page.screenshot({ path: info.outputPath(`help-${language}.png`) });
    await page.locator('#tm-player-help [data-action="back"]').click();
    await tapRect(page, touch, 'settings');
    await page.waitForFunction(() => window.__TM__?.rects['settings.page.1'] !== undefined);
    await tapRect(page, touch, 'settings.page.1');
    await page.waitForFunction(
      () => window.__TM__?.rects['hint.settings.quality_hint'] !== undefined,
    );
    const h = await hook(page);
    const hint = h.rects['hint.settings.quality_hint'];
    const next = h.rects['settings.textSize'];
    expect(hint).toBeDefined();
    expect(next).toBeDefined();
    if (hint && next) expect(hint.y + hint.h).toBeLessThanOrEqual(next.y);
    const art =
      h.rects['hint.settings.graphics_hint'] ?? h.rects['hint.settings.graphics_hint_weak'];
    const back = h.rects['settings.back'];
    expect(art).toBeDefined();
    expect(back).toBeDefined();
    if (art && back) expect(art.y + art.h).toBeLessThanOrEqual(back.y);
    await page.screenshot({ path: info.outputPath(`settings-${language}.png`) });
  });
