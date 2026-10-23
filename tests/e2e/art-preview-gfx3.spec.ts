// D-035 graphics pass 3 previews (on demand, not part of the regular suite). Each run records one
// variant of the same hunt frames: GFX3_VARIANT=before on the commit before the pass, =after on
// the pass. When both exist, the pair is composed into docs/art-preview/compare/gfx3-*.png.
//   ART_PREVIEW=1 GFX3_VARIANT=after npx playwright test tests/e2e/art-preview-gfx3.spec.ts \
//     --project=desktop-chromium --project=pixel7-landscape
// Frames are held at a fixed sim tick (?holdAt) on seed 42; pans hold an arrow key until the
// camera reaches a target. Close-ups are crops of the same frame, scaled up 2×.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import { composePair } from '../../tools/art/compare';
import { boot, isTouchProject, startHunt, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview');
const RAW = join(OUT, 'screens');
const PROFILES = ['desktop-chromium', 'pixel7-landscape'];
/** UI screens are also checked on iPhone 14 landscape (CLAUDE.md); WebKit, or its local stand-in. */
const UI_PROFILES = [...PROFILES, 'iphone14-landscape', 'iphone14-landscape-chromium-fallback'];
const VARIANT = process.env['GFX3_VARIANT'] === 'before' ? 'before' : 'after';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  const ui = info.title.startsWith('the Skiet-Skuur');
  test.skip(
    !(ui ? UI_PROFILES : PROFILES).includes(info.project.name),
    'previews: desktop + Pixel 7 landscape (UI: + iPhone 14 landscape)',
  );
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'medium' },
          ftue: { done: true, skipped: false, step: '' },
        }),
      );
  });
});

async function settle(page: Page, aim: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) {
    if (aim) await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    else await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
  }
  await page.waitForTimeout(800);
}

function write(name: string, info: TestInfo, png: Buffer): void {
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, `${name}-${VARIANT}-${info.project.name}.png`), png);
  composePair(name, info.project.name);
}

/** A crop of a screenshot (fractions of its size), scaled up 2× (nearest neighbour). */
function crop(png: Buffer, fx: number, fy: number, fw: number, fh: number): Buffer {
  const src = PNG.sync.read(png);
  const x0 = Math.round(src.width * fx);
  const y0 = Math.round(src.height * fy);
  const w = Math.round(src.width * fw);
  const h = Math.round(src.height * fh);
  const out = new PNG({ width: w * 2, height: h * 2 });
  for (let y = 0; y < h * 2; y++)
    for (let x = 0; x < w * 2; x++) {
      const si = ((y0 + (y >> 1)) * src.width + x0 + (x >> 1)) * 4;
      const di = (y * w * 2 + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  return PNG.sync.write(out);
}

/** Boots a held hunt; `panTo` holds an arrow key until cameraX passes it (camera centre px). */
async function hunt(
  page: Page,
  info: TestInfo,
  query: string,
  holdAt: number,
  panTo?: number,
): Promise<void> {
  await boot(page, `seed=42&huntSeconds=20&${query}&holdAt=${holdAt}`);
  await startHunt(page, isTouchProject(info));
  if (panTo !== undefined) {
    const start = (await page.evaluate(() => window.__TM__?.cameraX)) ?? 0;
    const key = panTo < start ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    await page.waitForFunction(
      ([s, t]) => {
        const x = window.__TM__?.cameraX ?? s;
        return t < s ? x <= t : x >= t;
      },
      [start, panTo] as const,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
  }
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, holdAt, {
    timeout: 300_000,
  });
}

test('Karoo: farmhouse, mountains, bakkie, birds', async ({ page }, info) => {
  test.setTimeout(900_000);
  // Centre: flocks near/mid/far, the mesas.
  await hunt(page, info, 'layout=none', 70);
  await settle(page, false);
  const centre = await page.screenshot();
  write('gfx3-karoo-centre', info, centre);
  write('gfx3-tarentaal-mid', info, crop(centre, 0.38, 0.5, 0.3, 0.3));
  write('gfx3-tarentaal-near', info, crop(centre, 0.22, 0.56, 0.24, 0.44));
  write('gfx3-tarentaal-far', info, crop(centre, 0.6, 0.44, 0.22, 0.16));
  // Right: the farmhouse on the far veld and the bakkie.
  await hunt(page, info, 'layout=none', 300, 4159);
  await settle(page, false);
  const right = await page.screenshot();
  write('gfx3-karoo-right', info, right);
  write('gfx3-farmhouse', info, crop(right, 0.2, 0.36, 0.5, 0.2));
  write('gfx3-bakkie', info, crop(right, 0.42, 0.44, 0.34, 0.3));
  write('gfx3-mountains-karoo', info, crop(right, 0, 0.3, 1, 0.24));
});

for (const biome of ['bushveld-winter', 'kalahari-summer', 'okavango-spring']) {
  test(`mountains: ${biome}`, async ({ page }, info) => {
    test.setTimeout(600_000);
    const short = biome.split('-')[0] ?? biome;
    await hunt(page, info, `layout=none&biome=${biome}`, 240);
    await page.waitForTimeout(1500);
    await settle(page, false);
    const shot = await page.screenshot();
    write(`gfx3-${short}-centre`, info, shot);
    write(`gfx3-mountains-${short}`, info, crop(shot, 0, 0.28, 1, 0.26));
  });
}

test('fly-overs (hadeda, crop-sprayer, kwevoel)', async ({ page }, info) => {
  test.setTimeout(600_000);
  await hunt(page, info, 'layout=none', 960);
  await settle(page, false);
  write('gfx3-flyover', info, await page.screenshot());
});

const GUNS = ['dubbelloop', 'windbuks', 'kettie', 'pomp', 'voorlaaier', 'mielie_masjien'];

test('every gun in the hand and in the HUD', async ({ page }, info) => {
  test.setTimeout(600_000);
  type Pose = (id: string, clip: string | null, frame?: number) => void;
  await hunt(page, info, 'layout=none', 30);
  await settle(page, true);
  await page.waitForFunction(
    () =>
      (window.__TM__?.assets.byBiome['karoo-autumn'] ?? []).filter(
        (e) => e.key.startsWith('gun/') && e.status === 'interim',
      ).length >= 6,
    null,
    { timeout: 60_000 },
  );
  for (const id of GUNS) {
    await page.evaluate((g) => {
      (window as unknown as { __TM_GUN__?: Pose }).__TM_GUN__?.(g, 'idle', 0);
    }, id);
    await page.waitForTimeout(300);
    const shot = await page.screenshot();
    write(`gfx3-gun-${id}`, info, crop(shot, 0.3, 0.4, 0.7, 0.6));
  }
});

test('the Skiet-Skuur (gun icons)', async ({ page }, info) => {
  test.setTimeout(300_000);
  await boot(page, 'seed=42');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
  // Opened straight away: the guns other than the Dubbelloop arrive with the late group (D-029)
  // while the shed is open, and the Guns tab must pick their pictures up (D-035 review).
  await tapRect(page, isTouchProject(info), 'shed');
  await page.waitForFunction(() => window.__TM__?.menu?.startsWith('shed') === true, null, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => (window.__TM__?.shedIcons ?? []).length >= 4, null, {
    timeout: 90_000,
  });
  await settle(page, false);
  write('gfx3-shed', info, await page.screenshot());
});

// D-035 review: the shed's gun icons are small canvases cropped from the decoded atlas pages; no
// gun atlas goes to the GPU for them. Low tier (Pixel 7): texture memory at the end of a Karoo
// hunt, then with the Skiet-Skuur open on the title after it (the shed must stay < 128 MB).
test('texture memory: the Skiet-Skuur open after a hunt (low tier)', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'measured on the Pixel 7 profile');
  test.setTimeout(400_000);
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      settings?: Record<string, unknown>;
    };
    localStorage.setItem(
      key,
      JSON.stringify({ ...save, settings: { ...save.settings, quality: 'low' } }),
    );
  });
  await boot(page, 'seed=42&huntSeconds=6&layout=none');
  await startHunt(page, true);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  const mb = async (): Promise<number> =>
    Math.round(((await page.evaluate(() => window.__TM__?.textureBytes ?? 0)) / 1024 / 1024) * 10) /
    10;
  const hunt = await mb();
  await tapRect(page, true, 'menu');
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, true, 'shed');
  await page.waitForFunction(() => (window.__TM__?.shedIcons ?? []).length >= 4, null, {
    timeout: 90_000,
  });
  await page.waitForTimeout(500);
  const shed = await mb();
  mkdirSync(join(OUT, 'compare'), { recursive: true });
  writeFileSync(
    join(OUT, 'compare', 'gfx3-texture-memory-shed.json'),
    `${JSON.stringify({ unit: 'MB', tier: 'low', huntEnd: hunt, shedOpenAfterHunt: shed }, null, 2)}\n`,
  );
  expect(shed).toBeLessThan(128);
});
