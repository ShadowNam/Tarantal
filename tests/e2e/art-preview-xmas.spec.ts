// D-064 Christmas in the sun previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-xmas.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape); four boots per device, each test
// well under 12 min on software GL. Writes docs/art-preview/compare/xmas-<shot>-<device>.png
// (palette PNG ≤ 1600 px wide; close-ups 2–4× nearest-neighbour):
//   title, title-closeup — the Daily as "Christmas in the sun", its badge, Oupa waving beside it;
//   bubble — Oupa's bark bubble with his Santa-hat face (cropped from the bubble's own rect);
//   hunt — wide, in the sun (the bleached sky, the heat band on the horizon), a tinsel tree in view;
//   tinsel — that tree's crown close up (cropped from the hook's crown rect);
//   hat — a guineafowl in a tiny Santa hat;
//   present, present-open, present-opened — one present with nothing in front of it (no birds),
//     shut; just shot (the lid knocked back, confetti; the flash gone, the barrel and crosshair
//     off it); a second later (the two crops must differ);
//   tally — the Christmas slate; share — the card a friend receives, rendered on the page;
//   compare-tinsel, compare-present — Standard | HD side by side (the HD boot adds its half).
// ?presents=near puts the two presents either side of the windpomp / tinsel tree; ?birds=0 where
// nothing may stand in front. An in-page watcher holds the sim (__TM_HOLD_AT__); a held frame is
// grabbed only after the hook's frame counter moved on (a freshly drawn frame).
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
import { release, shootPresentOpen, xmasRunning, xmasSheetIn } from './christmasHelpers';
import { cameraStill, tapRectInPage } from './feesdaeHelpers';
import { boot, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const QUERY = 'feesdag=christmas&seed=42&omen=0&palms=0&baboons=0&today=2026-12-25&layout=none';
const MID = loadContent().scoring.planes.mid.scale;
const START_LINE =
  loadContent().feesdae.specials.find((f) => f.id === 'christmas')?.barks.start ?? '';

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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

/** Desktop: the real mouse rests low on the screen at `fx` of its width (outside the edge-pan
 *  bands), so the barrel swings that way. */
async function park(page: Page, touch: boolean, fx = 0.5): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.97);
}

/** Holds the sim one tick on and waits until the hook's frame counter has moved twice since
 *  (the held frame is freshly drawn). */
async function holdFresh(page: Page): Promise<void> {
  const f0 = await page.evaluate(() => {
    const g = window.__TM__;
    const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
    if (g !== undefined && hold !== undefined) hold(g.tick + 1);
    return g?.sceneryFrames ?? 0;
  });
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) >= f + 3, f0, {
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
}

/** The canvas now. */
async function grab(page: Page): Promise<Rgba> {
  return decodePng(await page.locator('#game canvas').screenshot());
}

/** A design-px rect of a canvas grab, at the canvas's own resolution. */
async function cut(page: Page, shot: Rgba, r: Rect): Promise<Rgba> {
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  const k = shot.width / w;
  const x0 = Math.max(0, Math.round(r.x * k));
  const y0 = Math.max(0, Math.round(r.y * k));
  const x1 = Math.min(shot.width, Math.round((r.x + r.w) * k));
  const y1 = Math.min(shot.height, Math.round((r.y + r.h) * k));
  if (x1 - x0 < 8 || y1 - y0 < 8) throw new Error(`crop ${JSON.stringify(r)} is off the canvas`);
  return crop(shot, x0, y0, x1 - x0, y1 - y0);
}

async function closeUp(
  page: Page,
  info: TestInfo,
  name: string,
  shot: Rgba,
  r: Rect,
): Promise<Rgba> {
  const c = await cut(page, shot, r);
  const n = Math.max(2, Math.min(4, Math.floor(1600 / Math.max(1, c.width))));
  save(name, info, scaled(c, n));
  return c;
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

/**
 * Pans (short arrow presses; overshoot-tolerant) until `where()` (a screen x, design px) is within
 * `band` of `fx` of the view's width, or the camera can't go further.
 */
async function panTo(
  page: Page,
  where: () => Promise<number | null>,
  fx = 0.5,
  band = 140,
): Promise<void> {
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  for (let i = 0; i < 60; i++) {
    const x = await where();
    if (x === null || Math.abs(x - w * fx) < band) break;
    const cam0 = await page.evaluate(() => window.__TM__?.cameraX ?? 0);
    await page.keyboard.down(x > w * fx ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(Math.min(400, 60 + Math.abs(x - w * fx) / 4));
    await page.keyboard.up(x > w * fx ? 'ArrowRight' : 'ArrowLeft');
    await cameraStill(page);
    if ((await page.evaluate(() => window.__TM__?.cameraX ?? 0)) === cam0) break;
  }
  await cameraStill(page);
}

const crownOf = async (page: Page): Promise<Rect | null> =>
  page.evaluate(() => {
    const c = window.__TM__?.spook?.tinsel?.crowns ?? [];
    // The biggest crown (the camelthorn's, not the windpomp's one garland).
    return [...c].sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? null;
  });
const pad = (r: Rect, p: number): Rect => ({
  x: r.x - p,
  y: r.y - p,
  w: r.w + 2 * p,
  h: r.h + 2 * p,
});

/** The first shut present's screen spot. */
const presentOf = async (
  page: Page,
  id?: number,
): Promise<{ id: number; x: number; y: number } | null> =>
  page.evaluate((pid) => {
    const t = (window.__TM__?.spook?.things ?? []).find(
      (x) => x.kind === 'present' && (pid === undefined ? !x.dark : x.id === pid),
    );
    return t === undefined ? null : { id: t.id, x: t.x, y: t.y };
  }, id);
/** Round a present: wide enough for the lid landing behind it, tall enough for the lid and the
 *  bow in the air as it opens. */
const presentBox = (p: { x: number; y: number }): Rect => ({
  x: p.x - 130 * MID - 30,
  y: p.y - 300 * MID - 24,
  w: 260 * MID + 60,
  h: 370 * MID + 36,
});
/** Ticks after the opening that `present-open` holds on (the lid at the top of its hop). */
const OPEN_TICKS = 18;

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
    pill: window.__TM__?.rects['dailyBadge'] ?? null,
    daily: window.__TM__?.rects['daily'] ?? null,
    oupa: window.__TM__?.rects['dailyOupa'] ?? null,
  }));
  expect(h.badge?.id).toBe('christmas');
  const { daily: d, oupa: o, pill } = h;
  if (d === null || o === null || pill === null) throw new Error('no daily button, badge or Oupa');
  expect(overlaps(o, pill), "Oupa's feet over the badge").toBe(false);
  const x = Math.min(d.x, o.x) - 40;
  const y = Math.min(d.y, o.y) - 40;
  const shot = await grab(page);
  save('title', info, shot);
  await closeUp(page, info, 'title-closeup', shot, {
    x,
    y,
    w: Math.max(d.x + d.w, pill.x + pill.w) + 40 - x,
    h: d.y + d.h + 30 - y,
  });
});

test('the hunt in the sun: the bubble, wide with a tinsel tree, its crown, a Santa hat', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=120&presents=near&graphics=standard`);
  await startXmas(page, touch);
  // Oupa's opening line: hold the frame it shows with his face on the bubble, crop the bubble's
  // own rect (the hook's, read in the same frame).
  const b = await page.waitForFunction(
    (line) => {
      const g = window.__TM__;
      const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
      const face = g?.rects['barkPortrait'];
      if (g === undefined || hold === undefined || g.bark?.line !== line || face === undefined)
        return null;
      hold(g.tick + 1);
      return { bubble: { x: g.bark.x, y: g.bark.y, w: g.bark.w, h: g.bark.h }, face };
    },
    START_LINE,
    { timeout: 240_000, polling: 'raf' },
  );
  const bubble = (await b.jsonValue()) as { bubble: Rect; face: Rect };
  await page.waitForTimeout(900);
  const view = await page.evaluate(() => ({
    w: window.__TM__?.designWidth ?? 1920,
    h: window.__TM__?.designHeight ?? 1080,
  }));
  expect(bubble.face.x, "Oupa's face inside the screen").toBeGreaterThanOrEqual(0);
  expect(bubble.face.y).toBeGreaterThanOrEqual(0);
  expect(bubble.face.x + bubble.face.w).toBeLessThanOrEqual(view.w);
  await closeUp(page, info, 'bubble', await grab(page), pad(bubble.bubble, 24));
  await release(page);

  // A few seconds in, the biggest tinsel tree in view.
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 240, null, { timeout: 300_000 });
  await panTo(page, async () => {
    const c = await crownOf(page);
    return c === null ? null : c.x + c.w / 2;
  });
  await park(page, touch);
  await holdFresh(page);
  expect(await page.evaluate(() => window.__TM__?.spook?.heat ?? 0)).toBeGreaterThan(0);
  const crown = await crownOf(page);
  if (crown === null) throw new Error('no tinsel tree');
  const shot = await grab(page);
  save('hunt', info, shot);
  await closeUp(page, info, 'tinsel', shot, pad(crown, 40));
  save('std-tinsel', info, await cut(page, shot, pad(crown, 40)));
  await release(page);

  // A guineafowl in a Santa hat, close up.
  const hat = await page.waitForFunction(
    (m) => {
      const g = window.__TM__;
      const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
      const spot = g?.spook?.hats.find(
        (p) => p.x > m && p.x < g.designWidth - m && p.y > 80 && p.y < g.designHeight - 200,
      );
      if (g === undefined || hold === undefined || spot === undefined) return null;
      hold(g.tick + 1);
      return spot;
    },
    260,
    { timeout: 480_000, polling: 'raf' },
  );
  const at = (await hat.jsonValue()) as { x: number; y: number };
  await page.waitForTimeout(1200);
  await closeUp(page, info, 'hat', await grab(page), {
    x: at.x - 160,
    y: at.y - 80,
    w: 320,
    h: 240,
  });
});

test('a present shut, just opened and opened; the tally and the share card', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  // No birds: nothing stands in front of the present (the shot opens it, bags nothing).
  await boot(page, `${QUERY}&huntSeconds=45&presents=near&birds=0&graphics=standard`);
  await startXmas(page, touch);
  const first = await presentOf(page);
  if (first === null) throw new Error('no present');
  // The present a third of the way across; the pointer parked low on the far side, so the barrel
  // and the crosshair stay off it.
  await panTo(page, async () => (await presentOf(page, first.id))?.x ?? null, 0.35, 120);
  await park(page, touch, 0.78);
  const clearOf = async (): Promise<Rect> => {
    const p = await presentOf(page, first.id);
    if (p === null) throw new Error('the present is gone');
    const box = presentBox(p);
    const h = await page.evaluate(() => ({
      gun: window.__TM__?.gunRect ?? null,
      c: window.__TM__?.crosshair ?? null,
    }));
    if (h.gun !== null) expect(overlaps(box, h.gun), 'the barrel over the present').toBe(false);
    if (h.c?.visible === true) {
      const e = Math.max(12, h.c.extent);
      expect(
        overlaps(box, { x: h.c.x - e, y: h.c.y - e, w: 2 * e, h: 2 * e }),
        'the crosshair over the present',
      ).toBe(false);
    }
    return box;
  };
  await holdFresh(page);
  let box = await clearOf();
  let shot = await grab(page);
  await closeUp(page, info, 'present', shot, box);
  save('std-present', info, await cut(page, shot, box));
  await release(page);

  // The opening moment: an in-page watcher (every frame, bounded) holds the sim OPEN_TICKS after
  // the tick the present opens (the flash gone, the lid and bow in the air, the confetti up),
  // whatever the frame rate; then the shot.
  await page.evaluate(
    ([pid, after]) => {
      const w = window as unknown as { __xOpenHeld?: boolean };
      w.__xOpenHeld = false;
      let frames = 0;
      const watch = (): void => {
        const g = window.__TM__;
        const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
        const t = g?.spook?.things.find((x) => x.id === pid);
        if (g !== undefined && hold !== undefined && t?.dark === true) {
          hold(g.tick + after);
          w.__xOpenHeld = true;
          return;
        }
        if (++frames < 6000) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    },
    [first.id, OPEN_TICKS] as const,
  );
  expect(await shootPresentOpen(page, touch, first.id)).toBe(true);
  await park(page, touch, 0.78);
  await page.waitForFunction(
    () => (window as unknown as { __xOpenHeld?: boolean }).__xOpenHeld === true,
    null,
    { timeout: 60_000 },
  );
  // Held: wait for fresh frames of the held tick.
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) >= f + 3, f0, {
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  box = await clearOf();
  shot = await grab(page);
  const open = await closeUp(page, info, 'present-open', shot, box);
  await release(page);
  const t1 = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 80, t1, { timeout: 120_000 });
  await holdFresh(page);
  box = await clearOf();
  const opened = await closeUp(page, info, 'present-opened', await grab(page), box);
  await release(page);
  // The two crops are different frames (the lid and confetti have moved on).
  let diff = 0;
  const n = Math.min(open.data.length, opened.data.length);
  for (let i = 0; i < n; i += 4)
    if (Math.abs((open.data[i] ?? 0) - (opened.data[i] ?? 0)) > 30) diff++;
  // Soft: the tally and the share card are still shot if this fails.
  expect.soft(diff, 'present-open and present-opened differ').toBeGreaterThan(200);

  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 300_000 });
  expect(await page.evaluate(() => window.__TM__?.tally?.frame ?? null)).toBe('christmas');
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 120_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    w: window.__TM__?.designWidth ?? 1920,
    h: window.__TM__?.designHeight ?? 1080,
    head: window.__TM__?.rects['tallyMoon'] ?? null,
    present: window.__TM__?.rects['tallyPresent'] ?? null,
    buttons: ['again', 'menu', 'share'].flatMap((id) => {
      const b = window.__TM__?.rects[id];
      return b === undefined ? [] : [b];
    }),
  }));
  for (const piece of [r.head, r.present]) {
    if (piece === null) throw new Error('a frame piece is missing');
    expect(piece.x).toBeGreaterThanOrEqual(0);
    expect(piece.y).toBeGreaterThanOrEqual(0);
    expect(piece.x + piece.w).toBeLessThanOrEqual(r.w);
    expect(piece.y + piece.h).toBeLessThanOrEqual(r.h);
    for (const btn of r.buttons)
      expect(overlaps(piece, btn), 'a frame piece over a button').toBe(false);
  }
  save('tally', info, await grab(page));
  await tapRectInPage(page, touch, 'share');
  await page.waitForFunction(() => window.__TM__?.lastShare != null, null, { timeout: 30_000 });
  const text = await page.evaluate(() => window.__TM__?.lastShare?.text ?? '');
  expect(text).toMatch(/^✨🎁 /);
  expect(text).toContain('Christmas in the sun');
  // What a friend receives: the card's text in a plain chat-like bubble on the page.
  await page.evaluate((t) => {
    const card = document.createElement('div');
    card.id = 'xmas-share-card';
    card.textContent = t;
    Object.assign(card.style, {
      position: 'fixed',
      left: '24px',
      top: '24px',
      maxWidth: '560px',
      padding: '18px 22px',
      background: '#FFFFFF',
      color: '#111111',
      font: '22px/1.45 system-ui, sans-serif',
      borderRadius: '18px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      whiteSpace: 'pre-wrap',
      zIndex: '99999',
    });
    document.body.appendChild(card);
  }, text);
  writeFileSync(join(OUT, `xmas-share-${device(info.project.name)}.txt`), `${text}\n`);
  save('share', info, decodePng(await page.locator('#xmas-share-card').screenshot()));
});

test('Standard | HD: the tinsel tree and a present', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=120&presents=near&birds=0&graphics=hd`);
  await startXmas(page, touch);
  expect(await page.evaluate(() => window.__TM__?.spook?.tinsel?.sheet)).toBe('hd');
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 240, null, { timeout: 300_000 });
  const pair = (name: string, hd: Rgba): void => {
    const stdFile = fileOf(`std-${name}`, info);
    const std = existsSync(stdFile) ? decodePng(readFileSync(stdFile)) : blank(hd.width, hd.height);
    const both = blank(std.width + hd.width + 12, Math.max(std.height, hd.height));
    blit(both, std, 0, 0);
    blit(both, hd, std.width + 12, 0);
    const n = Math.max(1, Math.min(3, Math.floor(1600 / Math.max(1, both.width))));
    save(`compare-${name}`, info, scaled(both, n));
  };
  await panTo(page, async () => {
    const c = await crownOf(page);
    return c === null ? null : c.x + c.w / 2;
  });
  await park(page, touch);
  await holdFresh(page);
  const crown = await crownOf(page);
  if (crown === null) throw new Error('no tinsel tree');
  pair('tinsel', await cut(page, await grab(page), pad(crown, 40)));
  await release(page);
  const p = await presentOf(page);
  if (p === null) throw new Error('no present');
  await panTo(page, async () => (await presentOf(page, p.id))?.x ?? null, 0.35, 120);
  await park(page, touch, 0.78);
  await holdFresh(page);
  const at = await presentOf(page, p.id);
  if (at === null) throw new Error('the present is gone');
  pair('present', await cut(page, await grab(page), presentBox(at)));
  await release(page);
});
