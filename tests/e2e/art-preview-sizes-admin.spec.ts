// v1.22.1 (D-086) the owner's size tool, for him to see (not part of the regular suite:
// playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-sizes-admin.spec.ts \
//     --project=desktop-chromium --project=pixel7-landscape
// Two shots per profile: the admin page's Sizes tab (the Karoo's animals), and the size editor on
// the Karoo with the ostrich sprinting past picked (outlined, named, its height, the guineafowl
// yardstick beside it). Writes docs/art-preview/compare/sizes-admin-<shot>-<device>.png (PNG-8).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { decodePng, encodePng8 } from '../../tools/assets/image';
import { isTouchProject, tapAt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape'];
const ADMIN = '/?e2e=1&reenbui=0&admin=1&graphics=standard';

async function shot(page: Page, name: string, device: string): Promise<void> {
  await page.waitForTimeout(600);
  const png = decodePng(await page.screenshot());
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `sizes-admin-${name}-${device}.png`), encodePng8(png));
}

test.use({ serviceWorkers: 'block' });

test('the Sizes tab and the size editor with the Karoo ostrich picked', async ({ page }, info) => {
  test.skip(!PROFILES.includes(info.project.name), 'desktop and Pixel 7 landscape only');
  test.setTimeout(300_000);
  const device = info.project.name.replace(/-chromium$/, '');
  const touch = isTouchProject(info);
  await page.goto(ADMIN);
  await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
    timeout: 90_000,
  });
  const tab = page.locator('#tm-admin [data-action=tab-sizes]');
  if (touch) await tab.tap();
  else await tab.click();
  await page.waitForFunction(() => window.__TM__?.sizes?.view === 'tab', null, {
    timeout: 60_000,
  });
  await page.locator('#tm-admin [data-area=karoo]').scrollIntoViewIfNeeded();
  await shot(page, 'tab', device);

  await page.goto('/?e2e=1&reenbui=0&admin=1&graphics=standard&sizes=karoo');
  await page.waitForFunction(
    () =>
      window.__TM__?.sizes?.view === 'editor' &&
      window.__TM__.tick >= 480 &&
      window.__TM__.sizes.spots['cameo_ostrich'] !== undefined,
    null,
    { timeout: 120_000 },
  );
  const spot = await page.evaluate(() => window.__TM__?.sizes?.spots['cameo_ostrich']);
  if (spot === undefined) throw new Error('no ostrich on screen');
  await tapAt(page, touch, spot.x, spot.y);
  await page.waitForFunction(() => window.__TM__?.sizes?.selected === 'cameo_ostrich', null, {
    timeout: 30_000,
  });
  await shot(page, 'editor-ostrich', device);
});
