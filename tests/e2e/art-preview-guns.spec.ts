// v1.19 (D-084) the Gun Shed, the guns, the meerkats and the two special shells — previews on
// demand (not part of the regular suite; playwright.config.ts ignores art-preview specs unless
// ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-guns.spec.ts --project=desktop-chromium
// Writes docs/art-preview/compare/v119-guns-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   shed: the Gun Shed's Guns tab with every gun's side view (all unlocked but two; phones too);
//   fp-guns: each gun's first-person idle frame in a hunt, side by side (__TM_GUN__ loop);
//   hud-shell: the HUD with the Dragon's Breath chip (its shell icon and the shells left);
//   dragon: a Dragon's Breath shot mid-flame (?coneHold=1 keeps the cone on screen);
//   meerkats, meerkats-std-hd: a Kalahari colony close-up (Monday opens with both colonies on
//     screen), Standard | HD at the same held tick and rect (desktop);
//   slug, slug-2x: a Slug shot at a far bird, the sim held right after it lands.
// Boots: desktop 4 (shed; the Karoo hunt; the Kalahari Standard; the Kalahari HD), phones 3. Every
// grab holds the sim (?holdAt or __TM_HOLD_AT__); far herds are still (?faunaIdle=0); on desktop
// the mouse rests at the bottom centre. A missing shot fails the test (bounded attempts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { isTouchProject, startHunt, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const GUNS = [
  'dubbelloop',
  'windbuks',
  'kettie',
  'pomp',
  'twee_twee',
  'langloop',
  'voorlaaier',
  'mielie_masjien',
];
/** The Kalahari colony grab: held at this tick on both boots (Standard, HD). */
const COLONY_TICK = 200;
const COLONY_RECT = join(OUT, 'v119-guns-meerkats-crop.json');
/** The Standard boot's close-up at full size (the HD boot puts it beside its own). */
const COLONY_STD = join(OUT, 'v119-guns-meerkats-std-crop.png');

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(1_500_000);
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'dubbelloop', sights: {} },
        // Every gun unlocked but the Kettie and the Langloop (they show the locked grey picture).
        unlocks: { weapons: ['windbuks', 'pomp', 'twee_twee'], sights: [] },
        bestRank: 'bosveldjagter',
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
      }),
    );
  }, SAVE);
});

const desktopOnly = (info: TestInfo): void => {
  test.skip(device(info.project.name) !== 'desktop-chromium', 'desktop only (short on phones)');
};

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `v119-guns-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

function scaled(src: Rgba, n: number): Rgba {
  const out = blank(src.width * n, src.height * n);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / n) * src.width + Math.floor(x / n)) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  return out;
}

function row(images: readonly Rgba[], gap = 12): Rgba {
  const w = images.reduce((t, i) => t + i.width + gap, -gap);
  const h = Math.max(...images.map((i) => i.height));
  const out = blank(Math.max(1, w), Math.max(1, h));
  out.data.fill(255);
  let left = 0;
  for (const src of images) {
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + left + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
    left += src.width + gap;
  }
  return out;
}

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

async function bootTitle(page: Page, q: string): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&faunaIdle=0&reenbui=0&brakkie=0&cameos=0&${q}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['shed'] !== undefined, null, {
    timeout: 300_000,
  });
}

async function grab(page: Page): Promise<Rgba> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  return decodePng(await page.locator('#game canvas').screenshot());
}

/** Design px → canvas px factor of a grab. */
async function scaleOf(page: Page, shot: Rgba): Promise<number> {
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  return shot.width / w;
}

/** Holds the sim at the next tick (a page-set hold replaces the URL's). */
async function holdNow(page: Page, extra = 1): Promise<number> {
  return page.evaluate((n) => {
    const t = (window.__TM__?.tick ?? 0) + n;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  }, extra);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(1e9);
  });
}

/** Taps the first crate from inside the page until `id` is loaded (bounded tries; a shotgun). */
async function pickUp(page: Page, touch: boolean, id: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const got = await page.evaluate(
      ([isTouch, want, k]) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) return false;
        if (h.powerups.includes(want)) return true;
        const spot = h.crateSpots[0];
        if (spot === undefined || spot.x < 0 || spot.x > h.designWidth) return false;
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (spot.x / h.designWidth) * r.width,
          clientY: r.top + (spot.y / h.designHeight) * r.height,
          pointerId: 2000 + k,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        return false;
      },
      [touch, id, i] as const,
    );
    if (got) return;
    const t = await page.evaluate(() => window.__TM__?.tick ?? 0);
    await page.waitForFunction((t0) => (window.__TM__?.tick ?? 0) >= t0 + 20, t, {
      timeout: 120_000,
    });
  }
  throw new Error(`the crate never gave ${id}`);
}

test('the Gun Shed: every gun as a side view', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await bootTitle(page, 'seed=42&graphics=standard');
  await tapRect(page, touch, 'shed');
  await page.waitForFunction(
    () => {
      const p = window.__TM__?.shedPictures ?? [];
      return p.length >= 6 && p.every((x) => x.source === 'side');
    },
    null,
    { timeout: 300_000 },
  );
  await park(page, touch);
  save('shed', info, await grab(page));
});

test('the Karoo hunt: the guns in first person, the shell chip, Dragon’s Breath mid-flame', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await bootTitle(
    page,
    'seed=7&huntSeconds=120&layout=none&baboons=0&graphics=standard&crate=dragon_breath&coneHold=1',
  );
  await startHunt(page, touch);
  // Every gun's atlas is in (the late and Ver groups) before the loop.
  await page.waitForFunction(() => window.__TM__?.assets.lateDone['karoo-autumn'] === true, null, {
    timeout: 600_000,
  });
  await pickUp(page, touch, 'dragon_breath');
  await page.waitForFunction(() => window.__TM__?.shellFx !== undefined, null, {
    timeout: 120_000,
  });
  await holdNow(page);
  await park(page, touch);
  // The HUD with the shell chip.
  await page.waitForFunction(
    () => window.__TM__?.chips?.some((c) => c.id === 'dragon_breath' && c.icon !== null) === true,
    null,
    { timeout: 120_000 },
  );
  save('hud-shell', info, await grab(page));
  // Each gun in first person (desktop: all eight side by side; phones skip the loop).
  if (device(info.project.name) === 'desktop-chromium') {
    const crops: Rgba[] = [];
    for (const id of GUNS) {
      await page.evaluate((g) => {
        (window as { __TM_GUN__?: (id: string, clip: string | null) => void }).__TM_GUN__?.(
          g,
          'idle',
        );
      }, id);
      await page.waitForTimeout(600);
      const shot = await grab(page);
      const k = await scaleOf(page, shot);
      const r = await page.evaluate(() => window.__TM__?.gunRect ?? null);
      expect(r, `${id}: the gun on screen`).not.toBeNull();
      if (r === null) continue;
      const x0 = Math.max(0, Math.round((r.x - 20) * k));
      const y0 = Math.max(0, Math.round((r.y - 20) * k));
      crops.push(
        crop(
          shot,
          x0,
          y0,
          Math.min(shot.width - x0, Math.round((r.w + 40) * k)),
          Math.min(shot.height - y0, Math.round((r.h + 40) * k)),
        ),
      );
    }
    expect(crops).toHaveLength(GUNS.length);
    save('fp-guns', info, row(crops));
    await page.evaluate(() => {
      (window as { __TM_GUN__?: (id: string, clip: string | null) => void }).__TM_GUN__?.(
        'dubbelloop',
        null,
      );
    });
  }
  // A Dragon's Breath shot at the mid ground; the cone stays (?coneHold=1), the sim is held.
  await release(page);
  const fired = await page.evaluate((isTouch) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    const h = window.__TM__;
    if (!canvas || !h) return false;
    const r = canvas.getBoundingClientRect();
    const init: PointerEventInit = {
      clientX: r.left + r.width * 0.42,
      clientY: r.top + r.height * 0.55,
      pointerId: 2500,
      pointerType: isTouch ? 'touch' : 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      bubbles: true,
      cancelable: true,
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    return true;
  }, touch);
  expect(fired).toBe(true);
  await page.waitForFunction(() => window.__TM__?.shellFx?.live !== null, null, {
    timeout: 60_000,
  });
  await holdNow(page, 2);
  await park(page, touch);
  const live = await page.evaluate(() => window.__TM__?.shellFx?.live ?? null);
  expect(live, 'a cone on screen').not.toBeNull();
  save('dragon', info, await grab(page));
});

/** The Kalahari's Monday (both colonies on screen), held at COLONY_TICK. */
async function kalahari(page: Page, info: TestInfo, gfx: 'standard' | 'hd'): Promise<Rgba> {
  const touch = isTouchProject(info);
  await bootTitle(
    page,
    `biome=kalahari-summer&layout=mon&seed=42&huntSeconds=120&baboons=0&graphics=${gfx}&holdAt=${COLONY_TICK}&crate=slug`,
  );
  await startHunt(page, touch);
  await page.waitForFunction(
    (t) => (window.__TM__?.tick ?? 0) >= t && (window.__TM__?.meerkats.length ?? 0) > 0,
    COLONY_TICK,
    { timeout: 600_000 },
  );
  await park(page, touch);
  return grab(page);
}

/** The colony close-up rect (canvas px): round the meerkats nearest the centre. */
async function colonyRect(
  page: Page,
  shot: Rgba,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const k = await scaleOf(page, shot);
  const m = await page.evaluate(() => window.__TM__?.meerkats ?? []);
  const on = m.filter((x) => x.x > 100 && x.x < 1820);
  expect(on.length, 'meerkats on screen').toBeGreaterThan(0);
  const near = on.filter((x) => x.y > 900);
  const pick = near.length > 0 ? near : on;
  const cx = pick.reduce((t, x) => t + x.x, 0) / pick.length;
  const ground = Math.max(...pick.map((x) => x.y));
  const half = 260;
  const x0 = Math.max(0, Math.round((cx - half) * k));
  const y0 = Math.max(0, Math.round((ground - 230) * k));
  return {
    x: x0,
    y: y0,
    w: Math.min(shot.width - x0, Math.round(2 * half * k)),
    h: Math.min(shot.height - y0, Math.round(280 * k)),
  };
}

test('the Kalahari: the meerkat colony close-up, a Slug at a far bird', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const shot = await kalahari(page, info, 'standard');
  save('meerkats', info, shot);
  const rect = await colonyRect(page, shot);
  const close = crop(shot, rect.x, rect.y, rect.w, rect.h);
  save('meerkats-closeup', info, scaled(close, 2));
  if (device(info.project.name) === 'desktop-chromium') {
    writeFileSync(COLONY_RECT, JSON.stringify(rect));
    writeFileSync(COLONY_STD, encodePng8(close));
  }
  // The Slug: pick it up from the first crate, then fire at a far bird in the middle of the view
  // and hold the sim two ticks after (the hit's puff on the far plane).
  await release(page);
  await pickUp(page, touch, 'slug');
  let hit = false;
  for (let k = 0; k < 8 && !hit; k++) {
    const t = await page.waitForFunction(
      () => {
        const g = window.__TM__;
        return g !== undefined &&
          !g.reloading &&
          g.farBirds.some((b) => b.x > g.designWidth * 0.2 && b.x < g.designWidth * 0.8)
          ? g.score
          : null;
      },
      null,
      { timeout: 300_000 },
    );
    const before = (await t.jsonValue()) as number;
    const at = await page.evaluate(
      ([isTouch, pid]) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const g = window.__TM__;
        if (!canvas || !g) return null;
        const b = g.farBirds.find((x) => x.x > g.designWidth * 0.2 && x.x < g.designWidth * 0.8);
        if (b === undefined) return null;
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (b.x / g.designWidth) * r.width,
          clientY: r.top + (b.y / g.designHeight) * r.height,
          pointerId: pid,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(g.tick + 3);
        return { x: b.x, y: b.y };
      },
      [touch, 2600 + k] as const,
    );
    if (at === null) continue;
    await page.waitForTimeout(1500);
    hit = (await page.evaluate(() => window.__TM__?.score ?? 0)) > before;
    if (hit) {
      await park(page, touch);
      const s = await grab(page);
      save('slug', info, s);
      const kk = await scaleOf(page, s);
      const x0 = Math.max(0, Math.round((at.x - 200) * kk));
      const y0 = Math.max(0, Math.round((at.y - 120) * kk));
      save(
        'slug-2x',
        info,
        scaled(
          crop(s, x0, y0, Math.min(s.width - x0, 400 * kk), Math.min(s.height - y0, 240 * kk)),
          2,
        ),
      );
    } else await release(page);
  }
  expect(hit, 'a Slug bagged a far bird').toBe(true);
});

test('the Kalahari colony in HD (Standard | HD)', async ({ page }, info) => {
  desktopOnly(info);
  expect(existsSync(COLONY_RECT), 'run the Standard Kalahari test first').toBe(true);
  const rect = JSON.parse(readFileSync(COLONY_RECT, 'utf8')) as {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  const shot = await kalahari(page, info, 'hd');
  await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
    timeout: 300_000,
  });
  expect(existsSync(COLONY_STD), 'the Standard close-up').toBe(true);
  const std = decodePng(readFileSync(COLONY_STD));
  save(
    'meerkats-std-hd',
    info,
    row([scaled(std, 2), scaled(crop(shot, rect.x, rect.y, rect.w, rect.h), 2)]),
  );
});
