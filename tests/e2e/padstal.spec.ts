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
  test.setTimeout(420_000);
  const touch = isTouchProject(info);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // hook.rects keeps every id a menu ever published, so a rect can be left over from the screen
  // before. Each step forgets the ids the next screen will publish and waits for them again: a
  // tap only lands once that screen's menu exists (WebKit on CI builds scenes slowly).
  const forget = (...ids: string[]): Promise<void> =>
    page.evaluate((ks) => {
      const rects = window.__TM__?.rects;
      if (rects !== undefined) for (const k of ks) Reflect.deleteProperty(rects, k);
    }, ids);
  const fresh = async (id: string): Promise<void> => {
    await page.waitForFunction((k) => window.__TM__?.rects[k] !== undefined, id, {
      timeout: 90_000,
    });
    await page.waitForTimeout(300);
  };
  const atTitle = (): Promise<unknown> =>
    page.waitForFunction(
      () =>
        window.__TM__?.scene === 'start' &&
        typeof window.__TM__.runStatus === 'string' &&
        window.__TM__.rects['seasonRun'] !== undefined,
      null,
      { timeout: 90_000 },
    );
  const inView = (v: string): Promise<unknown> =>
    page.waitForFunction(
      (w) => window.__TM__?.scene === 'run' && window.__TM__.run?.view === w,
      v,
      { timeout: 90_000 },
    );
  /** Taps `id` and waits for `done`; one more tap if the screen did not move within 15 s. */
  const tapUntil = async (id: string, done: () => Promise<unknown>): Promise<void> => {
    const before = (await hook(page)).scene;
    await tapRect(page, touch, id);
    const moved = await page
      .waitForFunction((s) => window.__TM__?.scene !== s, before, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!moved && before !== 'run') await tapRect(page, touch, id);
    await done();
  };
  /** From a run screen to the title with [Save & leave]. */
  const leave = async (): Promise<void> => {
    await forget('seasonRun');
    await tapRect(page, touch, 'run.menu');
    await atTitle();
    await fresh('seasonRun');
  };

  await boot(page, 'seed=4&huntSeconds=1&quotaMul=0');
  await fresh('seasonRun');
  await forget('run.go');
  await tapUntil('seasonRun', () => inView('intro'));
  await fresh('run.go');
  // The tally's own button (not the hunt card's, left in the hook).
  await forget('run.menu', 'run.padstal');
  await tapRect(page, touch, 'run.go');
  await inView('tally');
  await fresh('run.menu');
  await fresh('run.padstal');
  const caps = (await hook(page)).run?.doppies ?? -1;
  expect(caps).toBeGreaterThan(0);
  await page.screenshot({ path: `${SCREENSHOTS}/run-leave-tally-${info.project.name}.png` });
  await leave();
  // Between hunts the line names the next hunt (hunt 1 was just played).
  expect((await hook(page)).runStatus).toContain('hunt 2 of 3');
  expect((await hook(page)).runStatus).toContain(`${caps} caps`);

  // Continue run: back on the tally, then into the stall; Escape first closes the help card.
  await forget('run.padstal');
  await tapUntil('seasonRun', () => inView('tally'));
  await fresh('run.padstal');
  await forget('run.helpClose', 'run.next', 'run.menu');
  await tapRect(page, touch, 'run.padstal');
  await inView('padstal');
  await fresh('run.helpClose');
  await page.keyboard.press('Escape');
  await fresh('run.next');
  await fresh('run.menu');
  expect((await hook(page)).scene).toBe('run');
  const before = (await hook(page)).run;
  await page.screenshot({ path: `${SCREENSHOTS}/run-leave-padstal-${info.project.name}.png` });
  await leave();
  expect((await hook(page)).runStatus).toContain(`${before?.doppies ?? -1} caps`);
  await page.screenshot({ path: `${SCREENSHOTS}/run-leave-title-${info.project.name}.png` });

  // The same stall again: same caps, same offers. Escape leaves it too (the Android back button).
  await forget('run.next', 'run.menu');
  await tapUntil('seasonRun', () => inView('padstal'));
  await fresh('run.next');
  await fresh('run.menu');
  const again = (await hook(page)).run;
  expect(again?.doppies).toBe(before?.doppies);
  expect(again?.offers).toEqual(before?.offers);
  await forget('seasonRun');
  await page.keyboard.press('Escape');
  await atTitle();
  await fresh('seasonRun');
  expect(errors).toEqual([]);
});
