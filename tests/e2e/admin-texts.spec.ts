// v1.14 (D-076): the admin page's Texts & voices tab on the web build, in landscape (desktop,
// Pixel 7, iPhone 14): open the tab, search a known key, a placeholder dropped is refused, edit
// a title line, turn on "Use my edits in the game", read the edit on the title (and ✎ on the
// build stamp), the export carries it, a voiced line has its ▶ and "spoken as", then revert.
import { expect, test, type Page } from '@playwright/test';
import { boot, collectErrors, hook, isLandscape, isTouchProject } from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
const ADMIN = '/?e2e=1&reenbui=0&brakkie=0&cameos=0&admin=1&graphics=standard';
const EDITED = 'Gun Shed (edited)';

async function press(page: Page, touch: boolean, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

async function openTexts(page: Page, touch: boolean): Promise<void> {
  await page.goto(ADMIN);
  await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
    timeout: 90_000,
  });
  await press(page, touch, '#tm-admin [data-action=tab-texts]');
  await page.waitForFunction(() => (window.__TM__?.adminTexts?.lines ?? 0) > 900, null, {
    timeout: 60_000,
  });
}

async function search(page: Page, q: string, id: string): Promise<void> {
  await page.locator('#tm-admin input[name=texts-search]').fill(q);
  await page.waitForFunction(
    (want) => window.__TM__?.adminTexts?.page.includes(want) === true,
    id,
    {
      timeout: 30_000,
    },
  );
}

/** The English cell of a line (every layout shows English: all four columns, or the switch's). */
const cell = (id: string): string => `#tm-admin [data-line="${id}"] .tcell[data-lang=en]`;

test.describe('admin Texts & voices', () => {
  test.skip(PLATFORM !== 'web', 'web build only (portals ignore ?admin=1)');
  test.use({ serviceWorkers: 'block' });

  test('search, edit a title line, use it in the game, export, revert', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await openTexts(page, touch);
    const first = await hook(page);
    expect(first.adminTexts?.changed).toBe(0);
    expect(first.adminTexts?.apply).toBe(false);
    // Phones: the header and toolbar leave room — the first row starts in the top 60 % of the
    // screen when the tab opens.
    if (touch) {
      const top = await page
        .locator('#tm-admin .trow')
        .first()
        .evaluate((e) => e.getBoundingClientRect().top / window.innerHeight);
      expect(top).toBeLessThan(0.6);
    }
    // Paged: never more than one page of rows in the DOM.
    expect(await page.locator('#tm-admin .trow').count()).toBeLessThanOrEqual(40);
    // Phones get one language at a time; English is a choice there and on desktop.
    await page.locator('#tm-admin select[name=texts-lang]').selectOption('en');
    await expect(page.locator('#tm-admin .tcell[data-lang=af]')).toHaveCount(0);
    if (!touch) await page.locator('#tm-admin select[name=texts-lang]').selectOption('all');

    // A dropped placeholder is refused with a message.
    await search(page, 'title.daily_streak', 'main|title.daily_streak');
    await press(page, touch, `${cell('main|title.daily_streak')} [data-action=texts-edit]`);
    await page.locator('#tm-admin textarea[name=texts-edit]').fill('Streak');
    await press(page, touch, '#tm-admin [data-action=texts-save]');
    await page.waitForFunction(
      () => (window.__TM__?.adminTexts?.error ?? '').includes('{n}'),
      null,
      {
        timeout: 10_000,
      },
    );
    await expect(page.locator('#tm-admin [data-role=texts-error]')).toContainText('{n}');
    await press(page, touch, '#tm-admin [data-action=texts-cancel]');
    expect((await hook(page)).adminTexts?.changed).toBe(0);

    // Edit the title's Gun Shed line and use the edits in the game.
    await search(page, 'title.shed', 'main|title.shed');
    await press(page, touch, `${cell('main|title.shed')} [data-action=texts-edit]`);
    await page.locator('#tm-admin textarea[name=texts-edit]').fill(EDITED);
    // The edit box's Save is on screen (not cut off under the toolbar or the screen's edge).
    await expect(page.locator('#tm-admin [data-action=texts-save]')).toBeInViewport();
    await press(page, touch, '#tm-admin [data-action=texts-save]');
    await page.waitForFunction(() => window.__TM__?.adminTexts?.changed === 1, null, {
      timeout: 10_000,
    });
    await expect(page.locator(`${cell('main|title.shed')} [data-action=texts-edit]`)).toHaveText(
      EDITED,
    );
    await press(page, touch, '#tm-admin [data-action=texts-apply]');
    await page.waitForFunction(() => window.__TM__?.adminTexts?.apply === true, null, {
      timeout: 10_000,
    });
    // On this device only, under their own key: never in the save file.
    const stored = await page.evaluate(() => ({
      edits: localStorage.getItem('tm.e2e.textEdits.v1'),
      save: localStorage.getItem('tm.e2e.admin.save.v1') ?? '',
    }));
    expect(stored.edits).toContain(EDITED);
    expect(stored.save).not.toContain(EDITED);

    // The export carries the edit (Download sets the hook's copy of the file).
    await press(page, touch, '#tm-admin [data-action=texts-download]');
    await page.waitForFunction(() => window.__TM__?.adminTexts?.lastExport != null, null, {
      timeout: 10_000,
    });
    const file = JSON.parse((await hook(page)).adminTexts?.lastExport ?? '{}') as {
      version: number;
      build: { version: string; commit: string };
      edits: {
        key: string;
        table: string;
        lang: string;
        from: string;
        to: string;
        voiced: boolean;
        field: string;
      }[];
    };
    expect(file.version).toBe(1);
    expect(file.build.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(file.edits).toEqual([
      {
        key: 'title.shed',
        table: 'main',
        lang: 'en',
        from: 'Gun Shed',
        to: EDITED,
        voiced: false,
        field: 'text',
      },
    ]);

    // A voiced line: its badge, a ▶ per voice language, and the voice tool's "spoken as".
    await search(page, 'bark.weavers', 'main|bark.weavers');
    const row = `#tm-admin [data-line="main|bark.weavers"]`;
    await expect(page.locator(`${row} .tbadge.voiced`)).toHaveCount(1);
    await expect(
      page.locator(`${cell('main|bark.weavers')} [data-clip="voice/en/bark.weavers"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`${cell('main|bark.weavers')} [data-action=texts-edit-say]`),
    ).toContainText('Leave our nest');
    await press(page, touch, `${cell('main|bark.weavers')} [data-action=texts-play]`);
    await page.waitForFunction(() => window.__TM__?.adminTexts?.played != null, null, {
      timeout: 30_000,
    });
    const played = (await hook(page)).adminTexts?.played;
    expect(played?.key).toBe('voice/en/bark.weavers');
    // The clip is in the voice index (headless audio may still refuse to play it).
    expect(played?.result).not.toBe('missing');

    // The game, on this device, shows the edit: the title's button and ✎ on the build stamp.
    await boot(page, 'graphics=standard');
    await page.waitForFunction((want) => window.__TM__?.titleShedLabel === want, EDITED, {
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__TM__?.stamp !== undefined, null, { timeout: 60_000 });
    expect((await hook(page)).stamp?.text).toContain('✎ 1');

    // Revert to the original: no edits left; the title says Gun Shed again.
    await openTexts(page, touch);
    expect((await hook(page)).adminTexts?.apply).toBe(true);
    await search(page, 'title.shed', 'main|title.shed');
    await press(page, touch, `${cell('main|title.shed')} [data-action=texts-edit]`);
    await press(page, touch, '#tm-admin [data-action=texts-revert]');
    await page.waitForFunction(() => window.__TM__?.adminTexts?.changed === 0, null, {
      timeout: 10_000,
    });
    await expect(page.locator(`${cell('main|title.shed')} [data-action=texts-edit]`)).toHaveText(
      'Gun Shed',
    );
    await boot(page, 'graphics=standard');
    await page.waitForFunction(() => window.__TM__?.titleShedLabel === 'Gun Shed', null, {
      timeout: 60_000,
    });
    expect(errors).toEqual([]);
  });
});
