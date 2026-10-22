// D-031 graphics pass 2 previews (on demand, not part of the regular suite): the same hunt frames
// before (main's art: pass 1 birds and guns, runtime-drawn scenery, FX and UI) and after (this
// pass's interim art), composed side by side into docs/art-preview/compare/gfx2-*.png. Run:
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-gfx2.spec.ts \
//     --project=desktop-chromium --project=pixel7-landscape
// "Before" serves the asset index with this pass's keys taken out (every layer, the flyers, every
// image except the guns and the Generaal's pot). Scenes are held at a fixed sim tick (?holdAt),
// found with the headless sim; pans are made with the arrow keys before the hold.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { composePair } from '../../tools/art/compare';
import { boot, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview');
const RAW = join(OUT, 'screens');
const PROFILES = ['desktop-chromium', 'pixel7-landscape'];
const VARIANTS = ['before', 'after'] as const;
type Variant = (typeof VARIANTS)[number];
const FLYERS = ['hadeda', 'sproeier', 'kwevoel', 'visarend', 'stormvoel'];

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(info.project.name), 'previews: desktop + Pixel 7 landscape');
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

/** Before = main's art: this pass's keys removed from the asset index. */
async function setVariant(page: Page, v: Variant): Promise<void> {
  await page.unroute('**/assets/asset-index.json');
  if (v === 'after') return;
  await page.route('**/assets/asset-index.json', async (route) => {
    const res = await route.fetch();
    const index = (await res.json()) as {
      images: Record<string, unknown>;
      layers: Record<string, unknown>;
      birds: Record<string, unknown>;
    };
    index.layers = {};
    index.images = Object.fromEntries(
      Object.entries(index.images).filter(([k]) => k.startsWith('gun/') || k === 'fx/pot'),
    );
    index.birds = Object.fromEntries(
      Object.entries(index.birds).filter(([k]) => !FLYERS.includes(k)),
    );
    await route.fulfill({ response: res, json: index });
  });
}

/** Fonts in, the pointer parked at the screen centre (reticle in view on desktop). */
async function settle(page: Page, aim: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) {
    if (aim) await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    else await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2);
  }
  await page.waitForTimeout(800);
}

function save(name: string, v: Variant, info: TestInfo, png: Buffer): void {
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, `${name}-${v}-${info.project.name}.png`), png);
}

/**
 * A hunt held at `holdAt`; `pan` holds an arrow key from the start until the camera reaches its
 * end stop (−1 left, +1 right). `aim` shows the reticle at the centre.
 */
async function held(
  page: Page,
  info: TestInfo,
  name: string,
  query: string,
  holdAt: number,
  o: { pan?: -1 | 1; aim?: boolean; wait?: (page: Page) => Promise<void> } = {},
): Promise<void> {
  for (const v of VARIANTS) {
    await setVariant(page, v);
    await boot(page, `${query}&holdAt=${holdAt}`);
    await startHunt(page, isTouchProject(info));
    if (o.pan !== undefined) {
      const key = o.pan < 0 ? 'ArrowLeft' : 'ArrowRight';
      const start = (await page.evaluate(() => window.__TM__?.cameraX)) ?? 0;
      await page.keyboard.down(key);
      await page.waitForFunction(
        ([s, d]) => {
          const x = window.__TM__?.cameraX ?? s;
          return d < 0 ? x <= 961 : x >= 4159;
        },
        [start, o.pan] as const,
        { timeout: 300_000 },
      );
      await page.keyboard.up(key);
    }
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, holdAt, {
      timeout: 300_000,
    });
    if (o.wait !== undefined) await o.wait(page);
    await settle(page, o.aim === true);
    save(name, v, info, await page.screenshot());
  }
  composePair(name, info.project.name);
}

test('Karoo panned left, centre and right', async ({ page }, info) => {
  test.setTimeout(900_000);
  await held(page, info, 'gfx2-karoo-left', 'seed=42&huntSeconds=20', 300, { pan: -1 });
  await held(page, info, 'gfx2-karoo-centre', 'seed=42&huntSeconds=20', 70);
  await held(page, info, 'gfx2-karoo-right', 'seed=42&huntSeconds=20', 300, { pan: 1 });
});

test('hadeda, crop-sprayer and kwevoel fly over', async ({ page }, info) => {
  test.setTimeout(600_000);
  await held(page, info, 'gfx2-flyover', 'seed=42&huntSeconds=20', 960);
});

test('a crate drop, the reticle and the shell belt', async ({ page }, info) => {
  test.setTimeout(600_000);
  await held(page, info, 'gfx2-crate-hud', 'seed=42&huntSeconds=20', 430, { aim: true });
});

// Part B: one hunt view per other biome (lazy-loaded art), held after the first flock settles.
for (const biome of ['bushveld-winter', 'kalahari-summer', 'okavango-spring']) {
  test(`hunt view: ${biome}`, async ({ page }, info) => {
    test.setTimeout(600_000);
    const short = biome.split('-')[0] ?? biome;
    await held(page, info, `gfx2-${short}`, `seed=42&huntSeconds=20&biome=${biome}`, 240, {
      wait: async (p) => {
        // The biome's art loads on first use: wait until its layers are in (after only).
        await p.waitForTimeout(1500);
      },
    });
  });
}

// GPU texture memory (D-029 method): low tier, end of a 20 s Karoo hunt, every texture incl.
// placeholders and layers (test hook `textureBytes`), before and after, once the late group is in.
test('texture memory on the low tier', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'measured on the Pixel 7 profile');
  test.setTimeout(600_000);
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
  const out: Record<string, number> = {};
  for (const v of VARIANTS) {
    await setVariant(page, v);
    await boot(page, 'seed=42&huntSeconds=20&holdAt=1140');
    await startHunt(page, true);
    await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 1140, null, {
      timeout: 400_000,
    });
    await page.waitForTimeout(3000);
    const h = await page.evaluate(() => ({
      bytes: window.__TM__?.textureBytes ?? 0,
      tier: window.__TM__?.quality.tier ?? '',
    }));
    out[`${v} (${h.tier})`] = Math.round((h.bytes / 1024 / 1024) * 10) / 10;
  }
  mkdirSync(join(OUT, 'compare'), { recursive: true });
  writeFileSync(
    join(OUT, 'compare', 'gfx2-texture-memory.json'),
    `${JSON.stringify({ unit: 'MB', ...out }, null, 2)}\n`,
  );
});

// Per biome: a hunt in each biome started from the title (which installs the home biome first),
// low tier, after the late group settles. Catches textures kept from an earlier biome.
test('texture memory per biome on the low tier', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel7-landscape', 'measured on the Pixel 7 profile');
  test.setTimeout(900_000);
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
  const out: Record<string, number> = {};
  for (const biome of ['karoo-autumn', 'bushveld-winter', 'kalahari-summer', 'okavango-spring']) {
    await setVariant(page, 'after');
    await boot(page, `seed=42&huntSeconds=20&holdAt=600&biome=${biome}`);
    await startHunt(page, true);
    await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 600, null, {
      timeout: 400_000,
    });
    await page.waitForTimeout(3000);
    const bytes = await page.evaluate(() => window.__TM__?.textureBytes ?? 0);
    out[biome] = Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
  mkdirSync(join(OUT, 'compare'), { recursive: true });
  writeFileSync(
    join(OUT, 'compare', 'gfx2-texture-memory-biomes.json'),
    `${JSON.stringify({ unit: 'MB', tier: 'low', ...out }, null, 2)}\n`,
  );
});
