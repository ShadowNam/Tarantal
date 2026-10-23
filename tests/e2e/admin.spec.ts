// v1.2x (D-034) playtest admin page on the web build: `?admin=1` lists every playable map, plays a
// Karoo Friday hunt with the chosen options, returns to the admin page from the tally, and a
// review (status, rating, notes) survives a reload. Admin hunts keep their own save. The portal
// builds ignore `?admin=1` (platform.spec.ts).
import { expect, test, type Page } from '@playwright/test';
import { adminEntries } from '../../src/meta/admin';
import { loadContent } from '../../tools/testContent';
import { collectErrors, hook, isLandscape, isTouchProject, SCREENSHOTS, tapRect } from './helpers';

const PLATFORM = process.env['E2E_PLATFORM'] || 'web';
const content = loadContent();
const ENTRIES = adminEntries(
  content,
  content.biomes.map((b) => b.id),
);
const FRIDAY = 'classic:karoo-autumn:fri';

async function waitAdmin(page: Page, view: 'list' | 'play'): Promise<void> {
  await page.waitForFunction((v) => window.__TM__?.admin?.view === v, view, { timeout: 90_000 });
}

/** Clicks (desktop) or taps (touch) a DOM element of the admin panel. */
async function press(page: Page, touch: boolean, selector: string): Promise<void> {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

test.describe('playtest admin page', () => {
  test.skip(PLATFORM !== 'web', 'web build only (portals ignore ?admin=1)');

  test('lists every map, plays Karoo Friday, back to admin, a note persists', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'the admin page is used in landscape');
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    const touch = isTouchProject(info);
    await page.goto('/?e2e=1&admin=1');
    await waitAdmin(page, 'list');
    expect((await hook(page)).scene).toBe('admin');

    // Every playable map is listed, read from content.
    const items = page.locator('#tm-admin .list [data-entry]');
    await expect(items).toHaveCount(ENTRIES.length);
    for (const id of [
      FRIDAY,
      'classic:okavango-spring:plain',
      'classic:kalahari-summer:verder',
      'daily',
      'season:somer:3',
    ])
      await expect(page.locator(`#tm-admin .list [data-entry="${id}"]`)).toHaveCount(1);
    await page.screenshot({ path: `${SCREENSHOTS}/admin-list-${info.project.name}.png` });

    // Pick Karoo Friday with a fixed seed and a short hunt, then play it.
    await press(page, touch, `#tm-admin .list [data-entry="${FRIDAY}"]`);
    await expect(page.locator('#tm-admin .detail')).toHaveAttribute('data-entry', FRIDAY);
    await page.locator('#tm-admin select[name=huntSeconds]').selectOption('15');
    await page.locator('#tm-admin input[name=seed]').fill('42');
    await page.locator('#tm-admin input[name=seed]').press('Tab');
    await page.locator('#tm-admin select[name=weapon]').selectOption('pomp');
    await press(page, touch, '#tm-admin [data-action=play]');
    await waitAdmin(page, 'play');
    expect(page.url()).toContain('play=1');
    await page.screenshot({ path: `${SCREENSHOTS}/admin-play-${info.project.name}.png` });
    await press(page, touch, '#tm-admin [data-action=start]');
    await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 90_000 });
    const h = await hook(page);
    expect(h.mode).toBe('classic');
    expect(h.biome).toBe('karoo-autumn');
    expect(h.map?.layout).toBe('fri');
    expect(h.huntSeed).toBe(42);
    expect(h.weapon).toBe('pomp');
    expect(h.durationTicks).toBe(15 * 60);
    await expect(page.locator('#tm-admin')).toHaveCount(0);

    // The tally offers [Back to admin]; the player's save was never written.
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 180_000 });
    expect((await hook(page)).rects['admin']).toBeDefined();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('tm.e2e.admin.save.v1');
    expect(keys).not.toContain('tm.e2e.save.v1');
    await page.screenshot({ path: `${SCREENSHOTS}/admin-tally-${info.project.name}.png` });
    await tapRect(page, touch, 'admin');
    await waitAdmin(page, 'list');
    expect(page.url()).not.toContain('play=1');
    expect((await hook(page)).admin?.selected).toBe(FRIDAY);

    // Review it: needs work, 3 stars, a note.
    await press(page, touch, '#tm-admin [data-action=status-work]');
    await press(page, touch, '#tm-admin [data-action=rate-3]');
    await page.locator('#tm-admin textarea[name=notes]').fill('Farmhouse cut off at the bottom.');
    await page.reload();
    await waitAdmin(page, 'list');
    await expect(page.locator('#tm-admin textarea[name=notes]')).toHaveValue(
      'Farmhouse cut off at the bottom.',
    );
    await expect(page.locator('#tm-admin [data-action=status-work]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`#tm-admin .list [data-entry="${FRIDAY}"] .dot`)).toHaveClass(/work/);
    await expect(page.locator(`#tm-admin .list [data-entry="${FRIDAY}"] .stars`)).toHaveText('★★★');

    // The report carries the note and the hunt that was played (seed 42, Plaas-Pomp).
    await press(page, touch, '#tm-admin [data-action=copy-report]');
    const report = page.locator('#tm-admin [data-role=toast]');
    await expect(report).toHaveAttribute('data-report', /Farmhouse cut off at the bottom\./);
    const md = (await report.getAttribute('data-report')) ?? '';
    expect(md).toContain(FRIDAY);
    expect(md).toContain('seed 42');
    expect(md).toContain('gun pomp');
    await page.screenshot({ path: `${SCREENSHOTS}/admin-review-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
});
