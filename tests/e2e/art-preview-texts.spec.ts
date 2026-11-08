// v1.14 (D-076) Texts & voices tab previews, on demand (not part of the regular suite;
// playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-texts.spec.ts --project=desktop-chromium
// One boot per device (desktop, Pixel 7, iPhone 14 landscape), three shots each. Writes
// docs/art-preview/compare/v114-texts-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   list:   the tab as it opens (desktop: all four languages side by side; phones: one language
//           with the language switch);
//   voiced: Oupa's weavers line — the 🔊 badge, a ▶ per voice language, "spoken as";
//   edit:   the edit box open on the title's Gun Shed line, after a refused Save (the placeholder
//           message shows on Daily streak's "{n}").
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { decodePng, encodePng8, resize } from '../../tools/assets/image';
import { isTouchProject } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const ADMIN = '/?e2e=1&reenbui=0&brakkie=0&cameos=0&admin=1&graphics=standard';

test.use({ serviceWorkers: 'block' });
test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  let img = decodePng(await page.screenshot());
  if (img.width > 1600) img = resize(img, 1600, Math.round((img.height * 1600) / img.width));
  writeFileSync(join(OUT, `v114-texts-${name}-${device(info.project.name)}.png`), encodePng8(img));
}

async function press(page: Page, touch: boolean, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  if (touch) await el.tap();
  else await el.click();
}

async function search(page: Page, q: string, id: string): Promise<void> {
  await page.locator('#tm-admin input[name=texts-search]').fill(q);
  await page.waitForFunction(
    (want) => window.__TM__?.adminTexts?.page.includes(want) === true,
    id,
    {
      timeout: 60_000,
    },
  );
}

test('Texts & voices: the list, a voiced line, the edit box', async ({ page }, info) => {
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await page.goto(ADMIN);
  await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
    timeout: 600_000,
  });
  await press(page, touch, '#tm-admin [data-action=tab-texts]');
  await page.waitForFunction(() => (window.__TM__?.adminTexts?.lines ?? 0) > 900, null, {
    timeout: 120_000,
  });
  // The voice index is in (▶ or "no clip" decided) before the first grab.
  await page.waitForTimeout(500);
  await shot(page, info, 'list');

  await search(page, 'bark.weavers', 'main|bark.weavers');
  await page.locator('#tm-admin [data-line="main|bark.weavers"]').scrollIntoViewIfNeeded();
  await shot(page, info, 'voiced');

  await search(page, 'title.daily_streak', 'main|title.daily_streak');
  await press(
    page,
    touch,
    '#tm-admin [data-line="main|title.daily_streak"] .tcell[data-lang=en] [data-action=texts-edit]',
  );
  await page.locator('#tm-admin textarea[name=texts-edit]').fill('Streak');
  await press(page, touch, '#tm-admin [data-action=texts-save]');
  await page.waitForFunction(() => window.__TM__?.adminTexts?.error != null, null, {
    timeout: 30_000,
  });
  await page.locator('#tm-admin textarea[name=texts-edit]').scrollIntoViewIfNeeded();
  await shot(page, info, 'edit');
});
