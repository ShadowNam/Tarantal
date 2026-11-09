// v1.16 (D-078) Veld realism previews, on demand (not part of the regular suite: playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-realism.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Two boots per device (lesson 12):
// Standard first, then one HD; each the same short Karoo hunt that ends at the braai tally:
//   brakkie   Brakkie running to the bird beside him and carrying it (?brakkiePreview=fetch),
//   peek      the troop's ridge with one baboon looking over the edge and the rest hidden
//             (?baboonPeek=sentinel: no raids; the others' looks last 6 s, a male sits up 30 s),
//   sentinel  the sentinel sitting up on top, close,
//   sizes     the far plane: a far herd with the troop's ridge (and any far guineafowl) at their
//             on-screen sizes,
//   bakkie    the Hilux-style bakkie in the hunt scene (by its spare wheel's secret spot),
//   braai     the same bakkie at night at the braai.
// Writes docs/art-preview/compare/v116-realism-<shot>-<device>.png (the Standard boot; full frames
// as -full) and v116-realism-<shot>-std-hd-<device>.png (Standard | HD, 2× nearest). Every grab
// holds the sim (__TM_HOLD_AT__) or the braai clock (?braaiAt) on a fresh frame; the far herds are
// still (?faunaIdle=0); pans are bounded and overshoot-tolerant (lesson 14); Brakkie is grabbed only
// clear of the gun (lesson 16). Each wait is bounded; a missing shot fails the test.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const KAROO =
  'biome=karoo-autumn&layout=mon&seed=42&huntSeconds=60&omen=0&reenbui=0&cameos=0&palms=0' +
  '&brakkie=1&brakkiePreview=fetch&baboonPeek=sentinel&faunaIdle=0&braaiAt=9000';

type Rect = { x: number; y: number; w: number; h: number };
const SHOTS = ['brakkie', 'peek', 'sentinel', 'sizes', 'bakkie', 'braai'] as const;
type Shot = (typeof SHOTS)[number];

interface Dog {
  readonly visible: boolean;
  readonly phase: string;
  readonly carrying: boolean;
  readonly x: number;
  readonly y: number;
}
interface Baboon {
  readonly role: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly rise: number;
}
type Hooked = {
  __TM__?: {
    tick: number;
    designWidth: number;
    sceneryFrames: number;
    brakkie?: Dog | null;
    baboons?: Baboon[] | null;
    fauna: { herd: string; box: Rect }[];
    secretSpots: { propId: string; partId: string; x: number; y: number }[];
  };
  __TM_HOLD_AT__?: (tick: number) => void;
};

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
  join(OUT, `v116-realism-${name}-${device(info.project.name)}.png`);

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

const ridgeOf = (page: Page): Promise<Baboon[]> =>
  page.evaluate(() =>
    ((window as unknown as Hooked).__TM__?.baboons ?? []).filter((b) => b.role !== 'raider'),
  );

/** Holds the first tick (within `ticks`) a ridge member shows `frame` all the way up. */
async function holdRidge(page: Page, touch: boolean, prefix: string, ticks: number): Promise<void> {
  const from = (await hook(page)).tick;
  await page.waitForFunction(
    ([pre, until]) => {
      const w = window as unknown as Hooked;
      const tick = w.__TM__?.tick ?? 0;
      if (tick > until) throw new Error(`no ${pre} by tick ${until}`);
      const up = (w.__TM__?.baboons ?? []).find(
        (b) => b.role !== 'raider' && b.visible && b.rise >= 1 && b.frame?.startsWith(pre) === true,
      );
      if (up === undefined) return false;
      w.__TM_HOLD_AT__?.(tick + 1);
      return true;
    },
    [prefix, from + ticks] as const,
    { timeout: 900_000, polling: 'raf' },
  );
  await fresh(page, touch);
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
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(20);
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

  // 1. Brakkie off to the bird beside him (3 s in) and carrying it, clear of the gun.
  await release(page);
  await page.waitForFunction(
    () => {
      const w = window as unknown as Hooked;
      const tick = w.__TM__?.tick ?? 0;
      if (tick > 60 * 25) throw new Error('no fetch on screen by tick 1500');
      const d = w.__TM__?.brakkie;
      if (d === null || d === undefined || !d.visible) return false;
      const busy = d.carrying || d.phase === 'fetch' || d.phase === 'pickup';
      if (!busy || d.x < 200 || d.x > 1720) return false;
      if (d.x > 760 && d.x < 1400) return false;
      w.__TM_HOLD_AT__?.(tick + 1);
      return true;
    },
    null,
    { timeout: 900_000, polling: 'raf' },
  );
  await fresh(page, touch);
  const dog = await page.evaluate(() => (window as unknown as Hooked).__TM__?.brakkie ?? null);
  if (dog?.visible !== true) throw new Error('Brakkie left the screen');
  const g1 = await grab(page);
  full('brakkie', g1);
  crops.brakkie = cut(g1, { x: dog.x - 200, y: dog.y - 220, w: 400, h: 236 });

  // 2. The ridge: one looking over the edge, the rest hidden.
  await release(page);
  await panToX(page, touch, async () => {
    const r = await ridgeOf(page);
    return r.length === 0 ? null : r.reduce((a, b) => a + b.x, 0) / r.length;
  });
  await holdRidge(page, touch, 'r_peek', 60 * 40);
  const peeker = (await ridgeOf(page)).find((b) => b.visible && b.rise >= 1);
  if (peeker === undefined) throw new Error('nobody looking over the edge');
  const g2 = await grab(page);
  full('peek', g2);
  crops.peek = cut(g2, { x: peeker.x - 260, y: peeker.y - 150, w: 520, h: 200 });

  // 3. The sentinel sitting up on top (a male; 30 s once he is up).
  await release(page);
  await holdRidge(page, touch, 'r_sentinel', 60 * 60);
  const sentinel = (await ridgeOf(page)).find((b) => b.visible && b.frame === 'r_sentinel');
  if (sentinel === undefined) throw new Error('no sentinel');
  const g3 = await grab(page);
  full('sentinel', g3);
  crops.sentinel = cut(g3, { x: sentinel.x - 80, y: sentinel.y - 90, w: 160, h: 110 });

  // 4. Sizes: the far herd nearest the middle, with the ridge behind (still: faunaIdle=0).
  await release(page);
  const herdX = (): Promise<number | null> =>
    page.evaluate(() => {
      const tm = (window as unknown as Hooked).__TM__;
      const c = (tm?.designWidth ?? 1920) / 2;
      const f = [...(tm?.fauna ?? [])].sort(
        (a, b) => Math.abs(a.box.x + a.box.w / 2 - c) - Math.abs(b.box.x + b.box.w / 2 - c),
      )[0];
      return f === undefined ? null : f.box.x + f.box.w / 2;
    });
  for (let k = 0; k < 12 && (await herdX()) === null; k++) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');
  }
  await panToX(page, touch, herdX);
  const at = (await hook(page)).tick + 2;
  await page.evaluate((t) => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 600_000 });
  await fresh(page, touch);
  const herd = await page.evaluate(() => {
    const tm = (window as unknown as Hooked).__TM__;
    const boxes = (tm?.fauna ?? []).map((f) => f.box);
    if (boxes.length === 0) return null;
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
  if (herd === null) throw new Error('no far herd on screen');
  const g4 = await grab(page);
  full('sizes', g4);
  crops.sizes = cut(g4, {
    x: Math.max(0, herd.x - 300),
    y: Math.max(0, herd.y - 260),
    w: Math.min(1400, herd.w + 600),
    h: herd.h + 320,
  });

  // 5. The bakkie in the hunt scene (its spare wheel is a secret's part: its spot on screen).
  await release(page);
  const spare = (): Promise<{ x: number; y: number } | null> =>
    page.evaluate(
      () =>
        (window as unknown as Hooked).__TM__?.secretSpots.find((s) => s.propId === 'bakkie') ??
        null,
    );
  await panToX(page, touch, async () => {
    const s = await spare();
    // The spare wheel hangs at the tailgate: the bakkie's middle is ~180 px (mid plane) on.
    return s === null ? null : s.x + 180 * 0.6;
  });
  const at2 = (await hook(page)).tick + 2;
  await page.evaluate((t) => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(t);
  }, at2);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at2, { timeout: 600_000 });
  await fresh(page, touch);
  const s5 = await spare();
  if (s5 === null) throw new Error('no bakkie on screen');
  const g5 = await grab(page);
  full('bakkie', g5);
  crops.bakkie = cut(g5, { x: s5.x - 120, y: s5.y - 120, w: 560, h: 260 });

  // 6. The braai tally (the braai clock held by ?braaiAt): the bakkie at night.
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
  if (b === null) throw new Error('no braai tally');
  const g6 = await grab(page);
  full('braai', g6);
  const k = b.bakkie;
  crops.braai = cut(g6, { x: k.x - 10, y: k.y - 10, w: k.w + 20, h: k.h + 20 });

  for (const s of SHOTS) if (crops[s] === undefined) throw new Error(`shot ${s} is missing`);
  return crops as Record<Shot, Rgba>;
}

test('Standard: Brakkie fetching, the baboons peeking, the sentinel, sizes, the bakkie', async ({
  page,
}, info) => {
  const crops = await shoot(page, info, 'standard');
  for (const s of SHOTS) {
    save(`${s}-std-crop`, info, crops[s]);
    save(s, info, scaled(crops[s], s === 'sentinel' ? 4 : 2));
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
