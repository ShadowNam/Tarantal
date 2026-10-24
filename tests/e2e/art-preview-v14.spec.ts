// v1.4 B (D-039) previews, on demand (not part of the regular suite): the redrawn camelthorn and
// family nest in a real Kalahari hunt. Run one profile at a time:
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v14.spec.ts --project=desktop-chromium
// Writes docs/art-preview/compare/v14-camelthorn-*-<project>.png (palette PNG, ≤ 1600 px wide).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { decodePng, encodePng8, resize } from '../../tools/assets/image';
import { boot, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(info.project.name), 'previews: desktop, Pixel 7, iPhone 14');
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
        }),
      );
  });
});

function save(name: string, info: TestInfo, png: Buffer): void {
  mkdirSync(OUT, { recursive: true });
  let img = decodePng(png);
  if (img.width > 1600) img = resize(img, 1600, Math.round((img.height * 1600) / img.width));
  writeFileSync(join(OUT, `${name}-${info.project.name}.png`), encodePng8(img));
}

/** A hunt held at `holdAt`, panned to the left end stop (the weaver tree is at u 0.2 on mid). */
async function heldLeft(page: Page, info: TestInfo, query: string, holdAt: number): Promise<void> {
  await boot(page, `${query}&holdAt=${holdAt}`);
  await startHunt(page, isTouchProject(info));
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => (window.__TM__?.cameraX ?? 9999) <= 961, null, {
    timeout: 300_000,
  });
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, holdAt, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
  await page.waitForTimeout(1500);
}

test('Kalahari: the camelthorn with the family nest in a hunt', async ({ page }, info) => {
  test.setTimeout(600_000);
  await heldLeft(page, info, 'seed=42&huntSeconds=20&biome=kalahari-summer', 240);
  save('v14-camelthorn-kalahari-hunt', info, await page.screenshot());
  // The nest close up (the weaver tree stands at about 40 % across at the left end stop).
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null)
    save(
      'v14-camelthorn-kalahari-closeup',
      info,
      await page.screenshot({
        clip: {
          x: box.x + box.width * 0.24,
          y: box.y + box.height * 0.17,
          width: box.width * 0.3,
          height: box.height * 0.36,
        },
      }),
    );
});

test('Kalahari: texture memory on the low tier', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'measured on the Pixel 7 profile');
  test.setTimeout(600_000);
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: object };
    localStorage.setItem(
      key,
      JSON.stringify({ ...s, settings: { ...s.settings, quality: 'low' } }),
    );
  });
  await heldLeft(page, info, 'seed=42&huntSeconds=20&biome=kalahari-summer', 240);
  const bytes = await page.evaluate(() => window.__TM__?.textureBytes ?? 0);
  const mb = Math.round((bytes / 1024 / 1024) * 10) / 10;
  writeFileSync(
    join(OUT, 'v14-camelthorn-texture-memory.json'),
    `${JSON.stringify({ unit: 'MB', tier: 'low', 'kalahari-summer': mb }, null, 2)}\n`,
  );
  console.log(`kalahari-summer low tier: ${mb} MB`);
});
