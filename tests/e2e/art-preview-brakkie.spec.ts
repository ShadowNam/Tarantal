// v1.12 (D-069) Brakkie previews, on demand (not part of the regular suite; playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-brakkie.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v112-brakkie-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   title-wag (+ title-wag-2x): Brakkie on the title beside START, wagging (the wag held);
//   trot (+ trot-2x): out in the Karoo at a fixed held tick (the same tick as the HD boot's);
//   bark: barking at a mid flock (?brakkiePreview=bark: every 3–4 s);
//   yelp-2x: the startled yelp after a shot aimed at him (never hurt);
//   fetch (+ fetch-2x): carrying a guineafowl home (?brakkiePreview=fetch: one placed beside him);
//   std-hd: Standard | HD close-up of him at the same held tick (Standard crop from the first boot);
//   windpomp-before-after: polish a — the kestrel under the target discs | above them (the same
//     held frame, __TM_TELL_UNDER__ for the "before");
//   agama-before-after: polish b — the agama's old seat (?agamaBefore=1, its tail off the koppie)
//     | its new seat on the ledge.
// Six boots per device, each test short (≤ ~12 min on software GL, lessons 13 and 23): every grab
// holds the sim (__TM_HOLD_AT__) on a fresh frame; the far herds are still (?faunaIdle=0); on
// desktop the real mouse rests at the bottom centre, outside both edge-pan bands; pans use
// overshoot-tolerant loops (lesson 15). A missing shot fails the test (lesson 11).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { hook, isTouchProject, tapRect, waitTicks } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const KAROO =
  'biome=karoo-autumn&layout=none&seed=42&huntSeconds=120&baboons=0&reenbui=0&omen=0&brakkie=1';
/** The trot shot's held tick (the Standard and HD boots hold him at the same place). */
const STD_TICK = 420;

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  test.setTimeout(1_200_000);
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
  join(OUT, `v112-brakkie-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
}

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
  const put = (src: Rgba, left: number): void => {
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + left + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c] ?? 0;
      }
  };
  put(a, 0);
  put(b, w + 12);
  return out;
}

async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

interface Dog {
  phase: string;
  pose: string;
  visible: boolean;
  x: number;
  y: number;
  facing: number;
  bird: boolean;
  sheet: string | null;
}
interface LooseTell {
  readonly species: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}
type Hooked = {
  __TM__?: {
    tick: number;
    sceneryFrames: number;
    brakkie?: Dog | null;
    tells?: LooseTell[] | null;
    titleBrakkie?: {
      rect: { x: number; y: number; w: number; h: number } | null;
      frame: string | null;
    } | null;
  };
  __TM_HOLD_AT__?: (tick: number) => void;
  __TM_TELL_UNDER__?: (on: boolean) => void;
  __TM_WAG_HOLD__?: boolean;
};

const dogOf = (page: Page): Promise<Dog | null> =>
  page.evaluate(() => (window as unknown as Hooked).__TM__?.brakkie ?? null);

/** Boots to the title (not the hunt). */
async function bootTitle(page: Page, query: string, gfx: 'standard' | 'hd'): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&faunaIdle=0&${query}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 300_000,
  });
}

/** Starts the hunt from the title; waits until it runs (and, with `dog`, his sheet is in). */
async function hunt(
  page: Page,
  info: TestInfo,
  gfx: 'standard' | 'hd',
  dog: boolean,
): Promise<void> {
  const touch = isTouchProject(info);
  await tapRect(page, touch, 'start');
  if (gfx === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 600_000,
    });
  await page.waitForFunction(
    (d) => {
      const tm = window.__TM__;
      const h = (window as unknown as Hooked).__TM__;
      return (
        tm?.scene === 'hunt' &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        (!d || (h?.brakkie?.sheet ?? null) !== null)
      );
    },
    dog,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

/** Holds the sim at tick `at` and waits for a fresh frame (lesson 28). */
async function holdAt(page: Page, touch: boolean, at: number): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as Hooked).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 900_000 });
  await fresh(page, touch);
}

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

/** Waits (bounded) until `pred` holds for Brakkie, holding the sim in the same frame. */
async function holdWhen(page: Page, touch: boolean, what: 'bark' | 'yelp' | 'carry'): Promise<Dog> {
  const d = (await (
    await page.waitForFunction(
      (want) => {
        const w = window as unknown as Hooked;
        const dog = w.__TM__?.brakkie;
        if (dog?.visible !== true || dog.phase !== want) return false;
        if (want === 'carry' && !dog.bird) return false;
        w.__TM_HOLD_AT__?.((w.__TM__?.tick ?? 0) + 1);
        return dog;
      },
      what,
      { timeout: 300_000, polling: 'raf' },
    )
  ).jsonValue()) as Dog;
  await fresh(page, touch);
  return d;
}

interface Grab {
  img: Rgba;
  k: number;
  w: number;
  h: number;
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight, w: h.designWidth, h: h.designHeight };
}

function cut(g: Grab, r: { x: number; y: number; w: number; h: number }): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** The box round Brakkie (his feet at the bottom middle, room for a bark or a bird). */
const dogBox = (d: Dog): { x: number; y: number; w: number; h: number } => ({
  x: d.x - 170,
  y: d.y - 200,
  w: 340,
  h: 214,
});

/** Pans (bounded, overshoot-tolerant, lesson 15) until the tell of `species` is near the middle. */
async function panToTell(page: Page, touch: boolean, species: string): Promise<LooseTell> {
  const w = (await hook(page)).designWidth;
  const inside = w / 2 - 220;
  const find = async (): Promise<LooseTell | undefined> =>
    (await page.evaluate(() => (window as unknown as Hooked).__TM__?.tells ?? [])).find(
      (t) => t.species === species,
    );
  let prev: number | null = null;
  for (let k = 0; k < 200; k++) {
    const t = await find();
    const o = t === undefined ? null : t.x - w / 2;
    if (o !== null && Math.abs(o) <= 60) break;
    if (
      o !== null &&
      prev !== null &&
      (Math.sign(o) !== Math.sign(prev) || Math.abs(o - prev) < 2) &&
      Math.abs(o) <= inside
    )
      break;
    prev = o;
    const dir = o === null || o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(dir);
    await page.waitForTimeout(o === null || Math.abs(o) > 500 ? 400 : 100);
    await page.keyboard.up(dir);
  }
  const t = await find();
  if (t === undefined || Math.abs(t.x - w / 2) > inside)
    throw new Error(`pan to ${species} failed`);
  await park(page, touch);
  return t;
}

test('Brakkie: the title wag, then trotting, barking and the yelp (Standard)', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await bootTitle(page, `${KAROO}&brakkiePreview=bark`, 'standard');
  // The title: he sits beside START; the wag held for the grab.
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_WAG_HOLD__ = true;
  });
  const r = (await (
    await page.waitForFunction(
      () => {
        const t = (window as unknown as Hooked).__TM__?.titleBrakkie;
        return t?.rect != null && t.frame === 'wag_a' ? t.rect : false;
      },
      null,
      { timeout: 300_000 },
    )
  ).jsonValue()) as { x: number; y: number; w: number; h: number };
  await park(page, touch);
  await page.waitForTimeout(1500);
  const title = await grab(page);
  save('title-wag', info, title.img);
  save(
    'title-wag-2x',
    info,
    scaled(cut(title, { x: r.x - 40, y: r.y - 30, w: r.w + 80, h: r.h + 40 }), 2),
  );
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_WAG_HOLD__ = false;
  });
  // The hunt: him out at a fixed held tick (the HD boot holds the same one).
  await hunt(page, info, 'standard', true);
  await holdAt(page, touch, STD_TICK);
  const d = await dogOf(page);
  if (d?.visible !== true) throw new Error(`Brakkie is not on screen at tick ${STD_TICK}`);
  const g = await grab(page);
  save('trot', info, g.img);
  save('trot-2x', info, scaled(cut(g, dogBox(d)), 2));
  save('std-crop', info, cut(g, dogBox(d)));
  writeFileSync(fileOf('std-box', info).replace(/\.png$/, '.json'), JSON.stringify(dogBox(d)));
  // Barking at a flock (every 3–4 s with the preview flag).
  await release(page);
  const b = await holdWhen(page, touch, 'bark');
  const gb = await grab(page);
  save('bark', info, gb.img);
  save('bark-2x', info, scaled(cut(gb, dogBox(b)), 2));
  // A shot aimed at him: the yelp (never hurt).
  await release(page);
  let yelped = false;
  for (let shot = 0; shot < 20 && !yelped; shot++) {
    await reloadIfEmpty(page, touch);
    const now = await dogOf(page);
    if (now?.visible !== true || now.phase !== 'rest') {
      await waitTicks(page, 15);
      continue;
    }
    await fireAt(page, touch, { x: now.x - 4 * now.facing, y: now.y - 60 });
    yelped = await page
      .waitForFunction(
        () => {
          const w = window as unknown as Hooked;
          const dog = w.__TM__?.brakkie;
          if (dog?.phase !== 'yelp' || !dog.visible) return false;
          w.__TM_HOLD_AT__?.((w.__TM__?.tick ?? 0) + 1);
          return true;
        },
        null,
        { timeout: 60_000, polling: 'raf' },
      )
      .then(() => true)
      .catch(() => false);
  }
  if (!yelped) throw new Error('no yelp within 20 shots');
  await fresh(page, touch);
  const y = await dogOf(page);
  if (y === null) throw new Error('no dog');
  save('yelp-2x', info, scaled(cut(await grab(page), dogBox(y)), 2));
});

test('Brakkie: fetching a guineafowl', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // ?brakkiePreview=fetch (test builds only, lesson 11): 3 s in he fetches a bird placed beside
  // him — no bag needed, which on software GL took 14 tries × 2 min and still failed (C2).
  await bootTitle(page, `${KAROO}&brakkiePreview=fetch`, 'standard');
  await hunt(page, info, 'standard', true);
  // Bounded: the carry comes a few sim seconds in (~1 min at ~5 ticks a second); holdWhen fails
  // the test after its timeout if it never shows.
  const d = await holdWhen(page, touch, 'carry');
  const g = await grab(page);
  save('fetch', info, g.img);
  save('fetch-2x', info, scaled(cut(g, dogBox(d)), 2));
});

test('Brakkie: Standard | HD close-up at the same held tick', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const stdFile = fileOf('std-crop', info);
  const boxFile = fileOf('std-box', info).replace(/\.png$/, '.json');
  if (!existsSync(stdFile) || !existsSync(boxFile))
    throw new Error('run the Standard test first (it writes the Standard crop)');
  await bootTitle(page, `${KAROO}&brakkiePreview=bark`, 'hd');
  await hunt(page, info, 'hd', true);
  await holdAt(page, touch, STD_TICK);
  const box = JSON.parse(readFileSync(boxFile, 'utf8')) as {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  const hd = cut(await grab(page), box);
  const std = decodePng(readFileSync(stdFile));
  save('std-hd', info, scaled(sideBySide(std, hd), 2));
});

test('Polish a: the windpomp kestrel under the target discs | above them', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await bootTitle(
    page,
    'biome=karoo-autumn&layout=none&seed=7&huntSeconds=120&baboons=0&reenbui=0&brakkie=0&omen=0',
    'standard',
  );
  await hunt(page, info, 'standard', false);
  const t = await panToTell(page, touch, 'rock_kestrel');
  const now = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await holdAt(page, touch, now + 30);
  const box = { x: t.x - 200, y: t.y - 170, w: 320, h: 230 };
  const after = cut(await grab(page), box);
  await page.evaluate(() => {
    (window as unknown as Hooked).__TM_TELL_UNDER__?.(true);
  });
  await fresh(page, touch);
  const before = cut(await grab(page), box);
  save('windpomp-before-after', info, scaled(sideBySide(before, after), 2));
});

for (const side of ['before', 'after'] as const)
  test(`Polish b: the Bushveld agama on its koppie (${side})`, async ({ page }, info) => {
    const touch = isTouchProject(info);
    await bootTitle(
      page,
      `biome=bushveld-winter&layout=none&seed=7&huntSeconds=120&baboons=0&reenbui=0&brakkie=0${side === 'before' ? '&agamaBefore=1' : ''}`,
      'standard',
    );
    await hunt(page, info, 'standard', false);
    const t = await panToTell(page, touch, 'rock_agama');
    const now = await page.evaluate(() => window.__TM__?.tick ?? 0);
    await holdAt(page, touch, now + 30);
    const shot = cut(await grab(page), { x: t.x - 170, y: t.y - 110, w: 340, h: 160 });
    save(`agama-${side}-crop`, info, shot);
    if (side === 'after') {
      const before = fileOf('agama-before-crop', info);
      if (!existsSync(before)) throw new Error('run the "before" test first');
      save(
        'agama-before-after',
        info,
        scaled(sideBySide(decodePng(readFileSync(before)), shot), 2),
      );
    }
  });
