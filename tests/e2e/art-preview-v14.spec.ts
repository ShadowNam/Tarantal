// v1.4 B (D-039) previews, on demand (not part of the regular suite): the redrawn camelthorn and
// family nest in a real Kalahari hunt, and the Namibië pack (the salt pan at three weekday
// lights, camelthorn close-ups, the angry weavers, the waterhole through the Langloop's scope,
// the locked area card, the Kalahari before/after). Run one profile at a time:
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v14.spec.ts --project=desktop-chromium
// Writes docs/art-preview/compare/v14-camelthorn-*-<project>.png and v14-namibie-*-<project>.png
// (palette PNG, ≤ 1600 px wide). The Kalahari "before" serves main's asset index and its old
// camelthorn files from BEFORE_DIR (extracted with `git show origin/main:public/…`).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { decodePng, encodePng8, resize } from '../../tools/assets/image';
import { composePair } from '../../tools/art/compare';
import { boot, hook, isTouchProject, startHunt, tapAt, tapRect } from './helpers';

const RAW = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'screens');
const BEFORE_DIR = process.env['BEFORE_DIR'] ?? '';

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
  await settled(page, holdAt);
}

/** Waits for the held tick, the fonts, and parks the pointer in the corner. */
async function settled(page: Page, holdAt: number): Promise<void> {
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, holdAt, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
  await page.waitForTimeout(1500);
}

/** A part of the canvas (fractions of its box). */
async function shotOf(page: Page, x: number, y: number, w: number, h: number): Promise<Buffer> {
  const box = await page.locator('#game canvas').boundingBox();
  if (box === null) return page.screenshot();
  return page.screenshot({
    clip: {
      x: box.x + box.width * x,
      y: box.y + box.height * y,
      width: box.width * w,
      height: box.height * h,
    },
  });
}

/** A returning player who reached Die Verste, with the Langloop and its variable scope. */
async function rifleSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'langloop', sights: { langloop: 'scope_var' } },
        unlocks: { weapons: ['twee_twee', 'langloop'], sights: [] },
        bestRank: 'bosveldjagter',
        bonusMaps: {
          day: 20700,
          unlocked: [],
          bests: { 'karoo-autumn/dieVerste': { score: 900, rank: 'bosveldjagter' } },
        },
      }),
    );
  });
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
  const out: Record<string, number> = {};
  for (const biome of ['kalahari-summer', 'namibie']) {
    await heldLeft(page, info, `seed=42&huntSeconds=20&biome=${biome}`, 240);
    const bytes = await page.evaluate(() => window.__TM__?.textureBytes ?? 0);
    out[biome] = Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
  writeFileSync(
    join(OUT, 'v14-camelthorn-texture-memory.json'),
    `${JSON.stringify({ unit: 'MB', tier: 'low', ...out }, null, 2)}\n`,
  );
  console.log(`low tier: ${JSON.stringify(out)}`);
});

// --- the Namibië pack ----------------------------------------------------------------------

/** UTC days of the week of 19 Oct 2026 (Mon): the layout follows the day. */
const DAYS = { mon: '2026-10-19', tue: '2026-10-20', sat: '2026-10-24' } as const;

test('Namibië: the salt pan at three weekday lights (dawn, midday mirage, dusk)', async ({
  page,
}, info) => {
  test.setTimeout(900_000);
  for (const [day, date] of Object.entries(DAYS)) {
    await boot(page, `biome=namibie&today=${date}&seed=42&huntSeconds=20&holdAt=240`);
    await startHunt(page, isTouchProject(info));
    await settled(page, 240);
    save(`v14-namibie-pan-${day}`, info, await page.screenshot());
  }
});

test('Namibië: a camelthorn close up, and the camelthorn with its family nest', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  // Monday opens at the middle of the pan: the mature camelthorn on the mid plane.
  await boot(page, `biome=namibie&today=${DAYS.mon}&seed=42&huntSeconds=20&holdAt=240`);
  await startHunt(page, isTouchProject(info));
  await settled(page, 240);
  save('v14-namibie-camelthorn', info, await shotOf(page, 0.3, 0.3, 0.4, 0.42));
  // The family-nest tree at the west end (near plane).
  await heldLeft(page, info, `biome=namibie&today=${DAYS.mon}&seed=42&huntSeconds=20`, 240);
  save('v14-namibie-nest', info, await page.screenshot());
  save('v14-namibie-nest-closeup', info, await shotOf(page, 0, 0.05, 0.55, 0.6));
});

test('Namibië: the angry weavers bursting out of the family nest', async ({ page }, info) => {
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await boot(page, `biome=namibie&today=${DAYS.mon}&seed=42&huntSeconds=60`);
  await startHunt(page, touch);
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30, null, { timeout: 120_000 });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      return g !== undefined && g.cameraX > 0 && g.cameraX <= 961;
    },
    null,
    { timeout: 300_000 },
  );
  await page.keyboard.up('ArrowLeft');
  const h = await hook(page);
  const nest = h.secretSpots.find((p) => p.partId === 'nest');
  if (nest === undefined) throw new Error('no nest on screen');
  await tapAt(page, touch, nest.x, nest.y);
  await page.waitForFunction(() => (window.__TM__?.weavers ?? 0) >= 8, null, { timeout: 60_000 });
  save('v14-namibie-weavers', info, await page.screenshot());
  save('v14-namibie-weavers-closeup', info, await shotOf(page, 0, 0.05, 0.55, 0.6));
});

test('Namibië: the waterhole flock through the Langloop scope', async ({ page }, info) => {
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await rifleSave(page);
  await boot(page, `biome=namibie&today=${DAYS.mon}&seed=42&huntSeconds=60`);
  await startHunt(page, touch);
  await page.waitForFunction(
    () => (window.__TM__?.flockSpots ?? []).some((f) => f.plane === 'ver'),
    null,
    { timeout: 120_000 },
  );
  const h = await hook(page);
  const f = h.flockSpots.find((x) => x.plane === 'ver');
  if (f === undefined) throw new Error('no Ver flock');
  const x = Math.min(h.designWidth - 400, Math.max(400, f.x));
  await page.evaluate(
    ([dx, dy, t]) => {
      const canvas = document.querySelector('#game canvas');
      const g = window.__TM__;
      if (!(canvas instanceof HTMLCanvasElement) || !g) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: t ? 41 : 1,
          pointerType: t ? 'touch' : 'mouse',
          button: 0,
          buttons: 1,
          clientX: r.left + (dx / g.designWidth) * r.width,
          clientY: r.top + (dy / g.designHeight) * r.height,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [x, f.y - 2, touch] as const,
  );
  await page.waitForFunction(
    () => {
      const z = window.__TM__?.zoom;
      return z !== undefined && z.raise >= 1;
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1200);
  save('v14-namibie-scope', info, await page.screenshot());
});

test('Namibië: the locked area card', async ({ page }, info) => {
  test.setTimeout(300_000);
  await boot(page, `today=${DAYS.mon}`);
  await page.waitForFunction(() => window.__TM__?.rects['area'] !== undefined, null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  save('v14-namibie-title', info, await page.screenshot());
  await tapRect(page, isTouchProject(info), 'area');
  await page.waitForFunction(() => window.__TM__?.menu === 'area', null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  save('v14-namibie-locked', info, await page.screenshot());
});

test('Namibië: the Kalahari with the new camelthorn and nest, before | after', async ({
  page,
}, info) => {
  test.skip(
    BEFORE_DIR === '' || !existsSync(join(BEFORE_DIR, 'asset-index.json')),
    'needs BEFORE_DIR',
  );
  test.setTimeout(900_000);
  mkdirSync(RAW, { recursive: true });
  for (const v of ['before', 'after'] as const) {
    await page.unroute('**/assets/**');
    if (v === 'before')
      await page.route('**/assets/**', async (route) => {
        const url = new URL(route.request().url());
        const rel = url.pathname.replace(/^.*?\/assets\//, 'assets/');
        const file =
          rel === 'assets/asset-index.json'
            ? join(BEFORE_DIR, 'asset-index.json')
            : join(BEFORE_DIR, rel);
        if (existsSync(file)) await route.fulfill({ body: readFileSync(file) });
        else await route.continue();
      });
    await heldLeft(page, info, 'seed=42&huntSeconds=20&biome=kalahari-summer', 240);
    writeFileSync(
      join(RAW, `v14-namibie-kalahari-${v}-${info.project.name}.png`),
      await page.screenshot(),
    );
  }
  composePair('v14-namibie-kalahari', info.project.name);
});
