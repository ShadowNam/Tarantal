// M9 de + nl: the game runs in German and Dutch (title, both Settings pages, a hunt's tally) and
// the screenshots are for the long-text review. Language picked through Settings → language.
import { expect, test, type Page } from '@playwright/test';
import { boot, isLandscape, isTouchProject, SCREENSHOTS, startHunt, tapRect } from './helpers';

async function seedLanguage(page: Page, language: string): Promise<void> {
  await page.addInitScript((lang) => {
    if (localStorage.getItem('tm.e2e.save.v1') !== null) return;
    localStorage.setItem('tm.e2e.save.v1', JSON.stringify({ v: 1, settings: { language: lang } }));
  }, language);
}

for (const lang of ['de', 'nl'] as const) {
  test(`${lang}: title, Settings and a tally render in ${lang}`, async ({ page }, info) => {
    test.skip(!isLandscape(info), 'landscape screens');
    const touch = isTouchProject(info);
    await seedLanguage(page, lang);
    await boot(page, 'huntSeconds=2');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);
    const shot = (name: string) =>
      page.screenshot({ path: `${SCREENSHOTS}/i18n-${lang}-${name}-${info.project.name}.png` });
    await shot('title');
    await tapRect(page, touch, 'settings');
    await page.waitForFunction(() => window.__TM__?.menu === 'settings');
    await shot('settings1');
    await tapRect(page, touch, 'settings.page.1');
    await page.waitForFunction(() => window.__TM__?.rects['settings.captions'] !== undefined);
    await shot('settings2');
    await tapRect(page, touch, 'settings.back');
    await page.waitForFunction(() => window.__TM__?.menu === null);
    await startHunt(page, touch);
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 90_000 });
    await shot('tally');
  });
}
