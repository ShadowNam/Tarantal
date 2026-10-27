// D-051 Karoo polish previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-karoo-polish.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/karoo-polish-<shot>-<device>.png (the whole view and a 2× close-up),
// palette PNG ≤ 1600 px wide, in a real Karoo hunt after the late group's HD art has landed:
//   aloe (HD aloe clump a), potjie (the HD pot, lid on, steaming);
//   rattle (held mid-rattle: lid lifted, a small puff, steam);
//   lid-off (after the lid shot: the lid lying beside the pot, the open pot steaming freely).
// The camera pans to the left end (both props are there). Held frames use __TM_HOLD_AT__; the
// steam, coals and lid all run on sim ticks, so a held frame holds. On desktop the real mouse
// rests at the bottom centre, outside both edge-pan bands. The before | after art close-ups come
// from the art code: npx tsx tools/art/karooPolishPreview.ts (karoo-polish-karoo-*.png).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { rattleStart, RATTLE_CYCLE } from '../../src/game/view/potjieMotion';
import { boot, hook, isTouchProject, startHunt } from './helpers';
import { panLeft, shootLidOff, waitHd } from './potjieHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and the late group has to land first: 15 minutes each.
  test.setTimeout(900_000);
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
  writeFileSync(
    join(OUT, `karoo-polish-${name}-${device(info.project.name)}.png`),
    encodePng8(out),
  );
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

/** The whole canvas and a 2× close-up of a design-px rect. */
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
  const n = Math.max(1, Math.min(4, Math.floor(1600 / Math.max(1, x1 - x0))));
  save(`${name}-closeup`, info, scaled(crop(shot, x0, y0, x1 - x0, y1 - y0), n));
}

/** Holds the sim at `tick`, waits until it is there, parks the mouse, lets a few frames draw. */
async function holdAt(page: Page, touch: boolean, tick: number): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__?.(t);
  }, tick);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

/** A prop's origin on screen (design px) from the hook. */
async function spot(page: Page, id: string): Promise<{ x: number; y: number }> {
  const p = (await hook(page)).hdProps.find((s) => s.id === id);
  if (p === undefined) throw new Error(`no HD prop ${id}`);
  return { x: p.x, y: p.y };
}

/** The first tick ≥ `from` that is `into` ticks into a rattle (reduce motion off). */
function rattleTick(from: number, into: number): number {
  for (let c = Math.floor(from / RATTLE_CYCLE); ; c++) {
    const t = rattleStart(c * RATTLE_CYCLE, false) + into;
    if (t >= from) return t;
  }
}

async function ready(page: Page, touch: boolean): Promise<void> {
  await boot(page, 'seed=42&huntSeconds=600');
  await startHunt(page, touch);
  await waitHd(page);
  await panLeft(page, touch);
}

test('HD aloe clump and the potjie, lid on (HD art landed)', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await ready(page, touch);
  const h = await hook(page);
  // Between rattles: the lid sits on the rim, the steam rises.
  await holdAt(page, touch, rattleTick(h.tick + 120, -60));
  const aloe = await spot(page, 'aloe_cluster_a');
  await shoot(page, info, 'aloe', { x: aloe.x - 210, y: aloe.y - 250, w: 420, h: 340 });
  const pot = await spot(page, 'potjie');
  await shoot(page, info, 'potjie', { x: pot.x - 190, y: pot.y - 220, w: 380, h: 340 });
  expect((await hook(page)).potjie?.lidOff).toBe(false);
});

test('the potjie mid-rattle: lid lifted, a small puff, steam (held frame)', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await ready(page, touch);
  const h = await hook(page);
  // 3 ticks in: the lid is near the top of its first lift and the puff has just left.
  await holdAt(page, touch, rattleTick(h.tick + 120, 3));
  const pot = await spot(page, 'potjie');
  const lid = (await hook(page)).potjie?.lid;
  expect(lid?.y ?? 0).toBeLessThan(-31);
  await shoot(page, info, 'rattle', { x: pot.x - 190, y: pot.y - 220, w: 380, h: 340 });
});

test('after the lid shot: the lid lies beside the pot, the open pot steams', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await ready(page, touch);
  await shootLidOff(page, touch);
  await page.waitForFunction(() => (window.__TM__?.potjie?.clangs ?? 0) === 1, null, {
    timeout: 300_000,
  });
  // A second after the clang: the big puff has thinned, the lid is at rest.
  await holdAt(page, touch, (await hook(page)).tick + 60);
  const pot = await spot(page, 'potjie');
  expect((await hook(page)).potjie?.lidOff).toBe(true);
  await shoot(page, info, 'lid-off', { x: pot.x - 190, y: pot.y - 220, w: 420, h: 340 });
});
