// M9 Padstal clarity + text size/contrast on phones (D-026, user feedback). A run with almost no
// Doppies (?doppies=1) reaches the Padstal: offers it can't buy say why on their own plate, and
// the first-visit help card fits its text with large text (desktop at 4:3 and on phones).
// Screenshots for review: padstal-blocked-*, padstal-help-large-*, a11y-phone-*.
import { expect, test, type Page } from '@playwright/test';
import { boot, hook, isLandscape, isTouchProject, SCREENSHOTS, tapRect } from './helpers';

const SAVE = 'tm.e2e.save.v1';
/** English and the longest language (German). */
const LANGS = ['en', 'de'] as const;

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

// D-060 (user feedback, 29 Oct): the Farm Stall had no way out but [Next hunt]. Every screen of a
// run in play now has [Save & leave]: the title shows the run's season, hunt and caps over
// "Continue run", which resumes on the same screen with the same caps and offers. Escape (the
// Android back button's key) does the same, and closes the stall's help card first.
test('Save & leave: tally and Farm Stall to the title and back, caps and offers kept', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'runs are played in landscape');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const forget = (id: string): Promise<void> =>
    page.evaluate((k) => {
      const rects = window.__TM__?.rects;
      if (rects !== undefined) Reflect.deleteProperty(rects, k);
    }, id);
  const fresh = (id: string): Promise<unknown> =>
    page.waitForFunction((k) => window.__TM__?.rects[k] !== undefined, id, { timeout: 60_000 });
  const atTitle = (): Promise<unknown> =>
    page.waitForFunction(
      () =>
        window.__TM__?.scene === 'start' &&
        typeof window.__TM__.runStatus === 'string' &&
        window.__TM__.rects['seasonRun'] !== undefined,
      null,
      { timeout: 60_000 },
    );
  const view = (v: string): Promise<unknown> =>
    page.waitForFunction((w) => window.__TM__?.run?.view === w, v, { timeout: 90_000 });

  await boot(page, 'seed=4&huntSeconds=1&quotaMul=0');
  await page.waitForFunction(() => window.__TM__?.rects['seasonRun'] !== undefined);
  await tapRect(page, touch, 'seasonRun');
  await view('intro');
  // The tally's own button (not the hunt card's, left in the hook).
  await forget('run.menu');
  await tapRect(page, touch, 'run.go');
  await view('tally');
  await fresh('run.menu');
  const caps = (await hook(page)).run?.doppies ?? -1;
  expect(caps).toBeGreaterThan(0);
  await page.screenshot({ path: `${SCREENSHOTS}/run-leave-tally-${info.project.name}.png` });
  await tapRect(page, touch, 'run.menu');
  await atTitle();
  // Between hunts the line names the next hunt (hunt 1 was just played).
  expect((await hook(page)).runStatus).toContain('hunt 2 of 3');
  expect((await hook(page)).runStatus).toContain(`${caps} caps`);

  // Continue run: back on the tally, then into the stall; Escape first closes the help card.
  await tapRect(page, touch, 'seasonRun');
  await view('tally');
  await tapRect(page, touch, 'run.padstal');
  await view('padstal');
  await forget('run.next');
  await page.keyboard.press('Escape');
  await fresh('run.next');
  expect((await hook(page)).scene).toBe('run');
  const before = (await hook(page)).run;
  await page.screenshot({ path: `${SCREENSHOTS}/run-leave-padstal-${info.project.name}.png` });
  await tapRect(page, touch, 'run.menu');
  await atTitle();
  expect((await hook(page)).runStatus).toContain(`${before?.doppies ?? -1} caps`);
  await page.screenshot({ path: `${SCREENSHOTS}/run-leave-title-${info.project.name}.png` });

  // The same stall again: same caps, same offers. Escape leaves it too (the Android back button).
  await tapRect(page, touch, 'seasonRun');
  await view('padstal');
  const again = (await hook(page)).run;
  expect(again?.doppies).toBe(before?.doppies);
  expect(again?.offers).toEqual(before?.offers);
  await page.keyboard.press('Escape');
  await atTitle();
  expect(errors).toEqual([]);
});
