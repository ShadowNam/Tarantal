// D-053 HD graphics previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-hd.spec.ts --project=desktop-chromium
// One profile at a time (desktop at 2560 × 1440, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/hd-<shot>-<device>.png:
//   card-hd-pick, card-standard-pick: the loading screen's Graphics card with HD and with Standard
//     pre-selected (the browser's hints are set in-page: a fast link and a sharp screen, or
//     Save-Data), the MB for the area and "Remember my choice";
//   play-now: the HD loading screen with "Play now in Standard" (the HD files held back);
//   crop-<key>: Standard | HD side by side at device pixels (2× nearest-neighbour for small art):
//     a far herd (Bushveld zebra), the baobab, the Karoo aloes, the Bushveld aloes (1× | 2×),
//     and a guineafowl in the Langloop's scope (crop-scope).
// Crops come from the same pan position in both modes (the panorama's ends and its start, the
// ends at the sim's camera limits; the grab is picked from Standard and used for both, camera x
// and every layer's tiles checked equal), held with capture mode's freeze (?capture=1: no HUD;
// F freezes sim time, so nothing moves). On desktop the real mouse rests at the bottom centre,
// outside both edge-pan bands. Also writes hd-pan-<biome>-<device>.json: camera x and each
// layer's on-screen first tile per grab, both modes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { CAMERA_MAX_X, CAMERA_MIN_X } from '../../src/sim/world';
import { hook, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and HD packs have to land: up to 20 minutes each.
  test.setTimeout(1_200_000);
  // The large desktop screen HD is made for.
  if (device(info.project.name) === 'desktop-chromium')
    await page.setViewportSize({ width: 2560, height: 1440 });
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 2400) out = resize(out, 2400, Math.round((out.height * 2400) / out.width));
  writeFileSync(join(OUT, `hd-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

/** A returning player's save (quality high: the render scale is 1 on every profile). */
async function seed(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([key, more]) => {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
          barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
          ...more,
        }),
      );
    },
    [SAVE, extra] as const,
  );
}

/** The browser's hints the card reads (navigator.connection, deviceMemory, the DPR). */
async function hints(page: Page, h: { saveData: boolean; dpr?: number }): Promise<void> {
  await page.addInitScript((v) => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      get: () => ({ effectiveType: '4g', downlink: 10, saveData: v.saveData }),
    });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 8 });
    if (v.dpr !== undefined)
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => v.dpr });
  }, h);
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

async function shot(page: Page): Promise<Rgba> {
  return decodePng(await page.screenshot());
}

test('the Graphics card with HD and with Standard pre-selected', async ({ page }, info) => {
  await seed(page);
  // A sharp screen on a fast link: HD pre-selected (phones: a DPR that makes it count).
  await hints(page, { saveData: false, ...(isTouchProject(info) ? { dpr: 4 } : {}) });
  await page.goto('/?e2e=1&graphics=card&layout=none&feesdag=none');
  await expect(page.locator('#tm-graphics')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#tm-graphics-hd')).toHaveAttribute('aria-pressed', 'true');
  save('card-hd-pick', info, await shot(page));
  // Save-Data on: Standard pre-selected.
  const p2 = await page.context().newPage();
  if (device(info.project.name) === 'desktop-chromium')
    await p2.setViewportSize({ width: 2560, height: 1440 });
  await seed(p2);
  await hints(p2, { saveData: true });
  await p2.goto('/?e2e=1&graphics=card&layout=none&feesdag=none');
  await expect(p2.locator('#tm-graphics')).toBeVisible({ timeout: 120_000 });
  await expect(p2.locator('#tm-graphics-standard')).toHaveAttribute('aria-pressed', 'true');
  save('card-standard-pick', info, await shot(p2));
});

test('"Play now in Standard" while the HD pack is slow', async ({ page }, info) => {
  await seed(page);
  await page.route(/\/assets\/[^/]+-hd\//, () => {
    // Held back for the whole test: the loading screen stays up.
  });
  await page.goto('/?e2e=1&graphics=hd&layout=none&feesdag=none');
  await expect(page.locator('#tm-hd-standard')).toBeVisible({ timeout: 120_000 });
  save('play-now', info, await shot(page));
});

/**
 * Pans to one end of the panorama: until the camera is at the sim's limit there (the same x on
 * every device and in both modes), not merely until it stops: on phones a drag swallowed by a
 * long frame (HD uploads) used to end the pan short, so Standard and HD cropped at different pans.
 */
async function pan(page: Page, touch: boolean, dir: -1 | 1): Promise<void> {
  const limit = dir < 0 ? CAMERA_MIN_X : CAMERA_MAX_X;
  const atEnd = async (): Promise<boolean> => Math.abs((await hook(page)).cameraX - limit) < 0.5;
  if (!touch) {
    const key = dir < 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key);
    for (let k = 0; k < 240 && !(await atEnd()); k++) await page.waitForTimeout(500);
    await page.keyboard.up(key);
    if (!(await atEnd()))
      throw new Error(`pan: camera ${(await hook(page)).cameraX}, not ${limit}`);
    return;
  }
  // Touch: repeated in-page drags (a fresh pointerId each) until the camera is at the limit.
  for (let k = 0; k < 80; k++) {
    if (await atEnd()) return;
    await page.evaluate(
      ([d, id]) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (!canvas) throw new Error('no game');
        const r = canvas.getBoundingClientRect();
        const y = r.top + r.height * 0.5;
        const ev = (type: string, x: number): PointerEvent =>
          new PointerEvent(type, {
            clientX: x,
            clientY: y,
            pointerId: id,
            pointerType: 'touch',
            isPrimary: true,
            buttons: type === 'pointerup' ? 0 : 1,
            bubbles: true,
            cancelable: true,
          });
        // A drag to the right moves the view left.
        const from = r.left + r.width * (d < 0 ? 0.2 : 0.8);
        const to = r.left + r.width * (d < 0 ? 0.8 : 0.2);
        canvas.dispatchEvent(ev('pointerdown', from));
        for (let i = 1; i <= 10; i++)
          canvas.dispatchEvent(ev('pointermove', from + ((to - from) * i) / 10));
        canvas.dispatchEvent(ev('pointerup', to));
      },
      [dir, 700 + k] as const,
    );
    await page.waitForTimeout(600);
  }
  if (!(await atEnd())) throw new Error(`pan: camera ${(await hook(page)).cameraX}, not ${limit}`);
}

/** Capture mode's freeze (F) on or off, waiting for it to show in the hook. */
async function freeze(page: Page, on: boolean): Promise<void> {
  await page.keyboard.press('KeyF');
  await page.waitForFunction((want) => window.__TM__?.capture?.frozen === want, on, {
    timeout: 30_000,
  });
}

interface Grab {
  img: Rgba;
  /** The sim camera x when grabbed (design px). */
  cameraX: number;
  /** Device px per design px, and the canvas's top-left in device px. */
  k: number;
  ox: number;
  oy: number;
  bounds: { key: string; x: number; y: number; w: number; h: number }[];
}

async function grab(page: Page): Promise<Grab> {
  await page.waitForTimeout(800);
  const h = await hook(page);
  const box = await page.locator('#game canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const img = await shot(page);
  const css = page.viewportSize()?.width ?? img.width;
  const dpr = img.width / css;
  return {
    img,
    cameraX: h.cameraX,
    k: (box.height / h.designHeight) * dpr,
    ox: box.x * dpr,
    oy: box.y * dpr,
    bounds: h.graphics.bounds,
  };
}

/** The device-px crop of a design rect (padded), clamped to the image. */
function cut(g: Grab, r: { x: number; y: number; w: number; h: number }, pad = 24): Rgba {
  const x0 = Math.max(0, Math.floor(g.ox + (r.x - pad) * g.k));
  const y0 = Math.max(0, Math.floor(g.oy + (r.y - pad) * g.k));
  const x1 = Math.min(g.img.width, Math.ceil(g.ox + (r.x + r.w + pad) * g.k));
  const y1 = Math.min(g.img.height, Math.ceil(g.oy + (r.y + r.h + pad) * g.k));
  const out = blank(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = ((y0 + y) * g.img.width + (x0 + x)) * 4;
      const di = (y * out.width + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = g.img.data[si + c] ?? 0;
    }
  return out;
}

/** Standard | HD side by side (n× nearest-neighbour), a 12 px gap. */
function sideBySide(a: Rgba, b: Rgba, n: number): Rgba {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const out = blank((w * 2 + 12) * n, h * n);
  out.data.fill(255);
  const put = (src: Rgba, left: number): void => {
    for (let y = 0; y < src.height * n; y++)
      for (let x = 0; x < src.width * n; x++) {
        const si = (Math.floor(y / n) * src.width + Math.floor(x / n)) * 4;
        const di = (y * out.width + left * n + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  };
  put(a, 0);
  put(b, w + 12);
  return out;
}

/** Boots one mode into a capture-mode hunt in `biome` (HD: once its HD pack is in). */
async function huntIn(page: Page, info: TestInfo, mode: string, biome: string): Promise<void> {
  await page.goto(
    `/?e2e=1&graphics=${mode}&capture=1&biome=${biome}&layout=none&feesdag=none&seed=3&huntSeconds=600&ftue=0`,
  );
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await startHunt(page, isTouchProject(info));
  if (mode === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 300_000,
    });
  await park(page, isTouchProject(info));
}

/** Grabs at the panorama's start, left end and right end. */
async function panorama(page: Page, info: TestInfo): Promise<Grab[]> {
  const touch = isTouchProject(info);
  const out: Grab[] = [];
  for (const dir of [0, -1, 1] as const) {
    if (dir !== 0) await pan(page, touch, dir);
    await freeze(page, true);
    out.push(await grab(page));
    await freeze(page, false);
  }
  return out;
}

/** The index of the first grab where `key` is fully on screen, or -1. */
function grabFor(grabs: readonly Grab[], key: string): number {
  return grabs.findIndex((g) => {
    const b = g.bounds.find((x) => x.key === key);
    const sw = (g.img.width - 2 * g.ox) / g.k;
    return b !== undefined && b.x >= 0 && b.x + b.w <= sw && b.w > 0;
  });
}

/** `key` cut from grab `i` (null when it isn't there). */
function cropAt(grabs: readonly Grab[], i: number, key: string): Rgba | null {
  const g = grabs[i];
  const b = g?.bounds.find((x) => x.key === key);
  return g === undefined || b === undefined ? null : cut(g, b);
}

/**
 * Camera x and every layer's on-screen first-tile box per grab, both modes (the log asked for
 * when the phone crops differed): docs/art-preview/compare/hd-pan-<biome>-<device>.json.
 */
function panLog(biome: string, info: TestInfo, byMode: Map<string, Grab[]>): void {
  const log: Record<string, unknown> = {};
  for (const [mode, grabs] of byMode)
    log[mode] = grabs.map((g) => ({
      cameraX: g.cameraX,
      layers: g.bounds.filter((b) => b.key.startsWith('layer:')),
    }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, `hd-pan-${biome}-${device(info.project.name)}.json`),
    `${JSON.stringify(log, null, 1)}\n`,
  );
}

const SCENERY: Readonly<Record<string, readonly string[]>> = {
  'bushveld-winter': [
    'fauna/bushveld_zebra',
    'bushveld/baobab',
    'bushveld/aloe_a',
    'bushveld/aloe_b',
  ],
  'karoo-autumn': ['karoo/aloe_a', 'karoo/aloe_b', 'fauna/karoo_springbok_a'],
};

for (const [biome, keys] of Object.entries(SCENERY))
  test(`Standard | HD crops: ${biome}`, async ({ page }, info) => {
    await seed(page);
    const byMode = new Map<string, Grab[]>();
    for (const mode of ['standard', 'hd']) {
      await huntIn(page, info, mode, biome);
      byMode.set(mode, await panorama(page, info));
    }
    panLog(biome, info, byMode);
    const std = byMode.get('standard') ?? [];
    const hd = byMode.get('hd') ?? [];
    // The same pan in both modes: each grab's camera, and at that camera every layer's tiles.
    std.forEach((g, i) => {
      const h = hd[i];
      expect(h?.cameraX ?? NaN, `grab ${i}: camera x`).toBeCloseTo(g.cameraX, 3);
      for (const b of g.bounds.filter((x) => x.key.startsWith('layer:'))) {
        const o = h?.bounds.find((x) => x.key === b.key);
        expect(Math.abs((o?.x ?? NaN) - b.x), `grab ${i}: ${b.key} x`).toBeLessThanOrEqual(2);
        expect(Math.abs((o?.w ?? NaN) - b.w), `grab ${i}: ${b.key} w`).toBeLessThanOrEqual(2);
      }
    });
    let saved = 0;
    for (const key of keys) {
      // The grab is chosen from Standard and used for both: one pan, one background.
      const i = grabFor(std, key);
      const a = i < 0 ? null : cropAt(std, i, key);
      const b = i < 0 ? null : cropAt(hd, i, key);
      if (a === null || b === null) continue;
      // Small art (far animals) at 2× so the pixels show.
      const n = a.width < 300 ? 2 : 1;
      save(`crop-${key.replace(/\//g, '_')}`, info, sideBySide(a, b, n));
      saved++;
    }
    expect(saved).toBeGreaterThan(0);
  });

test('Standard | HD crops: a guineafowl in the scope', async ({ page }, info) => {
  await seed(page, {
    loadout: { weapon: 'langloop', sights: { langloop: 'scope_var' } },
    unlocks: { weapons: ['twee_twee', 'langloop'], sights: [] },
  });
  const touch = isTouchProject(info);
  const scoped: Rgba[] = [];
  for (const mode of ['standard', 'hd']) {
    await huntIn(page, info, mode, 'karoo-autumn');
    await page.waitForFunction(
      () => (window.__TM__?.flockSpots ?? []).some((f) => f.plane === 'mid'),
      null,
      { timeout: 300_000 },
    );
    const h = await hook(page);
    const f = h.flockSpots.find((s) => s.plane === 'mid');
    if (f === undefined) throw new Error('no flock');
    const at = { x: Math.min(h.designWidth - 400, Math.max(400, f.x)), y: f.y - 20 };
    await page.evaluate(
      ([dx, dy, t]) => {
        const canvas = document.querySelector('#game canvas');
        const hk = window.__TM__;
        if (!(canvas instanceof HTMLCanvasElement) || !hk) throw new Error('no game');
        const r = canvas.getBoundingClientRect();
        canvas.dispatchEvent(
          new PointerEvent('pointerdown', {
            pointerId: t ? 31 : 1,
            pointerType: t ? 'touch' : 'mouse',
            button: 0,
            buttons: 1,
            clientX: r.left + (dx / hk.designWidth) * r.width,
            clientY: r.top + (dy / hk.designHeight) * r.height,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      [at.x, at.y, touch] as const,
    );
    await page.waitForFunction(() => (window.__TM__?.zoom.raise ?? 0) >= 1, null, {
      timeout: 60_000,
    });
    await freeze(page, true);
    const g = await grab(page);
    scoped.push(cut(g, { x: at.x - 360, y: at.y - 360, w: 720, h: 720 }, 0));
  }
  const [a, b] = scoped;
  if (a === undefined || b === undefined) throw new Error('no scope grabs');
  save('crop-scope', info, sideBySide(a, b, 1));
});
