// D-049 perspective previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-perspective.spec.ts \
//     --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Each test renders the same
// held frame twice: "before" with the dev/e2e override ?planeScale=v17 (the v1.7 plane scales,
// far animals as drawn) and "after" (this build), and writes to docs/art-preview/compare/:
//   perspective-<shot>-<device>.png         before | after, side by side (the shot's crop)
//   perspective-<shot>-{before,after}-<device>.png   the whole view of each
// Shots: karoo-ostriches (the product owner's view: the far ground with the ostriches and the
// far flock of Monday's feeding spot), karoo-mid-windpomp (a mid flock by the windpomp),
// bushveld-far (zebras and giraffes with far birds), namibie-far (the far animals and the Ver
// waterhole), scope-far and scope-ver (a far and a Ver bird through the .22's small scope).
// Frames are held at a sim tick (?holdAt) on seed 42; the camera pans with a held arrow key on
// sim time. On desktop the real mouse rests at the bottom centre, outside the edge-pan bands.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
const VARIANTS = ['before', 'after'] as const;
type Variant = (typeof VARIANTS)[number];
const OVERRIDE: Record<Variant, string> = { before: '&planeScale=v17', after: '' };
const CONTENT = loadContent();
/** A Monday with Nog Verder open (longrange.spec.ts PREVIEW_DAY). */
const RIFLE_DAY = { key: '2026-10-19', n: 20745 } as const;

test.use({ serviceWorkers: 'block' });
// Playwright needs the fixture object pattern; this hook uses none of them.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test renders two hunts, so it gets 10+ minutes.
  test.setTimeout(900_000);
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `perspective-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

/** Before | after with a 12 px gap. */
function pair(a: Rgba, b: Rgba): Rgba {
  const h = Math.max(a.height, b.height);
  const out = blank(a.width + 12 + b.width, h);
  out.data.fill(255);
  blit(out, a, 0, 0);
  blit(out, b, a.width + 12, 0);
  return out;
}

/** Core width of a layer (art bible §4.1): 1920 + 3200 × its scroll factor. */
function layerOf(biome: string, id: string): { sf: number; core: number } {
  const l = CONTENT.biomes.find((x) => x.id === biome)?.layers.find((x) => x.id === id);
  if (l === undefined) throw new Error(`no layer ${biome}/${id}`);
  return { sf: l.scrollFactor, core: 1920 + 3200 * l.scrollFactor };
}

/** Camera centre (near px) that puts plane point u of a layer at the screen centre. */
function cameraFor(biome: string, layer: string, u: number): number {
  const { sf, core } = layerOf(biome, layer);
  return Math.min(4160, Math.max(960, (u * core - 960) / sf + 960));
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

async function design(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => ({
    w: window.__TM__?.designWidth ?? 1920,
    h: window.__TM__?.designHeight ?? 1080,
  }));
}

async function canvasShot(page: Page): Promise<Rgba> {
  return decodePng(await page.locator('#game canvas').screenshot());
}

/** A design-px box of a canvas screenshot, clamped to it. */
function cropDesign(
  img: Rgba,
  d: { w: number; h: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rgba {
  const kx = img.width / d.w;
  const ky = img.height / d.h;
  const ax = Math.max(0, Math.round(x0 * kx));
  const ay = Math.max(0, Math.round(y0 * ky));
  const bx = Math.min(img.width, Math.round(x1 * kx));
  const by = Math.min(img.height, Math.round(y1 * ky));
  return crop(img, ax, ay, Math.max(1, bx - ax), Math.max(1, by - ay));
}

/** Holds an arrow key until the camera passes `target` or stops (in-page, no round trips). */
async function panTo(page: Page, target: number): Promise<number> {
  const start = await page.evaluate(() => window.__TM__?.cameraX ?? 2560);
  if (Math.abs(start - target) < 2) return start;
  const key = target < start ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  await page.waitForFunction(
    ([s, t]) => {
      const w = window as unknown as { __PERSP_PAN__?: { x: number; at: number } };
      const x = window.__TM__?.cameraX ?? s;
      const now = performance.now();
      if (w.__PERSP_PAN__ === undefined || w.__PERSP_PAN__.x !== x)
        w.__PERSP_PAN__ = { x, at: now };
      const stuck = x !== s && now - w.__PERSP_PAN__.at > 3000;
      return (t < s ? x <= t : x >= t) || stuck;
    },
    [start, target] as const,
    { timeout: 300_000, polling: 100 },
  );
  await page.keyboard.up(key);
  return page.evaluate(() => window.__TM__?.cameraX ?? 2560);
}

/** Waits for the held tick and the fonts; parks the mouse; lets a few frames draw. */
async function held(page: Page, touch: boolean, tick: number): Promise<void> {
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 420_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

async function plainSave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'high' },
          ftue: { done: true, skipped: false, step: '' },
          barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
        }),
      );
  });
}

/** The .22 with the small scope, Nog Verder open on RIFLE_DAY (longrange.spec.ts rifleSave). */
async function rifleSave(page: Page): Promise<void> {
  await page.addInitScript((day) => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'twee_twee', sights: { twee_twee: 'scope_small' } },
        unlocks: { weapons: ['twee_twee'], sights: ['peep'] },
        bestRank: 'bosveldjagter',
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
        bonusMaps: {
          day,
          unlocked: ['karoo-autumn/verder', 'karoo-autumn/nogVerder', 'karoo-autumn/dieVerste'],
          bests: {},
        },
      }),
    );
  }, RIFLE_DAY.n);
}

/**
 * The views: [shot, biome, layout, layer, u, hold tick, crop y0, y1, crop half-width]. Monday
 * layouts put a feeding spot (far or mid) where the animals or the windpomp stand.
 */
const VIEWS = [
  ['karoo-ostriches', 'karoo-autumn', 'mon', 'far_veld', 0.3, 540, 380, 680, 520],
  ['karoo-mid-windpomp', 'karoo-autumn', 'mon', 'mid', 0.24, 540, 300, 900, 620],
  ['bushveld-far', 'bushveld-winter', 'mon', 'far_veld', 0.3, 540, 360, 680, 620],
  ['namibie-far', 'namibie', 'mon', 'far_veld', 0.5, 540, 420, 680, 620],
] as const;

for (const [shot, biome, layout, layer, u, hold, y0, y1, half] of VIEWS) {
  test(`perspective: ${shot}`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await plainSave(page);
    const crops: Rgba[] = [];
    for (const v of VARIANTS) {
      await boot(
        page,
        `seed=42&huntSeconds=60&biome=${biome}&layout=${layout}&holdAt=${hold}${OVERRIDE[v]}`,
      );
      await startHunt(page, touch);
      await park(page, touch);
      await panTo(page, cameraFor(biome, layer, u));
      expect(
        await page.evaluate(() => window.__TM__?.tick ?? 0),
        'panned before the hold',
      ).toBeLessThan(hold);
      await held(page, touch, hold);
      const d = await design(page);
      const img = await canvasShot(page);
      save(`${shot}-${v}`, info, img);
      crops.push(cropDesign(img, d, d.w / 2 - half, y0, d.w / 2 + half, y1));
    }
    const [a, b] = crops;
    if (a === undefined || b === undefined) throw new Error('missing a variant');
    save(shot, info, pair(a, b));
    expect(existsSync(join(OUT, `perspective-${shot}-${device(info.project.name)}.png`))).toBe(
      true,
    );
  });
}

/** Presses (pointer down) at a design point with a fresh pointer id; keeps it for release. */
async function press(page: Page, touch: boolean, x: number, y: number, id: number): Promise<void> {
  await page.evaluate(
    ([dx, dy, t, pid]) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      if (!(canvas instanceof HTMLCanvasElement) || !h) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      const init = {
        pointerId: pid,
        pointerType: t ? 'touch' : 'mouse',
        button: 0,
        buttons: 1,
        clientX: r.left + (dx / h.designWidth) * r.width,
        clientY: r.top + (dy / h.designHeight) * r.height,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    },
    [x, y, touch, id] as const,
  );
}

// A far and a Ver bird through the .22's small scope on Nog Verder (Karoo, Monday). The scope
// comes up on the first flock of that plane in view, before the hold; the frame is held raised.
for (const plane of ['far', 'ver'] as const) {
  test(`perspective: scope-${plane}`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    const HOLD = 720;
    await rifleSave(page);
    const shots: Rgba[] = [];
    let pid = touch ? 71 : 1;
    for (const v of VARIANTS) {
      await boot(
        page,
        `seed=42&today=${RIFLE_DAY.key}&bonus=nogVerder&huntSeconds=60&holdAt=${HOLD}${OVERRIDE[v]}`,
      );
      await startHunt(page, touch);
      await park(page, touch);
      const h = await page.waitForFunction(
        (p) => {
          const t = window.__TM__;
          if (!t) return null;
          const f = t.flockSpots.find(
            (s) =>
              s.plane === p &&
              s.alive > 0 &&
              s.x > t.designWidth * 0.2 &&
              s.x < t.designWidth * 0.8,
          );
          return f === undefined ? null : { x: f.x, y: f.y - 2 };
        },
        plane,
        { timeout: 300_000, polling: 100 },
      );
      const at = (await h.jsonValue()) as { x: number; y: number };
      expect(
        await page.evaluate(() => window.__TM__?.tick ?? 0),
        'raised before the hold',
      ).toBeLessThan(HOLD - 60);
      pid += 1;
      await press(page, touch, at.x, at.y, pid);
      await page.waitForFunction(
        (t) => (window.__TM__?.tick ?? 0) >= t && (window.__TM__?.zoom.raise ?? 0) >= 1,
        HOLD,
        { timeout: 420_000 },
      );
      await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, {
        timeout: 30_000,
      });
      await page.waitForTimeout(1500);
      const img = await canvasShot(page);
      save(`scope-${plane}-${v}`, info, img);
      shots.push(img);
    }
    const [a, b] = shots;
    if (a === undefined || b === undefined) throw new Error('missing a variant');
    save(`scope-${plane}`, info, pair(a, b));
  });
}
