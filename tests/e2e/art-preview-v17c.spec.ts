// v1.7c fruit react to shots (D-047) previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v17c.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v17c-fruit-<shot>-<device>.png (the whole view and a 2× close-up),
// palette PNG ≤ 1600 px wide:
//   fruit-sausage-swing   an Okavango sausage mid-swing (a shot just beside it, held 15 ticks on);
//   fruit-sausage-drop    a sausage shot off, lying on the ground (held 90 ticks after it lands);
//   fruit-baobab-drop     a Bushveld baobab pod shot off, lying under the tree.
// Hunts run with `?birds=0` (nothing else in the frame moves or scores). The test pans the fruit
// to the middle with the arrow keys, then an in-page rAF watcher fires the shots and holds the
// sim (__TM_HOLD_AT__) at the frame. Fruit poses run on sim ticks, so the held frame holds still.
// On desktop the real mouse rests at the bottom centre, outside both edge-pan bands.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { boot, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test gets 10 minutes.
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
          barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
        }),
      );
  });
});

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(join(OUT, `v17c-${name}-${device(info.project.name)}.png`), encodePng8(out));
}

/** Nearest-neighbour n× (close-ups stay crisp). */
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

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** The whole canvas, and a 2× close-up of a design-px rect. */
async function shoot(
  page: Page,
  info: TestInfo,
  name: string,
  close: { x: number; y: number; w: number; h: number },
): Promise<void> {
  const shot = decodePng(await page.locator('#game canvas').screenshot());
  save(name, info, shot);
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  const k = shot.width / w;
  const x0 = Math.max(0, Math.round(close.x * k));
  const y0 = Math.max(0, Math.round(close.y * k));
  const x1 = Math.min(shot.width, Math.round((close.x + close.w) * k));
  const y1 = Math.min(shot.height, Math.round((close.y + close.h) * k));
  const n = Math.max(2, Math.min(4, Math.floor(1600 / Math.max(1, x1 - x0))));
  save(`${name}-closeup`, info, scaled(crop(shot, x0, y0, x1 - x0, y1 - y0), n));
}

/** Pans until a fruit of `species` is within 200 px of the centre; waits for the camera to stop. */
async function fruitInView(page: Page, species: string): Promise<void> {
  await page.waitForFunction(
    (sp) =>
      (window.__TM__?.tick ?? 0) > 30 &&
      (window.__TM__?.fruit?.spots.some((f) => f.species === sp) ?? false),
    species,
    { timeout: 240_000 },
  );
  const off = await page.evaluate((sp) => {
    const g = window.__TM__;
    if (g === undefined || g.fruit === null) return 0;
    const c = g.designWidth / 2;
    const xs = g.fruit.spots.filter((f) => f.species === sp).map((f) => f.aimX - c);
    return xs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a), xs[0] ?? 0);
  }, species);
  if (Math.abs(off) >= 200) {
    const key = off > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      (sp) => {
        const g = window.__TM__;
        if (g === undefined || g.fruit === null) return false;
        return g.fruit.spots.some(
          (f) => f.species === sp && Math.abs(f.aimX - g.designWidth / 2) < 200,
        );
      },
      species,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
  }
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      const w = window as unknown as { __camStill?: { x: number; t: number } };
      if (g === undefined) return false;
      if (w.__camStill?.x !== g.cameraX) {
        w.__camStill = { x: g.cameraX, t: g.tick };
        return false;
      }
      return g.tick - w.__camStill.t >= 10;
    },
    null,
    { timeout: 120_000 },
  );
}

/**
 * In-page watcher on the fruit of `species` nearest the centre. 'swing': one shot `beside` px to
 * its right, hold `holdAfter` ticks later. 'drop': a shot beside it, then shots straight at it
 * every 12 ticks until it has snapped off; hold `holdAfter` ticks after it lands. Resolves to the
 * fruit's index (window.__V17C__ once set).
 */
async function watch(
  page: Page,
  touch: boolean,
  o: { mode: 'swing' | 'drop'; species: string; beside: number; holdAfter: number },
): Promise<{ i: number; hold: number }> {
  await page.evaluate(
    ({ mode, species, beside, holdAfter, isTouch }) => {
      const w = window as unknown as {
        __TM_HOLD_AT__?: (t: number) => void;
        __V17C__?: { i: number; hold: number };
      };
      let id = 870;
      let target: number | null = null;
      let last = -99;
      let fired = 0;
      const tap = (
        canvas: HTMLCanvasElement,
        g: NonNullable<typeof window.__TM__>,
        x: number,
        y: number,
      ): void => {
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (x / g.designWidth) * r.width,
          clientY: r.top + (y / g.designHeight) * r.height,
          pointerId: id++,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      };
      const done = (i: number, t: number): void => {
        w.__V17C__ = { i, hold: t };
        w.__TM_HOLD_AT__?.(t);
      };
      const loop = (): void => {
        const g = window.__TM__;
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (g === undefined || g.fruit === null || canvas === null) {
          requestAnimationFrame(loop);
          return;
        }
        const c = g.designWidth / 2;
        if (target === null) {
          const all = g.fruit.spots.filter((f) => f.species === species && !f.dropped);
          if (all.length === 0) {
            requestAnimationFrame(loop);
            return;
          }
          const f = all.reduce((a, b) => (Math.abs(b.aimX - c) < Math.abs(a.aimX - c) ? b : a));
          target = f.i;
          tap(canvas, g, f.aimX + beside, f.aimY);
          last = g.tick;
          fired = 1;
          if (mode === 'swing') {
            done(f.i, g.tick + holdAfter);
            return;
          }
          requestAnimationFrame(loop);
          return;
        }
        const f = g.fruit.spots.find((x) => x.i === target);
        if (f === undefined) return;
        if (f.landed) {
          done(f.i, g.tick + holdAfter);
          return;
        }
        if (!f.dropped && g.tick - last >= 12 && fired < 8) {
          tap(canvas, g, f.aimX, f.aimY);
          last = g.tick;
          fired++;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    { ...o, isTouch: touch },
  );
  const h = await page.waitForFunction(
    () => (window as unknown as { __V17C__?: { i: number; hold: number } }).__V17C__ ?? null,
    null,
    { timeout: 420_000 },
  );
  return (await h.jsonValue()) as { i: number; hold: number };
}

/** Waits for the hold tick and the fonts; parks the mouse; lets a few frames draw. */
async function held(page: Page, touch: boolean, tick: number): Promise<void> {
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 420_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

/** A close-up box round fruit `i` (its pivot and its aim point), in design px. */
async function around(page: Page, i: number, w: number, h: number) {
  const f = await page.evaluate(
    (id) => window.__TM__?.fruit?.spots.find((x) => x.i === id) ?? null,
    i,
  );
  if (f === null) throw new Error('fruit gone');
  return { x: f.aimX - w / 2, y: Math.min(f.y, f.aimY) - h * 0.3, w, h, fruit: f };
}

test('a sausage mid-swing (Okavango)', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'biome=okavango-spring&seed=42&huntSeconds=120&birds=0');
  await startHunt(page, touch);
  await park(page, touch);
  await fruitInView(page, 'sausage');
  const w = await watch(page, touch, {
    mode: 'swing',
    species: 'sausage',
    beside: 70,
    holdAfter: 15,
  });
  await held(page, touch, w.hold);
  const box = await around(page, w.i, 360, 420);
  expect(box.fruit.dropped).toBe(false);
  await shoot(page, info, 'fruit-sausage-swing', box);
});

test('a sausage shot off, lying on the ground (Okavango)', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'biome=okavango-spring&seed=42&huntSeconds=120&birds=0');
  await startHunt(page, touch);
  await park(page, touch);
  await fruitInView(page, 'sausage');
  const w = await watch(page, touch, {
    mode: 'drop',
    species: 'sausage',
    beside: 70,
    holdAfter: 90,
  });
  await held(page, touch, w.hold);
  const box = await around(page, w.i, 420, 360);
  expect(box.fruit.landed).toBe(true);
  await shoot(page, info, 'fruit-sausage-drop', box);
});

test('a baobab pod shot off (Bushveld)', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, 'biome=bushveld-winter&seed=42&huntSeconds=120&birds=0');
  await startHunt(page, touch);
  await park(page, touch);
  await fruitInView(page, 'baobab_pod');
  const w = await watch(page, touch, {
    mode: 'drop',
    species: 'baobab_pod',
    beside: 50,
    holdAfter: 90,
  });
  await held(page, touch, w.hold);
  const box = await around(page, w.i, 420, 420);
  expect(box.fruit.landed).toBe(true);
  await shoot(page, info, 'fruit-baobab-drop', box);
});
