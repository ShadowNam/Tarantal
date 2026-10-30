// D-064 Christmas in the sun previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-xmas.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape); four boots per device, each test
// well under 12 min on software GL. Writes docs/art-preview/compare/xmas-<shot>-<device>.png
// (palette PNG ≤ 1600 px wide; close-ups 2–4× nearest-neighbour):
//   title, title-closeup (the Daily as "Christmas in the sun" with its badge, Oupa waving in his
//     Santa hat, shorts and vellies);
//   hunt (wide, in the sun: the heat shimmer on the horizon, the tinsel tree, a present);
//   tinsel (the tinsel tree, close-up); present (a present tucked in by its prop, shut);
//   present-open (the same one just shot: the lid hopping off, the confetti); present-opened (a
//     second later: open, the lid gone); bubble (Oupa's bark bubble with his Santa-hat face);
//   hat (a guineafowl in a tiny Santa hat, close-up);
//   tally (the Christmas slate: frame, "Christmas in the sun 2026", the presents line, Oupa's
//     head in his hat); share (the tally after [Share]: the card's text in the toast/hook);
//   compare-tinsel, compare-present (Standard | HD crops side by side, from the Standard boot's
//     crops and the one HD boot).
// The special is forced with ?feesdag=christmas on 25 Dec (?omen=0: no wind). ?presents=near puts
// the two presents either side of the tinsel tree. An in-page rAF watcher holds the sim
// (__TM_HOLD_AT__) the tick it sees what a frame wants; everything that moves on a held frame (the
// glint, the lid hop, the confetti, the shimmer) runs on sim ticks. On desktop the real mouse
// rests at the bottom centre, outside both edge-pan bands. Pans use presentInView (overshoot-
// tolerant: it releases the key once the present is in the band, and re-checks).
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
import {
  holdNow,
  presentInView,
  release,
  shootPresentOpen,
  xmasRunning,
  xmasSheetIn,
} from './christmasHelpers';
import { boot, isTouchProject, tapRect } from './helpers';
import { tapRectInPage } from './feesdaeHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const QUERY = 'feesdag=christmas&seed=42&omen=0&palms=0&baboons=0&today=2026-12-25&layout=none';
const MID = loadContent().scoring.planes.mid.scale;

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test gets 12 minutes.
  test.setTimeout(720_000);
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

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `xmas-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
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

type Rect = { x: number; y: number; w: number; h: number };

/** A design-px rect of a canvas grab, at the canvas's own resolution. */
async function grabCrop(page: Page, shot: Rgba, r: Rect): Promise<Rgba> {
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  const k = shot.width / w;
  const x0 = Math.max(0, Math.round(r.x * k));
  const y0 = Math.max(0, Math.round(r.y * k));
  const x1 = Math.min(shot.width, Math.round((r.x + r.w) * k));
  const y1 = Math.min(shot.height, Math.round((r.y + r.h) * k));
  return crop(shot, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** The whole canvas (unless `wide` is false), and close-ups of design-px rects. */
async function shoot(
  page: Page,
  info: TestInfo,
  name: string | null,
  closes: readonly [string, Rect][] = [],
): Promise<Rgba> {
  const shot = decodePng(await page.locator('#game canvas').screenshot());
  if (name !== null) save(name, info, shot);
  for (const [cname, r] of closes) {
    const c = await grabCrop(page, shot, r);
    const n = Math.max(2, Math.min(4, Math.floor(1600 / Math.max(1, c.width))));
    save(cname, info, scaled(c, n));
  }
  return shot;
}

async function startXmas(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'daily');
  await xmasRunning(page);
  await xmasSheetIn(page);
  await park(page, touch);
}

/** Holds the sim the tick a guineafowl in a Santa hat is well inside the view; where it is. */
async function holdOnHat(page: Page, margin = 260): Promise<{ x: number; y: number }> {
  const h = await page.waitForFunction(
    (m) => {
      const g = window.__TM__;
      const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
      const box = window as unknown as { __xhHeld?: { x: number; y: number; t: number } };
      if (g === undefined || hold === undefined || g.spook === null) return null;
      if (box.__xhHeld !== undefined)
        return g.tick >= box.__xhHeld.t ? { x: box.__xhHeld.x, y: box.__xhHeld.y } : null;
      const spot = g.spook.hats.find(
        (p) => p.x > m && p.x < g.designWidth - m && p.y > 80 && p.y < g.designHeight - 160,
      );
      if (spot === undefined) return null;
      box.__xhHeld = { x: spot.x, y: spot.y, t: g.tick + 1 };
      hold(g.tick + 1);
      return null;
    },
    margin,
    { timeout: 480_000, polling: 'raf' },
  );
  const at = (await h.jsonValue()) as { x: number; y: number };
  await page.waitForTimeout(1500);
  return at;
}

/** Where a present is now (screen design px). */
async function presentAt(page: Page, id: number): Promise<{ x: number; y: number }> {
  return page.evaluate((pid) => {
    const t = window.__TM__?.spook?.things.find((x) => x.id === pid);
    return { x: t?.x ?? 0, y: t?.y ?? 0 };
  }, id);
}
const presentBox = (p: { x: number; y: number }): Rect => ({
  x: p.x - 150 * MID - 40,
  y: p.y - 150 * MID - 30,
  w: 300 * MID + 80,
  h: 220 * MID + 40,
});
/** The tinsel tree over the present (the present stands at its foot). */
const treeBox = (p: { x: number; y: number }): Rect => ({
  x: p.x - 330,
  y: p.y - 520,
  w: 660,
  h: 600,
});

test('the title: the Daily as Christmas in the sun, its badge and Oupa', async ({ page }, info) => {
  await boot(page, QUERY);
  await page.waitForFunction(() => window.__TM__?.rects['dailyOupa'] !== undefined, null, {
    timeout: 240_000,
  });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, isTouchProject(info));
  await page.waitForTimeout(1500);
  const h = await page.evaluate(() => ({
    badge: window.__TM__?.feesdag ?? null,
    daily: window.__TM__?.rects['daily'] ?? null,
    oupa: window.__TM__?.rects['dailyOupa'] ?? null,
  }));
  expect(h.badge?.id).toBe('christmas');
  const d = h.daily;
  const o = h.oupa;
  if (d === null || o === null) throw new Error('no daily button or Oupa');
  const x = Math.min(d.x, o.x) - 40;
  const y = Math.min(d.y, o.y) - 40;
  await shoot(page, info, 'title', [
    ['title-closeup', { x, y, w: Math.max(d.x + d.w, o.x + o.w) + 40 - x, h: d.y + d.h + 30 - y }],
  ]);
});

test('the hunt in the sun: tinsel tree, presents shut and opened, a Santa hat, the bubble', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=120&presents=near&graphics=standard`);
  await startXmas(page, touch);
  // A few seconds in: the shimmer is up, Oupa has had his say.
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 240, null, { timeout: 300_000 });
  const id = await presentInView(page);
  await park(page, touch);
  await holdNow(page);
  let at = await presentAt(page, id);
  const heat = await page.evaluate(() => window.__TM__?.spook?.heat ?? 0);
  expect(heat).toBeGreaterThan(0);
  await shoot(page, info, 'hunt', [
    ['tinsel', treeBox(at)],
    ['present', presentBox(at)],
  ]);
  // The Standard crops for the Standard | HD comparison (the HD test below adds its half).
  const full = decodePng(await page.locator('#game canvas').screenshot());
  save('std-tinsel', info, await grabCrop(page, full, treeBox(at)));
  save('std-present', info, await grabCrop(page, full, presentBox(at)));
  await release(page);

  // Shot open: hold right away (the lid in the air, the confetti), then a second later.
  expect(await shootPresentOpen(page, touch, id)).toBe(true);
  await holdNow(page);
  at = await presentAt(page, id);
  const shot = await shoot(page, info, null, [['present-open', presentBox(at)]]);
  const bark = await page.evaluate(() => window.__TM__?.bark ?? null);
  if (bark !== null)
    save(
      'bubble',
      info,
      scaled(
        await grabCrop(page, shot, {
          x: bark.x - 40,
          y: bark.y - 70,
          w: bark.w + 80,
          h: bark.h + 90,
        }),
        2,
      ),
    );
  await release(page);
  const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 80, t0, {
    timeout: 120_000,
  });
  await holdNow(page);
  await shoot(page, info, null, [['present-opened', presentBox(await presentAt(page, id))]]);
  await release(page);

  // A guineafowl in a Santa hat, close up.
  const hat = await holdOnHat(page);
  await shoot(page, info, null, [['hat', { x: hat.x - 160, y: hat.y - 80, w: 320, h: 240 }]]);
});

test('the tally: the Christmas slate and the share card', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=20&presents=near&birds=0`);
  await startXmas(page, touch);
  // One present open, so the presents line has something to count.
  const id = await presentInView(page);
  await shootPresentOpen(page, touch, id);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  expect(await page.evaluate(() => window.__TM__?.tally?.frame ?? null)).toBe('christmas');
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 120_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
  await shoot(page, info, 'tally');
  await tapRectInPage(page, touch, 'share');
  await page.waitForFunction(() => window.__TM__?.lastShare != null, null, { timeout: 30_000 });
  const text = await page.evaluate(() => window.__TM__?.lastShare?.text ?? '');
  expect(text).toMatch(/^✨🎁 /);
  writeFileSync(join(OUT, `xmas-share-${device(info.project.name)}.txt`), `${text}\n`);
  await page.waitForTimeout(800);
  await shoot(page, info, 'share');
});

test('Standard | HD: the tinsel tree and a present', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=120&presents=near&graphics=hd`);
  await startXmas(page, touch);
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 240, null, { timeout: 300_000 });
  const id = await presentInView(page);
  await park(page, touch);
  await holdNow(page);
  const at = await presentAt(page, id);
  const full = decodePng(await page.locator('#game canvas').screenshot());
  for (const [name, r] of [
    ['tinsel', treeBox(at)],
    ['present', presentBox(at)],
  ] as const) {
    const hd = await grabCrop(page, full, r);
    const stdFile = fileOf(`std-${name}`, info);
    const std = existsSync(stdFile) ? decodePng(readFileSync(stdFile)) : blank(hd.width, hd.height);
    const pair = blank(std.width + hd.width + 12, Math.max(std.height, hd.height));
    blit(pair, std, 0, 0);
    blit(pair, hd, std.width + 12, 0);
    const n = Math.max(1, Math.min(3, Math.floor(1600 / Math.max(1, pair.width))));
    save(`compare-${name}`, info, scaled(pair, n));
  }
  await release(page);
});
