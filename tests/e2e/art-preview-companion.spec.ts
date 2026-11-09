// v1.17 (D-079) Brakkie the companion and real wind — previews on demand (not part of the regular
// suite: playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-companion.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Four boots per device (lesson 12):
// three Standard, then one HD.
//   1 Karoo, ?brakkiePreview=fetch,point:
//       bring     the "Bring! +15" pop at the screen edge as he delivers (a bird placed beside him),
//       point     Brakkie on point (held 8 s) with the marker where the flock sits;
//   2 Bushveld (the bakkie on the left: his heel spot is clear of the gun), ?brakkiePreview=react,
//     no birds:
//       closeup   Brakkie close, the first moment he is drawn (Standard; paired with boot 4),
//       proud     the proud hop (a 6-s reaction 4 s in),
//       tilt      the head tilt after three shots into the empty sky,
//       heel      the whistle (F on desktop, the round button on phones) and him sitting at heel;
//   3 Karoo, ?omen=1&wind=strong: the strong-wind moment — the wind meter under the windsock;
//   4 Bushveld HD: the close-up again → closeup Standard | HD.
// Writes docs/art-preview/compare/v117-companion-<shot>-<device>.png (full frames as -full) and
// v117-companion-closeup-std-hd-<device>.png. Every grab holds the sim (__TM_HOLD_AT__) on a fresh
// frame; still herds (?faunaIdle=0); crops are cut round the subject's SCREEN position from the
// hooks (lesson 17). Each wait is bounded by sim ticks; a missing shot fails the test.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { hook, isTouchProject, tapAt, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const COMMON =
  'layout=none&seed=42&huntSeconds=90&reenbui=0&cameos=0&palms=0&baboons=0&faunaIdle=0&braai=0';
const KAROO_DOG = `biome=karoo-autumn&${COMMON}&omen=0&brakkie=1&brakkiePreview=fetch,point`;
const BUSH_DOG = `biome=bushveld-winter&${COMMON}&omen=0&birds=0&brakkie=1&brakkiePreview=react`;
const KAROO_WIND = `biome=karoo-autumn&${COMMON}&omen=1&wind=strong&brakkie=0`;

type Rect = { x: number; y: number; w: number; h: number };
type Hooked = { __TM_HOLD_AT__?: (tick: number) => void };

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(1_800_000);
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        barks: { lastHuntDay: Math.floor(Date.now() / 86_400_000) },
      }),
    );
  }, SAVE);
});

const fileOf = (name: string, info: TestInfo): string =>
  join(OUT, `v117-companion-${name}-${device(info.project.name)}.png`);

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

function sideBySide(a: Rgba, b: Rgba): Rgba {
  const w = Math.max(a.width, b.width);
  const out = blank(w * 2 + 12, Math.max(a.height, b.height));
  out.data.fill(255);
  for (const [src, left] of [
    [a, 0],
    [b, w + 12],
  ] as const)
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + left + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  return out;
}

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** A fresh frame after a hold (the scenery's frame counter moves on). */
async function fresh(page: Page, touch: boolean): Promise<void> {
  await park(page, touch);
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
  await page.waitForTimeout(1000);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(1e12);
  });
}

interface Grab {
  img: Rgba;
  k: number;
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight };
}

function cut(g: Grab, r: Rect): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  if (x1 - x0 < 8 || y1 - y0 < 8) throw new Error(`crop ${JSON.stringify(r)} is off the canvas`);
  return crop(g.img, x0, y0, x1 - x0, y1 - y0);
}

/** Boots a hunt and waits (bounded) until it runs with its views in. */
async function start(page: Page, touch: boolean, query: string, gfx: 'standard' | 'hd') {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${query}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 300_000,
  });
  await tapRect(page, touch, 'start');
  if (gfx === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 600_000,
    });
  await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      return tm?.scene === 'hunt' && tm.menu !== 'hdLoading' && tm.graphics.loading !== 'loading';
    },
    null,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

/**
 * Holds the sim the first tick (before `untilTick`) the named moment is on screen: one of a fixed
 * set of checks run in the page (a string key, so the check is the same code in every browser).
 */
async function holdOn(page: Page, touch: boolean, moment: string, untilTick: number) {
  await page.waitForFunction(
    ([m, until]) => {
      const w = window as unknown as Hooked;
      const tm = window.__TM__;
      const tick = tm?.tick ?? 0;
      if (tick > until) throw new Error(`no ${m} by tick ${until}`);
      const d = tm?.brakkie ?? null;
      const clear = d !== null && d.visible && d.x > 160 && d.x < (tm?.designWidth ?? 0) - 160;
      let ok = false;
      if (m === 'bring') ok = (tm?.brakkiePops.length ?? 0) > 0;
      else if (m === 'point') ok = clear && d.phase === 'point' && d.marker !== null;
      else if (m === 'closeup') ok = clear && (d.phase === 'rest' || d.phase === 'trot');
      else if (m === 'proud') ok = clear && d.react === 'proud';
      else if (m === 'tilt') ok = clear && d.react === 'tilt';
      else if (m === 'heel') ok = clear && d.phase === 'heel';
      else if (m === 'idle') ok = clear && d.phase === 'rest';
      else if (m === 'wind') ok = (tm?.windMeter?.bars ?? 0) >= 5 && tm?.windGrassLean != null;
      if (!ok) return false;
      w.__TM_HOLD_AT__?.(tick + 1);
      return true;
    },
    [moment, untilTick] as const,
    { timeout: 900_000, polling: 'raf' },
  );
  await fresh(page, touch);
}

const dogNow = async (page: Page) => {
  const d = await page.evaluate(() => window.__TM__?.brakkie ?? null);
  if (d === null || !d.visible) throw new Error('Brakkie left the screen');
  return d;
};

const dogCrop = (g: Grab, d: { x: number; y: number }, w = 420, h = 260): Rgba =>
  cut(g, { x: d.x - w / 2, y: d.y - h + 20, w, h });

test('v117-companion: Brakkie the companion and real wind', async ({ page }, info) => {
  const touch = isTouchProject(info);

  // Boot 1: Karoo — the Bring pop-up as he delivers, then the point with its marker.
  await start(page, touch, KAROO_DOG, 'standard');
  await holdOn(page, touch, 'bring', 60 * 40);
  const g1 = await grab(page);
  save('bring-full', info, g1.img);
  const h1 = await hook(page);
  const score = h1.rects['score'];
  if (score === undefined) throw new Error('no score plate');
  save('bring', info, cut(g1, { x: score.x - 260, y: score.y, w: score.w + 260, h: 420 }));
  await release(page);
  await holdOn(page, touch, 'point', 60 * 80);
  // Lesson 16: clear of the gun — a short pan moves him out of its stripe (he holds the point 8 s).
  for (let k = 0; k < 4; k++) {
    const d = await dogNow(page);
    if (d.x < 760 || d.x > 1400) break;
    await release(page);
    const key = d.x < 1080 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.waitForTimeout(250);
    await page.keyboard.up(key);
    await holdOn(page, touch, 'point', (await hook(page)).tick + 60 * 6);
  }
  const d1 = await dogNow(page);
  if (d1.x >= 760 && d1.x <= 1400) throw new Error(`Brakkie in the gun's stripe (${d1.x})`);
  if (d1.marker === null) throw new Error('no marker');
  const g2 = await grab(page);
  save('point-full', info, g2.img);
  const x0 = Math.min(d1.x - 220, d1.marker.x - 80);
  const x1 = Math.max(d1.x + 220, d1.marker.x + 80);
  const y0 = Math.min(d1.y - 220, d1.marker.y - 120);
  save('point', info, cut(g2, { x: x0, y: y0, w: x1 - x0, h: d1.y + 20 - y0 }));

  // Boot 2: Bushveld — close-up, proud hop, head tilt, heel.
  await start(page, touch, BUSH_DOG, 'standard');
  await holdOn(page, touch, 'closeup', 60 * 30);
  const std = dogCrop(await grab(page), await dogNow(page));
  save('closeup', info, scaled(std, 2));
  await release(page);
  await holdOn(page, touch, 'proud', 60 * 40);
  const gp = await grab(page);
  save('proud', info, dogCrop(gp, await dogNow(page)));
  await release(page);
  // Three shots into the empty sky (no birds on this boot): three clean misses.
  await holdOn(page, touch, 'idle', 60 * 60);
  await release(page);
  for (let k = 0; k < 8; k++) {
    const tilted = await page.evaluate(() => window.__TM__?.brakkie?.react === 'tilt');
    if (tilted) break;
    await reloadIfEmpty(page, touch);
    const h = await hook(page);
    await fireAt(page, touch, { x: h.designWidth * (0.3 + 0.05 * k), y: 140 });
    await page.waitForTimeout(700);
  }
  await holdOn(page, touch, 'tilt', (await hook(page)).tick + 60 * 20);
  save('tilt', info, dogCrop(await grab(page), await dogNow(page)));
  await release(page);
  // The whistle: F on desktop, the round button on phones; he trots to heel and sits.
  await page.waitForFunction(() => window.__TM__?.brakkie?.whistle === 'heel', null, {
    timeout: 300_000,
  });
  if (touch) {
    const b = (await hook(page)).whistleButton;
    if (b === null) throw new Error('no whistle button');
    await tapAt(page, true, b.x + b.w / 2, b.y + b.h / 2);
  } else await page.keyboard.press('KeyF');
  await holdOn(page, touch, 'heel', (await hook(page)).tick + 60 * 15);
  const gh = await grab(page);
  save('heel-full', info, gh.img);
  const dh = await dogNow(page);
  const hh = await hook(page);
  const wb = hh.whistleButton;
  const hx0 = Math.min(dh.x - 220, wb?.x ?? dh.x - 220) - 20;
  save(
    'heel',
    info,
    cut(gh, { x: hx0, y: dh.y - 260, w: dh.x + 220 - hx0, h: hh.designHeight - (dh.y - 260) }),
  );

  // Boot 3: Karoo with a strong wind — the meter under the sock.
  await start(page, touch, KAROO_WIND, 'standard');
  await holdOn(page, touch, 'wind', 60 * 30);
  const gw = await grab(page);
  save('wind-full', info, gw.img);
  const hw = await hook(page);
  const sock = hw.rects['windsock'];
  const meter = hw.rects['windMeter'];
  const timer = hw.rects['timer'];
  if (sock === undefined || meter === undefined || timer === undefined)
    throw new Error('no wind HUD');
  save(
    'wind',
    info,
    cut(gw, {
      x: timer.x,
      y: timer.y,
      w: sock.x + 200 - timer.x,
      h: meter.y + meter.h + 20 - timer.y,
    }),
  );

  // Boot 4: the Bushveld in HD — the close-up again.
  await start(page, touch, BUSH_DOG, 'hd');
  await holdOn(page, touch, 'closeup', 60 * 30);
  const hd = dogCrop(await grab(page), await dogNow(page));
  save('closeup-std-hd', info, sideBySide(scaled(std, 2), scaled(hd, 2)));
});
