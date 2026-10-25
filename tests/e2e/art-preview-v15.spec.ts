// v1.5 languages (D-041) previews, on demand (not part of the regular suite): the title, Settings
// (Sound & game, with the text and voice language and the Afrikaans-names toggle), the Skiet-Skuur
// and a tally, in English, Afrikaans and German, plus English with "Afrikaans names" on. Run one
// profile at a time:
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v15.spec.ts --project=desktop-chromium
// Writes docs/art-preview/compare/v15-lang-<lang>-<screen>-<device>.png (palette PNG, ≤ 1600 px
// wide). No aimed shots: the tally comes from a 2 s hunt left alone. On desktop the mouse is
// parked at the canvas centre after every click, never in the edge-pan bands.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { decodePng, encodePng8, resize } from '../../tools/assets/image';
import { loadDailyMeta } from '../../tools/testContent';
import { boot, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const EPOCH = loadDailyMeta().epoch;

test.use({ serviceWorkers: 'block' });

/** One preview set: a text language, and whether the Afrikaans names are on. */
const SETS = [
  { id: 'en', settings: { language: 'en' } },
  { id: 'af', settings: { language: 'af' } },
  { id: 'de', settings: { language: 'de' } },
  { id: 'en-afnames', settings: { language: 'en', afrikaansNames: true } },
] as const;

function save(name: string, info: TestInfo, png: Buffer): void {
  mkdirSync(OUT, { recursive: true });
  let img = decodePng(png);
  if (img.width > 1600) img = resize(img, 1600, Math.round((img.height * 1600) / img.width));
  writeFileSync(join(OUT, `v15-lang-${name}-${device(info.project.name)}.png`), encodePng8(img));
}

/** Fonts in, a few frames drawn. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(700);
}

/** Desktop: the mouse rests at the canvas centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function tap(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction((r) => window.__TM__?.rects[r] !== undefined, id, {
    timeout: 60_000,
  });
  await tapRect(page, touch, id);
  await park(page, touch);
}

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await settled(page);
  save(name, info, await page.locator('#game canvas').screenshot());
}

for (const set of SETS) {
  test(`v1.5 ${set.id}: title, Settings, Skiet-Skuur and a tally`, async ({ page }, info) => {
    test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
    test.skip(
      !PROFILES.includes(device(info.project.name)),
      'previews: desktop, Pixel 7, iPhone 14',
    );
    // Four screens and one 2 s hunt: about 2 minutes under software GL.
    test.setTimeout(360_000);
    const touch = isTouchProject(info);
    await page.addInitScript((s) => {
      const key = 'tm.e2e.save.v1';
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify({ v: 1, settings: { quality: 'high', ...s } }));
    }, set.settings);
    await boot(page, `today=${EPOCH}&seed=42&huntSeconds=2`);
    await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
      timeout: 60_000,
    });
    await park(page, touch);
    await shot(page, info, `${set.id}-title`);

    await tap(page, touch, 'settings');
    await page.waitForFunction(() => window.__TM__?.menu === 'settings');
    await shot(page, info, `${set.id}-settings`);
    await tap(page, touch, 'settings.back');
    await page.waitForFunction(() => window.__TM__?.menu !== 'settings');

    await tap(page, touch, 'shed');
    await page.waitForFunction(() => (window.__TM__?.shedNames?.length ?? 0) > 0, null, {
      timeout: 60_000,
    });
    await shot(page, info, `${set.id}-shed`);
    // Esc closes the Skiet-Skuur on every profile (the menus take the keyboard).
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
      timeout: 60_000,
    });

    await tap(page, touch, 'start');
    await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 120_000 });
    await page.waitForFunction(() => window.__TM__?.rects['again'] !== undefined, null, {
      timeout: 60_000,
    });
    // Past the count-up, stamp and news line.
    await page.waitForTimeout(2500);
    await shot(page, info, `${set.id}-tally`);
  });
}
