// M9 Padstal clarity + text size/contrast on phones (D-026, user feedback). A run with almost no
// Doppies (?doppies=1) reaches the Padstal: offers it can't buy say why on their own plate, and
// the first-visit help card fits its text with large text (desktop at 4:3 and on phones).
// Screenshots for review: padstal-blocked-*, padstal-help-large-*, a11y-phone-*.
import { expect, test, type Page } from '@playwright/test';
import { boot, hook, isLandscape, isTouchProject, SCREENSHOTS, tapRect } from './helpers';

const SAVE = 'tm.e2e.save.v1';
/** Languages this branch ships (D adds de). */
const LANGS = ['en'] as const;

async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, s]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, JSON.stringify({ v: 1, settings: s }));
    },
    [SAVE, settings] as const,
  );
}

/** Title → Season Run → one short hunt → run tally → the Padstal (help card up on a first visit). */
async function toPadstal(page: Page, touch: boolean): Promise<void> {
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
}

for (const lang of LANGS) {
  test(`${lang}: offers the run can't afford say why, readable on phones`, async ({
    page,
  }, info) => {
    test.skip(
      !['iphone14-landscape', 'iphone14-landscape-chromium-fallback', 'pixel7-landscape'].includes(
        info.project.name,
      ),
      'phone profiles',
    );
    test.setTimeout(180_000);
    const touch = isTouchProject(info);
    await seedSettings(page, { language: lang });
    await boot(page, 'seed=4&huntSeconds=1&quotaMul=0&doppies=1');
    await toPadstal(page, touch);
    await tapRect(page, touch, 'run.helpClose');
    await page.waitForFunction(() => window.__TM__?.rects['run.next'] !== undefined);
    const run = (await hook(page)).run;
    expect(run?.doppies).toBe(1);
    // Every open offer costs more than 1 Doppie: each card carries its own note.
    const open = (run?.offers ?? []).filter((o) => o.endsWith(':open')).length;
    expect(run?.notes.length).toBe(open);
    expect(open).toBeGreaterThan(0);
    await page.screenshot({
      path: `${SCREENSHOTS}/padstal-blocked-${lang}-${info.project.name}.png`,
    });
  });

  test(`${lang}: the Padstal help card fits its text with large text`, async ({ page }, info) => {
    const desktop = info.project.name === 'desktop-chromium';
    test.skip(
      !desktop &&
        !['iphone14-landscape', 'iphone14-landscape-chromium-fallback'].includes(info.project.name),
      'desktop at 4:3 and iPhone 14 landscape',
    );
    test.setTimeout(180_000);
    // 4:3 is the tallest layout for the card's width (the narrowest design width).
    if (desktop) await page.setViewportSize({ width: 1024, height: 768 });
    const touch = isTouchProject(info);
    await seedSettings(page, { language: lang, textSize: 'large' });
    await boot(page, 'seed=4&huntSeconds=1&quotaMul=0');
    await toPadstal(page, touch);
    await page.waitForFunction(() => window.__TM__?.rects['run.helpClose'] !== undefined);
    const card = (await hook(page)).helpCard;
    expect(card).toBeDefined();
    expect(card?.textBottom ?? 0).toBeLessThan(card?.okTop ?? 0);
    await page.screenshot({
      path: `${SCREENSHOTS}/padstal-help-large-${lang}-${info.project.name}.png`,
    });
  });
}

test('large text + high contrast on a phone: Settings, tally and Padstal', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'Pixel 7 landscape');
  test.skip(!isLandscape(info), 'landscape');
  test.setTimeout(240_000);
  const touch = true;
  await seedSettings(page, { textSize: 'large', highContrast: true });
  await boot(page, 'seed=4&huntSeconds=1&quotaMul=0');
  const shot = (name: string) =>
    page.screenshot({ path: `${SCREENSHOTS}/a11y-phone-${name}-${info.project.name}.png` });
  await page.waitForFunction(() => window.__TM__?.rects['settings'] !== undefined);
  await tapRect(page, touch, 'settings');
  await page.waitForFunction(() => window.__TM__?.menu === 'settings');
  await shot('settings1');
  await tapRect(page, touch, 'settings.page.1');
  await page.waitForFunction(() => window.__TM__?.rects['settings.captions'] !== undefined);
  await shot('settings2');
  await tapRect(page, touch, 'settings.back');
  await page.waitForFunction(() => window.__TM__?.menu === null);
  await toPadstal(page, touch);
  await shot('padstal-help');
  await tapRect(page, touch, 'run.helpClose');
  await page.waitForFunction(() => window.__TM__?.rects['run.next'] !== undefined);
  await shot('padstal');
  // The tally of a Classic hunt.
  await tapRect(page, touch, 'run.next');
  await page.waitForFunction(() => window.__TM__?.run?.view === 'intro');
  await tapRect(page, touch, 'run.menu');
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 90_000 });
  await shot('tally');
});
