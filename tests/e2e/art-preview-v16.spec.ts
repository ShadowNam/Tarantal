// v1.6 veld art pass (D-042) previews, on demand (not part of the regular suite). Look notes
// (25 Oct) add the sky and far view per biome and close-ups (CLOSEUPS: windpomp calm and windy,
// the Kalahari windpomp and dead tree, the dassie and the giraffes, with 3× crops). For every biome:
// the hunt's centre view, a close-up of its main tree (and its fruit), a strip of the far plane
// (its animals) scaled 2×, and the far animals through the Langloop's variable scope in the
// Skietbaan. Each run records one variant: V16_VARIANT=before on main, =after on the pass. Run one
// profile at a time:
//   ART_PREVIEW=1 V16_VARIANT=before npx playwright test tests/e2e/art-preview-v16.spec.ts \
//     --project=desktop-chromium
// Writes docs/art-preview/compare/v16-veld-<biome>-<view>-<variant>-<device>.png (palette PNG,
// ≤ 1600 px wide), and v16-veld-<biome>-<view>-<device>.png (before | after side by side) once
// both variants are there. Frames are held at a sim tick (?holdAt) on seed 42 with no weekday
// layout. On desktop the real mouse never rests in the edge-pan bands (outer 12 %): it is parked
// at the bottom centre, and the camera is checked before every aimed shot.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  blank,
  blit,
  crop,
  decodePng,
  encodePng8,
  resize,
  type Rgba,
} from '../../tools/assets/image';
import { loadContent } from '../../tools/testContent';
import { boot, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const VARIANT = process.env['V16_VARIANT'] === 'before' ? 'before' : 'after';
const HOLD = 600;

/**
 * v1.6 look notes (25 Oct): close-ups of single things, each a hunt panned to put a layer point
 * mid-screen: [name, biome, extra query, layer, u, crop half-width, crop y0, y1, 3× crop?].
 * The 3× crop is a small box round (dx, dy) from the point, scaled up 3× (nearest).
 */
const CLOSEUPS = [
  ['karoo-windpomp-calm', 'karoo-autumn', 'omen=0', 'mid', 0.22, 300, 150, 800, null],
  ['karoo-windpomp-windy', 'karoo-autumn', 'omen=1', 'mid', 0.22, 300, 150, 800, null],
  ['kalahari-windpomp', 'kalahari-summer', 'omen=0', 'mid', 0.46, 260, 300, 800, null],
  ['kalahari-deadtree', 'kalahari-summer', 'omen=0', 'mid', 0.74, 300, 200, 800, null],
  [
    'bushveld-dassie',
    'bushveld-winter',
    'omen=0',
    'mid',
    0.62,
    320,
    420,
    800,
    [40, -82 + 660, 110, 70],
  ],
  [
    'bushveld-giraffes',
    'bushveld-winter',
    'omen=0',
    'far_veld',
    0.19,
    260,
    470,
    640,
    [0, 545, 120, 50],
  ],
] as const;
const CONTENT = loadContent();

/** Core width of a layer (art bible §4.1): 1920 + 3200 × its scroll factor. */
function layerOf(biome: string, id: string): { sf: number; core: number } {
  const b = CONTENT.biomes.find((x) => x.id === biome);
  const l = b?.layers.find((x) => x.id === id);
  if (l === undefined) throw new Error(`no layer ${biome}/${id}`);
  return { sf: l.scrollFactor, core: 1920 + 3200 * l.scrollFactor };
}

/** Camera centre (near px) that puts plane point u of a layer at the screen centre. */
function cameraFor(biome: string, layer: string, u: number): number {
  const { sf, core } = layerOf(biome, layer);
  return Math.min(4160, Math.max(960, (u * core - 960) / sf + 960));
}

/** Design-px dx from the screen centre of plane point u on a layer, for camera centre cx. */
function dxOf(biome: string, layer: string, u: number, cx: number): number {
  const { sf, core } = layerOf(biome, layer);
  return u * core - ((cx - 960) * sf + 960);
}

/**
 * Per biome: the main tree for the close-up (v1.6: the baobab, sausage tree and weaver camelthorn
 * crops start higher, so their crowns are not cut; their "before" close-ups need a re-run) (a layer point and the design-y band it spans), and
 * the far animals the scope looks at (a layer point and the design y of their bodies). The new
 * art keeps its animals on these points, so before and after look at the same place.
 */
const BIOMES = [
  {
    id: 'karoo-autumn',
    tree: { layer: 'mid', u: 0.4, y0: 430, y1: 960 },
    far: [
      { layer: 'far_veld', u: 0.5, y: 576 },
      { layer: 'far_veld', u: 0.62, y: 578 },
    ],
  },
  {
    id: 'bushveld-winter',
    tree: { layer: 'mid', u: 0.3, y0: 100, y1: 960 },
    far: [
      { layer: 'far_veld', u: 0.71, y: 562 },
      { layer: 'far_veld', u: 0.5, y: 572 },
    ],
  },
  {
    id: 'okavango-spring',
    tree: { layer: 'mid', u: 0.47, y0: 100, y1: 960 },
    far: [
      { layer: 'far_veld', u: 0.5, y: 576 },
      { layer: 'far_veld', u: 0.62, y: 578 },
    ],
  },
  {
    id: 'kalahari-summer',
    tree: { layer: 'mid', u: 0.2, y0: 160, y1: 960 },
    far: [
      { layer: 'far_veld', u: 0.5, y: 576 },
      { layer: 'far_ridge', u: 0.43, y: 520 },
    ],
  },
  {
    id: 'namibie',
    tree: { layer: 'mid', u: 0.68, y0: 430, y1: 960 },
    far: [
      { layer: 'ver_veld', u: 0.5, y: 558 },
      { layer: 'far_veld', u: 0.62, y: 578 },
    ],
  },
] as const;

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test is small, but gets 10 minutes.
  test.setTimeout(600_000);
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

/** Writes one variant and, once both are there, the before | after pair. */
function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  const dev = device(info.project.name);
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `v16-veld-${name}-${VARIANT}-${dev}.png`), encodePng8(out));
  const paths = ['before', 'after'].map((v) => join(OUT, `v16-veld-${name}-${v}-${dev}.png`));
  if (!paths.every((p) => existsSync(p))) return;
  const half = 800;
  const [a, b] = paths.map((p) => {
    const i = decodePng(readFileSync(p));
    return resize(i, half, Math.round((i.height * half) / i.width));
  }) as [Rgba, Rgba];
  const pair = blank(half * 2 + 8, Math.max(a.height, b.height));
  pair.data.fill(255);
  blit(pair, a, 0, 0);
  blit(pair, b, half + 8, 0);
  writeFileSync(join(OUT, `v16-veld-${name}-${dev}.png`), encodePng8(pair));
}

/** Nearest-neighbour 2× (close-ups stay crisp). */
function twice(src: Rgba): Rgba {
  const out = blank(src.width * 2, src.height * 2);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = ((y >> 1) * src.width + (x >> 1)) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  return out;
}

/** Nearest-neighbour 3× (a small detail seen as the scope would). */
function thrice(src: Rgba): Rgba {
  const out = blank(src.width * 3, src.height * 3);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / 3) * src.width + Math.floor(x / 3)) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  return out;
}

/** A design-px box of a canvas screenshot, clamped to it. */
function cropDesign(
  img: Rgba,
  design: { w: number; h: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rgba {
  const k = img.width / design.w;
  const ky = img.height / design.h;
  const ax = Math.max(0, Math.round(x0 * k));
  const ay = Math.max(0, Math.round(y0 * ky));
  const bx = Math.min(img.width, Math.round(x1 * k));
  const by = Math.min(img.height, Math.round(y1 * ky));
  return crop(img, ax, ay, Math.max(1, bx - ax), Math.max(1, by - ay));
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

async function canvasShot(page: Page): Promise<Rgba> {
  return decodePng(await page.locator('#game canvas').screenshot());
}

async function design(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => ({
    w: window.__TM__?.designWidth ?? 1920,
    h: window.__TM__?.designHeight ?? 1080,
  }));
}

/**
 * Holds an arrow key until the camera passes `target`, or stops moving (an end stop, or the held
 * tick), all inside the page so the timing does not hang on harness round trips.
 */
async function panTo(page: Page, target: number): Promise<number> {
  const start = await page.evaluate(() => window.__TM__?.cameraX ?? 2560);
  if (Math.abs(start - target) < 2) return start;
  const key = target < start ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  await page.waitForFunction(
    ([s, t]) => {
      const w = window as unknown as { __V16_PAN__?: { x: number; at: number } };
      const x = window.__TM__?.cameraX ?? s;
      const now = performance.now();
      if (w.__V16_PAN__ === undefined || w.__V16_PAN__.x !== x) w.__V16_PAN__ = { x, at: now };
      const stuck = x !== s && now - w.__V16_PAN__.at > 3000;
      return (t < s ? x <= t : x >= t) || stuck;
    },
    [start, target] as const,
    { timeout: 300_000, polling: 100 },
  );
  await page.keyboard.up(key);
  return page.evaluate(() => window.__TM__?.cameraX ?? 2560);
}

/** Waits for the held tick and the fonts; parks the mouse; lets a few frames draw. */
async function held(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, HOLD, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

for (const b of BIOMES) {
  const short = b.id.split('-')[0] ?? b.id;

  test(`${short}: centre view and the far plane`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await boot(page, `seed=42&huntSeconds=20&biome=${b.id}&holdAt=${HOLD}`);
    await startHunt(page, touch);
    await park(page, touch);
    await held(page, touch);
    const d = await design(page);
    const shot = await canvasShot(page);
    save(`${short}-centre`, info, shot);
    // The far plane's strip (Ver, far veld, far ridge foot), middle half, 2×.
    save(`${short}-far`, info, twice(cropDesign(shot, d, d.w * 0.25, 470, d.w * 0.75, 640)));
    // v1.6 look notes (25 Oct): the sky (clouds) and the whole far view, full width.
    save(`${short}-sky`, info, cropDesign(shot, d, 0, 0, d.w, 620));
    save(`${short}-farview`, info, cropDesign(shot, d, 0, 400, d.w, 700));
  });

  test(`${short}: the main tree close up`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await boot(page, `seed=42&huntSeconds=20&biome=${b.id}&holdAt=${HOLD}`);
    await startHunt(page, touch);
    await park(page, touch);
    const cx = await panTo(page, cameraFor(b.id, b.tree.layer, b.tree.u));
    await held(page, touch);
    const d = await design(page);
    const x = d.w / 2 + dxOf(b.id, b.tree.layer, b.tree.u, cx);
    const shot = await canvasShot(page);
    save(`${short}-tree`, info, shot);
    save(
      `${short}-tree-closeup`,
      info,
      cropDesign(shot, d, x - 420, b.tree.y0, x + 420, b.tree.y1),
    );
  });

  test(`${short}: far animals through the Langloop scope (Skietbaan)`, async ({ page }, info) => {
    test.skip((process.env['E2E_PLATFORM'] || 'web') !== 'web', 'the Skietbaan is web only');
    const touch = isTouchProject(info);
    const press = async (sel: string): Promise<void> => {
      const el = page.locator(sel);
      await el.scrollIntoViewIfNeeded();
      if (touch) await el.tap();
      else await el.click();
    };
    await page.goto('/?e2e=1&admin=1');
    await page.waitForFunction(() => window.__TM__?.admin?.view === 'list', null, {
      timeout: 90_000,
    });
    await press('#tm-admin [data-action=skietbaan]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'setup', null, {
      timeout: 60_000,
    });
    await press('#tm-range [data-role=gun] [data-value="langloop:scope_var"]');
    await press(`#tm-range [data-role=biome] [data-value="${b.id}"]`);
    await press('#tm-range [data-role=plane] [data-value=ver]');
    await press('#tm-range [data-role=target] [data-value=paper]');
    await press('#tm-range [data-action=start]');
    await page.waitForFunction(() => window.__TM__?.range?.view === 'range', null, {
      timeout: 90_000,
    });
    await park(page, touch);
    await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
    await page.evaluate(() => {
      if (window.__TM__) window.__TM__.rangeHold = true;
    });
    await page.waitForTimeout(1500);
    const d = await design(page);
    save(`${short}-range`, info, await canvasShot(page));
    let n = 0;
    for (const f of b.far) {
      const cam = await page.evaluate(() => window.__TM__?.cameraX ?? NaN);
      const x = d.w / 2 + dxOf(b.id, f.layer, f.u, cam);
      // Never aim into the edge-pan bands (outer 12 %), or the camera would move.
      if (x < d.w * 0.14 || x > d.w * 0.86) continue;
      await page.evaluate(
        ([dx, dy, t]) => {
          const canvas = document.querySelector('#game canvas');
          const h = window.__TM__;
          if (!(canvas instanceof HTMLCanvasElement) || !h) throw new Error('no game');
          const r = canvas.getBoundingClientRect();
          const init = {
            pointerId: t ? 61 : 1,
            pointerType: t ? 'touch' : 'mouse',
            button: 0,
            buttons: 1,
            clientX: r.left + (dx / h.designWidth) * r.width,
            clientY: r.top + (dy / h.designHeight) * r.height,
            bubbles: true,
            cancelable: true,
          };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          (window as { __V16_PRESS__?: PointerEventInit }).__V16_PRESS__ = init;
        },
        [x, f.y, touch] as const,
      );
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
        timeout: 60_000,
      });
      // The camera must not have moved while the scope came up (the aim point would be stale).
      expect(await page.evaluate(() => window.__TM__?.cameraX ?? NaN)).toBe(cam);
      await page.waitForTimeout(1200);
      save(`${short}-scope-${n}`, info, await canvasShot(page));
      n++;
      // Let go away from the target: lift the press (the shot is fired at the paper's plane).
      await page.evaluate(() => {
        const canvas = document.querySelector('#game canvas');
        const init = (window as { __V16_PRESS__?: PointerEventInit }).__V16_PRESS__;
        if (!canvas || init === undefined) return;
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      });
      await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 1) === 0, null, {
        timeout: 60_000,
      });
      await page.waitForTimeout(1500);
    }
    expect(n, 'no far animal point was on screen').toBeGreaterThan(0);
  });
}

for (const [name, biome, query, layer, u, half, y0, y1, zoom] of CLOSEUPS) {
  test(`close-up: ${name}`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await boot(page, `seed=42&huntSeconds=20&biome=${biome}&holdAt=${HOLD}&${query}`);
    await startHunt(page, touch);
    await park(page, touch);
    const cx = await panTo(page, cameraFor(biome, layer, u));
    await held(page, touch);
    const d = await design(page);
    const x = d.w / 2 + dxOf(biome, layer, u, cx);
    const shot = await canvasShot(page);
    save(name, info, cropDesign(shot, d, x - half, y0, x + half, y1));
    if (zoom !== null) {
      const [dx, y, hw, hh] = zoom;
      save(
        `${name}-3x`,
        info,
        thrice(cropDesign(shot, d, x + dx - hw, y - hh, x + dx + hw, y + hh)),
      );
    }
  });
}
