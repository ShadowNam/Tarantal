// v1.15 (D-077) Art polish previews, on demand (not part of the regular suite: playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-polish.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Two boots per device (lesson
// 10): one Standard, one HD, each the same short Karoo hunt that ends at the braai tally:
//   bird-stand   a guineafowl close (mid plane, the flock foraging; held at tick 60),
//   brakkie      Brakkie close (held at the first tick he is on screen from tick 420),
//   baboon       the hat raider close (?baboonRaid=hat: panned to it, held at its mischief),
//   bird-fly     a guineafowl close in flight (a shot flushes the nearest flock; held mid-flush),
//   braai        Oupa, his chair, the fire, the kettle and the stone ring (the braai clock held),
//   bakkie       the bakkie at night.
// Writes docs/art-preview/compare/v115-polish-<shot>-<device>.png (the Standard boot; full
// frames as -full) and v115-polish-<shot>-std-hd-<device>.png (Standard | HD, 2× nearest).
// Every grab holds the sim (__TM_HOLD_AT__) or the braai clock (?braaiAt) on a fresh frame; the
// far herds are still (?faunaIdle=0); on desktop the mouse rests at the bottom centre; pans are
// bounded and overshoot-tolerant (lesson 15). Each wait is bounded; a missing shot fails the test.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import birds from '../../content/birds.json' with { type: 'json' };
import scoring from '../../content/scoring.json' with { type: 'json' };
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
/** A Karoo hunt with Brakkie and a hat raid, short enough to reach the braai (held time does not
 *  count: the hunt's clock is sim ticks). */
const KAROO =
  'biome=karoo-autumn&layout=mon&seed=42&huntSeconds=45&omen=0&reenbui=0&cameos=0&palms=0' +
  '&brakkie=1&baboonRaid=hat&faunaIdle=0&braaiAt=9000';
/** Brakkie's held tick (the Brakkie preview's: he trots in view there). */
const DOG_TICK = 420;

type Rect = { x: number; y: number; w: number; h: number };
const SHOTS = ['bird-stand', 'brakkie', 'baboon', 'bird-fly', 'braai', 'bakkie'] as const;
type Shot = (typeof SHOTS)[number];

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
  join(OUT, `v115-polish-${name}-${device(info.project.name)}.png`);

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
  const h = Math.max(a.height, b.height);
  const out = blank(w * 2 + 12, h);
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

interface Dog {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
}
interface Baboon {
  readonly role: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}
type Hooked = {
  __TM__?: {
    tick: number;
    sceneryFrames: number;
    brakkie?: Dog | null;
    baboons?: Baboon[] | null;
    baboonRaid?: { id: number; phase: string } | null;
  };
  __TM_HOLD_AT__?: (tick: number) => void;
};

/** A fresh frame after a hold (the scenery's frame counter moves on). */
async function fresh(page: Page, touch: boolean): Promise<void> {
  await park(page, touch);
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
  await page.waitForTimeout(1000);
}

/** Holds the sim at tick `at` (bounded) and waits for a fresh frame. */
async function holdAt(page: Page, touch: boolean, at: number): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 900_000 });
  await fresh(page, touch);
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

/** The mid plane's bird box round a body centre (the 620 × 400 box at the plane's scale). */
function birdBox(x: number, y: number): Rect {
  const s = scoring.planes.mid.scale;
  return { x: x - 330 * s, y: y - 250 * s, w: 660 * s, h: 420 * s };
}

/** The mid target bird nearest the screen's middle (null: none on screen). */
async function midBird(
  page: Page,
  near?: { x: number; y: number },
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((p) => {
    const tm = window.__TM__;
    if (tm === undefined) return null;
    const at = p ?? { x: tm.designWidth / 2, y: tm.designHeight / 2 };
    const mids = tm.targetBirds.filter(
      (b) => b.plane === 'mid' && b.x > 200 && b.x < tm.designWidth - 200 && b.y > 140,
    );
    mids.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
    return mids[0] ?? null;
  }, near ?? null);
}

/** Pans (A/D, short presses; bounded, overshoot-tolerant) until `where()` is near the middle. */
async function panToX(
  page: Page,
  touch: boolean,
  where: () => Promise<number | null>,
): Promise<void> {
  let prev: number | null = null;
  const w = (await hook(page)).designWidth;
  for (let k = 0; k < 160; k++) {
    const x = await where();
    const o = x === null ? null : x - w / 2;
    if (o !== null && Math.abs(o) <= 80) break;
    if (
      o !== null &&
      prev !== null &&
      (Math.sign(o) !== Math.sign(prev) || Math.abs(o - prev) < 2) &&
      Math.abs(o) <= w / 2 - 160
    )
      break;
    prev = o;
    const dir = o === null || o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(dir);
    await page.waitForTimeout(o === null || Math.abs(o) > 500 ? 400 : 120);
    await page.keyboard.up(dir);
  }
  const x = await where();
  if (x === null || x < 160 || x > w - 160) throw new Error(`pan: off screen (${String(x)})`);
  await park(page, touch);
}

const raiderOf = async (page: Page): Promise<Baboon | undefined> =>
  (await page.evaluate(() => (window as unknown as Hooked).__TM__?.baboons ?? [])).find(
    (b) => b.role === 'raider',
  );

/** The hunt from the title until it runs with Brakkie's and the baboons' sheets in. */
async function huntUp(page: Page, info: TestInfo, gfx: 'standard' | 'hd'): Promise<void> {
  const touch = isTouchProject(info);
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&${KAROO}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 300_000,
  });
  await tapRect(page, touch, 'start');
  if (gfx === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 600_000,
    });
  // Hold at once: the flocks still forage while the files arrive.
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(60);
  });
  await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      const h = (window as unknown as Hooked).__TM__;
      return (
        tm?.scene === 'hunt' &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        h?.brakkie !== undefined &&
        (h.baboons ?? []).length > 0
      );
    },
    null,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

/** The whole run of one boot: every shot's crop (design-px rects round the subject). */
async function shoot(
  page: Page,
  info: TestInfo,
  gfx: 'standard' | 'hd',
): Promise<Record<Shot, Rgba>> {
  const touch = isTouchProject(info);
  const crops: Partial<Record<Shot, Rgba>> = {};
  const full = (name: string, g: Grab): void => {
    if (gfx === 'standard') save(`${name}-full`, info, g.img);
  };
  await huntUp(page, info, gfx);

  // 1. A guineafowl foraging (tick 60).
  await holdAt(page, touch, 60);
  const stand = await midBird(page);
  if (stand === null) throw new Error('no mid guineafowl on screen at tick 60');
  const g1 = await grab(page);
  full('bird-stand', g1);
  crops['bird-stand'] = cut(g1, birdBox(stand.x, stand.y));

  // 2. Brakkie: the first tick from DOG_TICK he is on screen (bounded by ticks).
  await release(page);
  await page.waitForFunction(
    (from) => {
      const w = window as unknown as Hooked;
      const tick = w.__TM__?.tick ?? 0;
      if (tick > from + 900) throw new Error(`Brakkie not on screen by tick ${from + 900}`);
      const d = w.__TM__?.brakkie;
      if (tick < from || d?.visible !== true || d.x < 200 || d.x > 1720) return false;
      w.__TM_HOLD_AT__?.(tick + 1);
      return true;
    },
    DOG_TICK,
    { timeout: 900_000, polling: 'raf' },
  );
  await fresh(page, touch);
  const dog = await page.evaluate(() => (window as unknown as Hooked).__TM__?.brakkie ?? null);
  if (dog?.visible !== true) throw new Error('Brakkie left the screen');
  const g2 = await grab(page);
  full('brakkie', g2);
  crops.brakkie = cut(g2, { x: dog.x - 170, y: dog.y - 200, w: 340, h: 214 });

  // 3. The hat raider at its mischief (the raid comes early with ?baboonRaid).
  await release(page);
  const start = (await hook(page)).tick;
  await page.waitForFunction(
    (until) => {
      const tm = (window as unknown as Hooked).__TM__;
      if ((tm?.tick ?? 0) > until) throw new Error(`no raid by tick ${until}`);
      return tm?.baboonRaid?.phase === 'on' && (tm.baboons ?? []).some((b) => b.role === 'raider');
    },
    start + 60 * 20,
    { timeout: 900_000 },
  );
  await panToX(page, touch, async () => (await raiderOf(page))?.x ?? null);
  const actFrom = (await hook(page)).tick;
  await page.waitForFunction(
    (until) => {
      const w = window as unknown as Hooked;
      const tick = w.__TM__?.tick ?? 0;
      if (tick > until) throw new Error(`no hat raid by tick ${until}`);
      const r = (w.__TM__?.baboons ?? []).find((b) => b.role === 'raider');
      if (r?.visible !== true || r.frame?.startsWith('hat_') !== true) return false;
      w.__TM_HOLD_AT__?.(tick + 1);
      return true;
    },
    actFrom + 60 * 15,
    { timeout: 900_000, polling: 'raf' },
  );
  await fresh(page, touch);
  const raider = await raiderOf(page);
  if (raider?.visible !== true) throw new Error('no raider on screen');
  const g3 = await grab(page);
  full('baboon', g3);
  const bh = birds.baboons.heightPx * scoring.planes.mid.scale;
  crops.baboon = cut(g3, { x: raider.x - 150, y: raider.y - bh * 1.5, w: 300, h: bh * 1.5 + 30 });

  // 4. A guineafowl in flight: a shot beside the nearest flock flushes it; held mid-flush.
  await release(page);
  let flown: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 4 && flown === null; attempt++) {
    await reloadIfEmpty(page, touch);
    const spot = await page.evaluate(() => {
      const tm = window.__TM__;
      const s = (tm?.flockSpots ?? []).filter(
        (f) =>
          f.plane === 'mid' &&
          f.state !== 'flush' &&
          f.x > 240 &&
          f.x < (tm?.designWidth ?? 1920) - 240,
      );
      return s[0] ?? null;
    });
    if (spot === null) {
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(500);
      await page.keyboard.up('KeyA');
      continue;
    }
    // Aim above the flock (a miss close by flushes it, nobody is hit).
    await fireAt(page, touch, { x: spot.x, y: Math.max(160, spot.y - 220) });
    const from = (await hook(page)).tick;
    const held = await page
      .waitForFunction(
        ([id, until]) => {
          const w = window as unknown as Hooked;
          const tm = window.__TM__;
          const tick = tm?.tick ?? 0;
          if (tick > until) return -1;
          const f = tm?.flockSpots.find((x) => x.id === id);
          if (f?.state !== 'flush') return false;
          // 20 ticks into the flush: the birds are up and flying.
          w.__TM_HOLD_AT__?.(tick + 20);
          return tick + 20;
        },
        [spot.id, from + 600] as const,
        { timeout: 600_000, polling: 'raf' },
      )
      .then(async (h) => (await h.jsonValue()) as number)
      .catch(() => -1);
    if (held < 0) continue;
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, held, { timeout: 600_000 });
    await fresh(page, touch);
    flown = await midBird(page, { x: spot.x, y: spot.y - 120 });
  }
  if (flown === null) throw new Error('no guineafowl in flight on screen after 4 attempts');
  const g4 = await grab(page);
  full('bird-fly', g4);
  crops['bird-fly'] = cut(g4, birdBox(flown.x, flown.y));

  // 5. The braai tally (the braai clock held by ?braaiAt): Oupa and the fire, the bakkie.
  await release(page);
  await page.waitForFunction(() => window.__TM__?.braaiLoaded === true, null, { timeout: 600_000 });
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 900_000 });
  await page.waitForFunction(() => window.__TM__?.braai != null, null, { timeout: 120_000 });
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 300_000 });
  await park(page, touch);
  const b0 = await page.evaluate(() => window.__TM__?.braaiFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.braaiFrames ?? 0) > f + 1, b0, {
    timeout: 120_000,
  });
  const b = await page.evaluate(() => window.__TM__?.braai ?? null);
  if (b?.oupa == null || b.fire == null) throw new Error('no Oupa or fire on the braai tally');
  expect(b.sheet).toBe(gfx);
  const g5 = await grab(page);
  full('braai', g5);
  const x0 = Math.min(b.oupa.x, b.fire.x) - 12;
  const y0 = Math.min(b.oupa.y, b.fire.y) - 12;
  const x1 = Math.max(b.oupa.x + b.oupa.w, b.fire.x + b.fire.w) + 12;
  const y1 = Math.max(b.oupa.y + b.oupa.h, b.fire.y + b.fire.h) + 12;
  crops.braai = cut(g5, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const k = b.bakkie;
  crops.bakkie = cut(g5, { x: k.x - 10, y: k.y - 10, w: k.w + 20, h: k.h + 20 });

  for (const s of SHOTS) if (crops[s] === undefined) throw new Error(`shot ${s} is missing`);
  return crops as Record<Shot, Rgba>;
}

test('Standard: the guineafowl, Brakkie, a baboon, the braai and the bakkie', async ({
  page,
}, info) => {
  const crops = await shoot(page, info, 'standard');
  for (const s of SHOTS) {
    save(`${s}-std-crop`, info, crops[s]);
    save(s, info, scaled(crops[s], 2));
  }
});

test('HD: the same shots, and every Standard | HD pair', async ({ page }, info) => {
  const crops = await shoot(page, info, 'hd');
  for (const s of SHOTS) {
    const file = fileOf(`${s}-std-crop`, info);
    if (!existsSync(file))
      throw new Error(`the Standard crop of ${s} is missing (run Standard first)`);
    const std = decodePng(readFileSync(file));
    save(`${s}-std-hd`, info, scaled(sideBySide(std, crops[s]), 2));
  }
});
