// D-065 New Year countdown previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-newyear.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape); three boots per device, each a
// short hunt (24 s of sim time, ≈ 5 min on software GL at ~5 ticks a second), each test well under
// 12 min. Writes docs/art-preview/compare/newyear-<shot>-<device>.png (palette PNG ≤ 1600 px
// wide; close-ups 2–4× nearest-neighbour):
//   title, title-closeup — the Daily as "New Year", its badge, Oupa in his party hat with a blower;
//   bubble — Oupa's bark bubble with his party-hat face (cropped from the bubble's own rect);
//   hunt — wide at dusk turning to blue hour, stars out, small fireworks on the far horizon
//     (?fireworks=max: a burst every slot, 3 a second, so a held frame has one);
//   countdown, countdown-closeup — the HUD's big countdown held at "5", the ×2 tag by the score;
//   hat — a guineafowl in a small striped party hat, on the near plane (looked for from the
//     hunt's start, lesson 27);
//   tally — the New Year slate ("Happy New Year!", streamers, Oupa's head, a burst);
//   share — the card a friend receives ("New Year 2027"), rendered on the page.
// No Standard | HD crops: the sheet stays Standard in HD (D-064/D-065). An in-page hold
// (__TM_HOLD_AT__) stops the sim on the wanted tick; a held frame is grabbed only after the hook's
// frame counter moved on (a freshly drawn frame); a page hold is lifted before the next moment.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { loadContent } from '../../tools/testContent';
import { release } from './christmasHelpers';
import { tapRectInPage } from './feesdaeHelpers';
import { boot, isTouchProject, tapRect } from './helpers';
import { nyRunning, nySheetIn } from './newyearHelpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const QUERY =
  'feesdag=newyear&seed=42&omen=0&palms=0&baboons=0&today=2026-12-31&layout=none&graphics=standard';
const START_LINE =
  loadContent().feesdae.specials.find((f) => f.id === 'newyear')?.barks.start ?? '';
/** The countdown digit the countdown shot holds on, and the ticks left then (mid-second: the
 *  pulse is over). */
const HOLD_N = 5;
const HOLD_LEFT = HOLD_N * 60 - 30;

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow (a local run can draw ~1 frame a second, ~5 sim ticks): 20 minutes each.
  test.setTimeout(1_200_000);
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
  join(OUT, `newyear-${name}-${device(info.project.name)}.png`);

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

async function startNy(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['daily'] !== undefined, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'daily');
  await nyRunning(page);
  await nySheetIn(page);
  await park(page, touch);
}

const pad = (r: Rect, p: number): Rect => ({
  x: r.x - p,
  y: r.y - p,
  w: r.w + 2 * p,
  h: r.h + 2 * p,
});

test('the title: the Daily as New Year, its badge and Oupa in his party hat', async ({
  page,
}, info) => {
  await boot(page, QUERY);
  await page.waitForFunction(() => window.__TM__?.titleOupa != null, null, {
    timeout: 240_000,
  });
  expect(await page.evaluate(() => window.__TM__?.titleOupa)).toBe('drawn');
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, isTouchProject(info));
  await page.waitForTimeout(1500);
  const h = await page.evaluate(() => ({
    badge: window.__TM__?.feesdag ?? null,
    pill: window.__TM__?.rects['dailyBadge'] ?? null,
    daily: window.__TM__?.rects['daily'] ?? null,
    oupa: window.__TM__?.rects['dailyOupa'] ?? null,
  }));
  expect(h.badge?.id).toBe('newyear');
  const { daily: d, oupa: o, pill } = h;
  if (d === null || o === null || pill === null) throw new Error('no daily button, badge or Oupa');
  const all = await page.evaluate(() => window.__TM__?.rects ?? {});
  for (const [id, r] of Object.entries(all))
    if (id !== 'dailyOupa') expect(overlaps(o, r), `Oupa over ${id}`).toBe(false);
  const x = Math.min(d.x, o.x) - 40;
  const y = Math.min(d.y, o.y) - 40;
  const shot = await grab(page);
  save('title', info, shot);
  await closeUp(page, info, 'title-closeup', shot, {
    x,
    y,
    w: Math.max(d.x + d.w, pill.x + pill.w, o.x + o.w) + 40 - x,
    h: d.y + d.h + 30 - y,
  });
});

test('the hunt: the bubble, wide at dusk with fireworks, the countdown held at 5', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=24&fireworks=max`);
  await startNy(page, touch);
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
  await closeUp(page, info, 'bubble', await grab(page), pad(bubble.bubble, 24));
  await release(page);

  // The countdown's ticks (the hunt is 24 s: it starts at tick 840).
  const at = await page.evaluate(() => window.__TM__?.spook?.newYear?.countdown?.atTick ?? 840);
  const end = at + 600;
  // Wide at dusk: two thirds in (the stars out, blue hour coming), held on a frame with a burst
  // well inside the view.
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, Math.round(end * 0.6), {
    timeout: 480_000,
  });
  await park(page, touch);
  const wide = await page.waitForFunction(
    () => {
      const g = window.__TM__;
      const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
      if (g === undefined || hold === undefined) return null;
      const burst = (g.spook?.newYear?.bursts ?? []).find(
        (x) => x.alpha > 0.4 && x.x > 200 && x.x < g.designWidth - 200,
      );
      if (burst === undefined) return null;
      hold(g.tick + 1);
      return burst;
    },
    null,
    { timeout: 240_000, polling: 'raf' },
  );
  const burst = (await wide.jsonValue()) as { x: number; y: number; r: number };
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) >= f + 3, f0, {
    timeout: 60_000,
  });
  await page.waitForTimeout(500);
  const stars = await page.evaluate(() => window.__TM__?.spook?.newYear?.starAlpha ?? 0);
  expect.soft(stars, 'the stars are coming out').toBeGreaterThan(0);
  const shot = await grab(page);
  save('hunt', info, shot);
  await closeUp(
    page,
    info,
    'fireworks',
    shot,
    pad({ x: burst.x, y: burst.y, w: 0, h: 0 }, burst.r + 60),
  );
  await release(page);

  // The countdown held at "5" (a page hold: it replaces the URL's), mid-second.
  await page.evaluate((t) => {
    (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__?.(t);
  }, end - HOLD_LEFT);
  await page.waitForFunction(
    ([t, n]) => window.__TM__?.tick === t && window.__TM__.countdown?.n === n,
    [end - HOLD_LEFT, HOLD_N] as const,
    { timeout: 480_000 },
  );
  await park(page, touch);
  const f1 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) >= f + 3, f1, {
    timeout: 60_000,
  });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    countdown: window.__TM__?.rects['countdown'] ?? null,
    tag: window.__TM__?.rects['countdownTag'] ?? null,
    score: window.__TM__?.rects['score'] ?? null,
  }));
  if (r.countdown === null || r.tag === null || r.score === null)
    throw new Error('no countdown on the HUD');
  const cshot = await grab(page);
  save('countdown', info, cshot);
  const x0 = Math.min(r.countdown.x, r.tag.x) - 30;
  const y0 = Math.min(r.countdown.y, r.score.y) - 20;
  await closeUp(page, info, 'countdown-closeup', cshot, {
    x: x0,
    y: y0,
    w: Math.max(r.countdown.x + r.countdown.w, r.score.x + r.score.w) + 20 - x0,
    h: r.countdown.y + r.countdown.h + 20 - y0,
  });
  await release(page);
});

test('a party hat on the near plane; the tally and the share card', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, `${QUERY}&huntSeconds=24`);
  await startNy(page, touch);
  // A guineafowl in a party hat, close up, from the hunt's start (lesson 27): its crop on screen
  // and clear of the HUD and the gun; a near bird any time; a mid one after 6 s of sim time
  // without one.
  const hat = await page.waitForFunction(
    (m) => {
      const g = window.__TM__;
      const w = window as unknown as { __TM_HOLD_AT__?: (t: number) => void; __nyHatFrom?: number };
      const hold = w.__TM_HOLD_AT__;
      if (g === undefined || hold === undefined || g.spook === null) return null;
      w.__nyHatFrom ??= g.tick;
      const waited = g.tick - w.__nyHatFrom;
      const size = { near: 320, mid: 200, far: 160, ver: 160 };
      const avoid = [...Object.values(g.rects), ...(g.gunRect === null ? [] : [g.gunRect])];
      const boxOf = (p: { x: number; y: number; plane: keyof typeof size }) => {
        const s = size[p.plane];
        return { x: p.x - s / 2, y: p.y - s / 4, w: s, h: (s * 3) / 4 };
      };
      const pick = (plane: 'near' | 'mid') =>
        g.spook?.hats.find((p) => {
          if (p.plane !== plane) return false;
          const b = boxOf(p);
          if (b.x < m || b.y < m || b.x + b.w > g.designWidth - m) return false;
          if (b.y + b.h > g.designHeight - m) return false;
          return !avoid.some(
            (r) => b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h,
          );
        });
      const spot = pick('near') ?? (waited >= 360 ? pick('mid') : undefined);
      if (spot === undefined) return null;
      hold(g.tick + 1);
      return { ...boxOf(spot), plane: spot.plane };
    },
    24,
    { timeout: 480_000, polling: 'raf' },
  );
  const at = (await hat.jsonValue()) as Rect & { plane: string };
  info.annotations.push({ type: 'hat plane', description: at.plane });
  await page.waitForTimeout(1200);
  await closeUp(page, info, 'hat', await grab(page), at);
  await release(page);

  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 600_000 });
  expect(await page.evaluate(() => window.__TM__?.tally?.frame ?? null)).toBe('newyear');
  expect(await page.evaluate(() => window.__TM__?.tally?.greeting ?? null)).toBe('Happy New Year!');
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 120_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    w: window.__TM__?.designWidth ?? 1920,
    h: window.__TM__?.designHeight ?? 1080,
    head: window.__TM__?.rects['tallyMoon'] ?? null,
    burst: window.__TM__?.rects['tallyBurst'] ?? null,
    buttons: ['again', 'menu', 'share'].flatMap((id) => {
      const b = window.__TM__?.rects[id];
      return b === undefined ? [] : [b];
    }),
  }));
  for (const piece of [r.head, r.burst]) {
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
  expect(text).toMatch(/^🎊🥳 /);
  expect(text).toContain('New Year 2027');
  // What a friend receives: the card's text in a plain chat-like bubble on the page.
  await page.evaluate((t) => {
    const card = document.createElement('div');
    card.id = 'ny-share-card';
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
  writeFileSync(join(OUT, `newyear-share-${device(info.project.name)}.txt`), `${text}\n`);
  save('share', info, decodePng(await page.locator('#ny-share-card').screenshot()));
});
