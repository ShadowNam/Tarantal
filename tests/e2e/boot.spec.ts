// M0 smoke test: the game boots on every device profile; portrait shows the rotate card.
import { expect, test, type Page } from '@playwright/test';
import { designSizeFor } from '../../src/game/layout';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('boots the game (landscape) or shows the rotate card (portrait)', async ({ page }, info) => {
  const orientation = info.project.metadata['orientation'] as 'landscape' | 'portrait';
  const errors = collectErrors(page);
  await page.goto('/?e2e=1&debug=1');

  const canvas = page.locator('#game canvas');
  await expect(canvas).toHaveCount(1);
  await page.waitForFunction(() => window.__TM__?.ready === true);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('profile has no viewport');
  const hook = await page.evaluate(() => window.__TM__);
  const rotateCard = page.locator('#rotate-card');

  if (orientation === 'landscape') {
    await expect(canvas).toBeVisible();
    await expect(rotateCard).toBeHidden();
    expect(hook?.portrait).toBe(false);
    expect(hook?.designHeight).toBe(1080);
    const expected = designSizeFor(viewport.width, viewport.height);
    expect(hook?.designWidth).toBe(expected.width);
    // The canvas backing store is the design size Phaser actually renders at.
    expect(
      await canvas.evaluate((c) => [
        (c as HTMLCanvasElement).width,
        (c as HTMLCanvasElement).height,
      ]),
    ).toEqual([expected.width, expected.height]);
    // Canvas must not let the browser scroll or zoom on touch.
    expect(await canvas.evaluate((c) => getComputedStyle(c).touchAction)).toBe('none');
  } else {
    await expect(rotateCard).toBeVisible();
    await expect(rotateCard.locator('h1')).toHaveText('Turn your device sideways');
    expect(hook?.portrait).toBe(true);
  }

  await page.screenshot({ path: `tests/e2e/__screenshots__/${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('no fullscreen button exists (iPhone Safari has no element Fullscreen API)', async ({
  page,
}) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__TM__?.ready === true);
  await expect(page.locator('[data-action="fullscreen"]')).toHaveCount(0);
});
