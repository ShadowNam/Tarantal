import { expect, test } from '@playwright/test';
import { boot, isTouchProject, startHunt, tapRect } from './helpers';
import en from '../../src/i18n/en.json' with { type: 'json' };

test('startup defaults to English and remembers the selected language', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['de-DE'] });
  });
  await boot(page, 'seed=42&graphics=standard');
  const picker = page.locator('#startup-language-select');
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.screenshot({
    path: `tests/e2e/__screenshots__/startup-english-${info.project.name}.png`,
  });
  for (const language of ['af', 'de']) {
    await picker.selectOption(language);
    await page.waitForFunction(
      (lang) => document.documentElement.lang === lang && window.__TM__?.ready === true,
      language,
    );
    await expect(picker).toHaveValue(language);
  }
  await page.reload();
  await page.waitForFunction(() => window.__TM__?.ready === true);
  await expect(picker).toHaveValue('de');
  await startHunt(page, isTouchProject(info));
  await expect(picker).toBeHidden();
});

test('startup language works when browser storage rejects writes', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await boot(page, 'seed=42&graphics=standard');
  await page.locator('#startup-language-select').selectOption('af');
  await expect(page.locator('html')).toHaveAttribute('lang', 'af');
  await expect(page.locator('#startup-language-select')).toHaveValue('af');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  await startHunt(page, isTouchProject(info));
  await expect(page.locator('html')).toHaveAttribute('lang', 'af');
});

test('language selector remains usable on the graphics loading screen', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.goto('/?e2e=1&graphics=card&ftue=0');
  await expect(page.locator('#tm-graphics')).toBeVisible({ timeout: 60_000 });
  const picker = page.locator('#startup-language-select');
  await picker.selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#tm-graphics-q')).toHaveText('Wie soll das Spiel aussehen?');
  await page.screenshot({
    path: `tests/e2e/__screenshots__/startup-loading-de-${info.project.name}.png`,
  });
  await page.locator('#tm-graphics-standard').click();
  await page.waitForFunction(() => window.__TM__?.ready === true);
  await expect(picker).toHaveValue('de');
});

test('English startup speech uses the translated English greeting', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one recorded-English codec check');
  test.setTimeout(240_000);
  await boot(page, 'seed=42&graphics=standard');
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => window.__TM__?.voice.pack === 'ready', null, {
    timeout: 60_000,
  });
  await startHunt(page, false);
  const bark = await (
    await page.waitForFunction(() => window.__TM__?.bark ?? null, null, { timeout: 60_000 })
  ).jsonValue();
  expect(bark?.line).toBe('bark.morning');
  expect(bark?.text).toBe(en['bark.morning']);
  expect(bark?.text).toContain('Good morning, my child!');
  await page.waitForFunction(
    () => window.__TM__?.voice.played.includes('voice/en/bark.morning'),
    null,
    { timeout: 60_000 },
  );
  await page.screenshot({
    path: 'tests/e2e/__screenshots__/startup-english-hunt-desktop-chromium.png',
  });
});

test('legacy automatic language adopts the English default once', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one save migration check');
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['de-DE'] });
    if (sessionStorage.getItem('legacy-language-seeded')) return;
    sessionStorage.setItem('legacy-language-seeded', '1');
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({ v: 1, settings: { language: 'auto' } }),
    );
  });
  await boot(page, 'seed=42&graphics=standard');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#startup-language-select')).toHaveValue('en');
  // Choose Auto through Settings so the active save changes along with the disk copy.
  await tapRect(page, false, 'settings');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  for (const language of ['af', 'de', 'nl', 'de']) {
    await tapRect(page, false, 'settings.language');
    await page.waitForFunction((lang) => document.documentElement.lang === lang, language);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
  }
  await page.reload();
  await page.waitForFunction(() => window.__TM__?.ready === true);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
