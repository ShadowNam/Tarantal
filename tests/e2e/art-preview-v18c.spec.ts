// v1.8c (D-063) Die Oes (The Harvest) previews, on demand (not part of the regular suite;
// playwright.config.ts ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v18c.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v18c-harvest-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   title: the title with the new Die Oes button (and its line);
//   intro: the fence broken, the warthog family barging in (held), and family-2x (a 2× close-up);
//   midrun: mid-run, wide: the crop meter, the fence bar, the workers at the gap;
//   duck: a worker ducking (a shot at them; ?harvestDuck keeps them down), and duck-2x;
//   rush: the rush at its peak (?harvestRush=1: the peak rate from the start);
//   warthog-2x: a warthog close up (≥ 120 px tall at 1080: a near one when there is one);
//   end: the fence whole, the gap closed, the animals running off; tally: the Harvest tally;
//   raid-mielie, raider-mielie-2x: a baboon raider at the mielies (?baboonRaid=mielie);
//   field-std-hd, warthog-std-hd, worker-std-hd: Standard | HD crops (the HD boot pairs its crops
//     with the Standard boot's *-std-crop files, same seed, same held tick, no pan).
// Three boots per device: the whole Harvest (Standard), the crops and a raid (Standard), the crops
// in HD. Every grab holds the sim (__TM_HOLD_AT__ or ?holdAt); anything that moves runs on sim
// time; the far herds are still (?faunaIdle=0). On desktop the real mouse rests at the bottom
// centre, outside both edge-pan bands. A shot that is missing fails the test (bounded attempts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import modes from '../../content/modes.json' with { type: 'json' };
import scoring from '../../content/scoring.json' with { type: 'json' };
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const H = modes.modes.harvest;
const INTRO = Math.round(H.intro.seconds * 60);
const BREAK = Math.round(INTRO * H.intro.breakAt);
const RUSH = H.huntSeconds * 60;
/** The held tick of the Standard | HD crops (mid-run: workers at work, warthogs in the rows). */
const CROP_TICK = INTRO + 14 * 60;

test.use({ serviceWorkers: 'block' });
// In order, in one worker: the HD test pairs its crops with the Standard crops test's.
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow, and the HD pack has to land: up to 25 minutes each.
  test.setTimeout(1_500_000);
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
  join(OUT, `v18c-harvest-${name}-${device(info.project.name)}.png`);

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(fileOf(name, info), encodePng8(out));
}

/** Nearest-neighbour scale by a whole number n. */
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

/** a | b side by side, a 12 px white gap. */
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

interface Actor {
  readonly id: number;
  readonly role: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly groundY: number;
  readonly visible: boolean;
}
interface HarvestHook {
  readonly phase: string;
  readonly crop: number;
  readonly workers: readonly { id: number; phase: string }[];
}
type Hooked = {
  __TM__?: {
    tick: number;
    scene: string;
    harvestActors?: Actor[] | null;
    harvest?: HarvestHook | null;
    baboons?:
      { role: string; frame: string | null; x: number; y: number; visible: boolean }[] | null;
    baboonRaid?: { id: number; phase: string } | null;
  };
};

async function actorsOf(page: Page): Promise<readonly Actor[]> {
  return page.evaluate(() => (window as unknown as Hooked).__TM__?.harvestActors ?? []);
}

/** Boots the title (Standard or HD) with the Harvest's test flags. */
async function bootTitle(page: Page, q: string, gfx: 'standard' | 'hd'): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&seed=42&faunaIdle=0&${q}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['harvest'] !== undefined, null, {
    timeout: 300_000,
  });
}

/** Taps Die Oes on the title; waits until the Harvest runs on its map with its sheet drawn. */
async function startHarvest(page: Page, info: TestInfo, gfx: 'standard' | 'hd'): Promise<void> {
  const touch = isTouchProject(info);
  await tapRect(page, touch, 'harvest');
  if (gfx === 'hd')
    await page.waitForFunction(() => (window.__TM__?.graphics.hdTextures ?? 0) > 0, null, {
      timeout: 600_000,
    });
  await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      const layers = (tm?.graphics.bounds ?? []).filter((b) => b.key.startsWith('layer:'));
      const h = (window as unknown as Hooked).__TM__;
      return (
        tm?.scene === 'hunt' &&
        tm.biome === 'oes' &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        layers.length > 0 &&
        layers.every((b) => b.key.startsWith('layer:oes/')) &&
        (h?.harvest ?? null) !== null &&
        // The Harvest sheet is drawn (the gap's panel shows).
        (h?.harvestActors ?? []).some((a) => a.role === 'gap' && a.visible && a.frame !== null)
      );
    },
    null,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

/** Holds the sim at tick `at` (bounded by ticks), then lets the frame settle. */
async function holdAt(page: Page, touch: boolean, at: number): Promise<void> {
  await page.evaluate((t) => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 900_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(1e12);
  });
}

interface Grab {
  img: Rgba;
  k: number;
  w: number;
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight, w: h.designWidth };
}

/** A design-px rect cut from a grab (clamped). */
function cut(g: Grab, r: { x: number; y: number; w: number; h: number }): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** The box round the gap (its panel, the sign, the workers beside it). */
async function fieldBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const gap = (await actorsOf(page)).find((a) => a.role === 'gap');
  if (gap === undefined || !gap.visible) throw new Error('the gap is not on screen');
  return { x: gap.x - 260, y: gap.y - 340, w: 820, h: 420 };
}

/** A warthog's box on screen (the biggest visible adult; feet at x, y). */
async function warthogBox(
  page: Page,
): Promise<{ box: { x: number; y: number; w: number; h: number }; near: boolean }> {
  const w0 = (await hook(page)).designWidth;
  const sized = (a: Actor) => {
    const near = a.y > 900;
    const k = near ? scoring.planes.near.scale : scoring.planes.mid.scale;
    const h = H.warthogs.heightPx * k * 1.5;
    return { a, near, box: { x: a.x - h * 1.4, y: a.y - h, w: h * 2.8, h: h + 30 } };
  };
  // Review round 1: only a warthog whose whole body (and a margin) is inside the view, clear of
  // the HUD's bottom corners; the nearest (lowest feet, drawn biggest) of those.
  const ok = (await actorsOf(page))
    .filter((a) => a.role === 'warthog' && a.visible && a.frame?.startsWith('wh_') === true)
    .map(sized)
    .filter((c) => c.box.x >= 20 && c.box.x + c.box.w <= w0 - 20 && c.box.y >= 20)
    .sort((a, b) => b.a.y - a.a.y);
  const best = ok[0];
  if (best === undefined) throw new Error('no warthog fully on screen');
  return { box: best.box, near: best.near };
}

/** The busy count of the rush on screen: flocks, warthogs, raiders, fly-ins (review round 1). */
async function rushCount(
  page: Page,
): Promise<{ flocks: number; warthogs: number; raiders: number; flyins: number }> {
  return page.evaluate(() => {
    const tm = window.__TM__;
    const w = tm?.designWidth ?? 1920;
    const on = (x: number): boolean => x > 0 && x < w;
    return {
      flocks: (tm?.flockSpots ?? []).filter((f) => f.alive > 0 && on(f.x)).length,
      warthogs: (tm?.harvestActors ?? []).filter((a) => a.role === 'warthog' && a.visible).length,
      raiders: (tm?.baboons ?? []).filter((b) => b.role === 'raider' && b.visible).length,
      flyins: (tm?.harvestFlyovers ?? []).filter((b) => on(b.x)).length,
    };
  });
}

/** The box round the workers on screen. */
async function workerBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const ws = (await actorsOf(page)).filter((a) => a.role === 'worker' && a.visible);
  if (ws.length === 0) throw new Error('no worker on screen');
  const h = H.workers.heightPx * scoring.planes.mid.scale * 1.2;
  const x0 = Math.min(...ws.map((a) => a.x)) - 70;
  const x1 = Math.max(...ws.map((a) => a.x)) + 70;
  const y1 = Math.max(...ws.map((a) => a.y)) + 20;
  return { x: x0, y: y1 - h - 20, w: x1 - x0, h: h + 20 };
}

/** The family that barged in (the sow and her piglets) on screen. */
async function familyBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const fam = (await actorsOf(page)).filter(
    (a) => (a.role === 'warthog' || a.role === 'piglet') && a.visible,
  );
  if (fam.length === 0) throw new Error('no warthog family on screen');
  const x0 = Math.min(...fam.map((a) => a.x)) - 110;
  const x1 = Math.max(...fam.map((a) => a.x)) + 110;
  const y1 = Math.max(...fam.map((a) => a.y)) + 20;
  return { x: x0, y: y1 - 190, w: x1 - x0, h: 190 };
}

/**
 * Pans (A/D, short presses) until `where()` (a screen x) is within 80 px of the centre, or on
 * screen with a 160 px margin once a press overshoots it or the camera stops at the panorama's
 * end (one press can pan ~400 px on slow software GL). Bounded; throws when it never gets there.
 */
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

test('the Harvest: title, intro, mid-run, a worker ducking, the rush, the end, the tally', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  // Held at the intro from the start (the fence just broke, the family barging in).
  await bootTitle(
    page,
    `harvestDuck=600&harvestRush=1&baboonRaid=mielie&holdAt=${String(BREAK + 40)}`,
    'standard',
  );
  await park(page, touch);
  await page.waitForTimeout(1500);
  save('title', info, (await grab(page)).img);
  await startHarvest(page, info, 'standard');
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, BREAK + 40, {
    timeout: 900_000,
  });
  await park(page, touch);
  await page.waitForTimeout(1500);
  const phase = await page.evaluate(() => (window as unknown as Hooked).__TM__?.harvest?.phase);
  if (phase !== 'intro') throw new Error(`not in the intro (${String(phase)})`);
  const intro = await grab(page);
  save('intro', info, intro.img);
  save('family-2x', info, scaled(cut(intro, await familyBox(page)), 2));

  // Mid-run, wide (the camera still on the gap: the workers at work).
  await holdAt(page, touch, INTRO + 10 * 60);
  save('midrun', info, (await grab(page)).img);

  // A worker ducking: a shot at one (?harvestDuck keeps them down), then hold.
  const before = await page.evaluate(() => window.__TM__?.tick ?? 0);
  let ducked = false;
  for (let shot = 0; shot < 8 && !ducked; shot++) {
    const w = (await actorsOf(page)).find((a) => a.role === 'worker' && a.visible);
    if (w === undefined) throw new Error('no worker on screen to duck');
    await reloadIfEmpty(page, touch);
    const at = (await page.evaluate(() => window.__TM__?.tick ?? 0)) + 1;
    await fireAt(page, touch, {
      x: w.x,
      y: w.y + H.workers.hitboxes.work.body.oy * scoring.planes.mid.scale,
    });
    await page.evaluate((t) => {
      (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t + 25);
    }, at);
    ducked =
      (await (
        await page.waitForFunction(
          (until) => {
            const tm = (window as unknown as Hooked).__TM__;
            if ((tm?.harvest?.workers ?? []).some((k) => k.phase === 'duck')) return true;
            return (tm?.tick ?? 0) >= until ? 'miss' : false;
          },
          at + 25,
          { timeout: 300_000, polling: 'raf' },
        )
      ).jsonValue()) === true;
  }
  if (!ducked) throw new Error(`no worker ducked within 8 shots (from tick ${String(before)})`);
  await park(page, touch);
  await page.waitForTimeout(1500);
  const duck = await grab(page);
  save('duck', info, duck.img);
  save('duck-2x', info, scaled(cut(duck, await workerBox(page)), 2));

  // The rush at its peak: from 6 s before the end, hold at the first tick (checked every 10)
  // with at least 2 flocks, 3 warthogs and a raider on screen; fail when it never gets busy.
  // Review round 3: 30-tick steps (each costs seconds on software GL), the counts logged, and the
  // thin-rush error thrown well inside the budget (at most 10 steps).
  let busy = false;
  let last = { flocks: 0, warthogs: 0, raiders: 0, flyins: 0 };
  for (let at = INTRO + RUSH - 6 * 60; at <= INTRO + RUSH - 20 && !busy; at += 30) {
    await holdAt(page, touch, at);
    last = await rushCount(page);
    console.log(`[v18c] rush at tick ${String(at)}: ${JSON.stringify(last)}`);
    busy = last.flocks >= 2 && last.warthogs >= 3 && last.raiders >= 1;
  }
  if (!busy) throw new Error(`the rush is thin at its peak: ${JSON.stringify(last)}`);
  const rush = await grab(page);
  save('rush', info, rush.img);
  const hog = await warthogBox(page);
  save('warthog-2x', info, scaled(cut(rush, hog.box), hog.near ? 1 : 2));
  // A fly-in close up (review round 2): a francolin or a turtle dove fully on screen (else any
  // fly-over), stepping on a few ticks at a time (bounded) until one is; fail on a sliver.
  let fly: Grab = rush;
  let bird: { x: number; y: number; creature: string } | undefined;
  const w0 = (await hook(page)).designWidth;
  for (let step = 0; step < 24 && bird === undefined; step++) {
    if (step > 0) {
      const t = (await hook(page)).tick + 6;
      if (t > INTRO + RUSH - 2) break;
      await holdAt(page, touch, t);
      fly = await grab(page);
    }
    const all = (await page.evaluate(() => window.__TM__?.harvestFlyovers ?? [])).filter(
      (b) => b.x > 110 && b.x < w0 - 110 && b.y > 90 && b.y < 900,
    );
    bird = all.find((b) => b.creature === 'fisant' || b.creature === 'tortelduif') ?? all[0];
  }
  if (bird === undefined) throw new Error('no fly-in fully on screen near the peak');
  const flyCrop = cut(fly, { x: bird.x - 100, y: bird.y - 80, w: 200, h: 160 });
  if (flyCrop.width < 20 * fly.k || flyCrop.height < 20 * fly.k)
    throw new Error(`the fly-in crop is a sliver (${String(flyCrop.width)} px)`);
  save('flyin-2x', info, scaled(flyCrop, 2));

  // The end: the fence whole, the animals running off.
  await holdAt(page, touch, INTRO + RUSH + 30);
  const end = await page.evaluate(() => (window as unknown as Hooked).__TM__?.harvest?.phase);
  if (end !== 'outro') throw new Error(`not in the outro (${String(end)})`);
  save('end', info, (await grab(page)).img);

  // The tally.
  await release(page);
  await page.waitForFunction(() => window.__TM__?.scene === 'tally', null, { timeout: 900_000 });
  // Review round 2: every row, the Best row, the stamp and the news are in.
  await page.waitForFunction(() => window.__TM__?.tallyDone === true, null, { timeout: 300_000 });
  await park(page, touch);
  await page.waitForTimeout(1000);
  save('tally', info, (await grab(page)).img);
});

test('the Harvest crops (Standard) and a baboon raider at the mielies', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await bootTitle(page, `baboonRaid=mielie&holdAt=${String(CROP_TICK)}`, 'standard');
  await startHarvest(page, info, 'standard');
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, CROP_TICK, {
    timeout: 900_000,
  });
  await park(page, touch);
  await page.waitForTimeout(1500);
  const g = await grab(page);
  save('crops-std', info, g.img);
  save('field-std-crop', info, cut(g, await fieldBox(page)));
  save('worker-std-crop', info, cut(g, await workerBox(page)));
  save('warthog-std-crop', info, cut(g, (await warthogBox(page)).box));

  // A raider at the mielies: wait for the raid in the sim, pan to it, wait for its act frame.
  await release(page);
  const start = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction(
    (until) => {
      const tm = (window as unknown as Hooked).__TM__;
      if (tm?.baboonRaid?.phase === 'on' && (tm.baboons ?? []).some((b) => b.role === 'raider'))
        return true;
      if ((tm?.tick ?? 0) > until) throw new Error(`no raid by tick ${String(until)}`);
      return false;
    },
    start + 60 * 25,
    { timeout: 900_000 },
  );
  const raiderX = async (): Promise<number | null> =>
    (await page.evaluate(() => (window as unknown as Hooked).__TM__?.baboons ?? [])).find(
      (b) => b.role === 'raider',
    )?.x ?? null;
  // Review round 1: the raider in the left third, clear of the gun barrel (pan so it stands a
  // quarter of the width from the left edge).
  const w4 = (await hook(page)).designWidth / 4;
  const offCentre = async (): Promise<number | null> => {
    const x = await raiderX();
    return x === null ? null : x + w4;
  };
  await panToX(page, touch, offCentre);
  const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
  await page.waitForFunction(
    (until) => {
      const tm = (window as unknown as Hooked).__TM__;
      const r = (tm?.baboons ?? []).find((b) => b.role === 'raider');
      if (r?.frame?.startsWith('mielie_') === true) {
        (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(
          (tm?.tick ?? 0) + 4,
        );
        return true;
      }
      if ((tm?.tick ?? 0) > until) throw new Error(`no mielie raid by tick ${String(until)}`);
      return false;
    },
    t0 + 60 * 20,
    { timeout: 900_000, polling: 'raf' },
  );
  await park(page, touch);
  await page.waitForTimeout(1500);
  const r = await grab(page);
  save('raid-mielie', info, r.img);
  const rd = (await page.evaluate(() => (window as unknown as Hooked).__TM__?.baboons ?? [])).find(
    (b) => b.role === 'raider' && b.visible,
  );
  if (rd === undefined) throw new Error('no raider on screen');
  const bh = 360 * scoring.planes.mid.scale;
  save(
    'raider-mielie-2x',
    info,
    scaled(cut(r, { x: rd.x - 150, y: rd.y - bh * 1.5, w: 300, h: bh * 1.5 + 30 }), 2),
  );
});

test('the Harvest in HD: the field, a warthog and the workers, Standard | HD', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await bootTitle(page, `baboonRaid=mielie&holdAt=${String(CROP_TICK)}`, 'hd');
  await startHarvest(page, info, 'hd');
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, CROP_TICK, {
    timeout: 900_000,
  });
  await park(page, touch);
  await page.waitForTimeout(2500);
  const g = await grab(page);
  save('crops-hd', info, g.img);
  const pairs: [string, Rgba, number][] = [
    ['field', cut(g, await fieldBox(page)), 2],
    ['worker', cut(g, await workerBox(page)), 3],
    ['warthog', cut(g, (await warthogBox(page)).box), 3],
  ];
  for (const [name, hd, n] of pairs) {
    const stdFile = fileOf(`${name}-std-crop`, info);
    if (!existsSync(stdFile))
      throw new Error('run the Standard crops test first (its crops pair with these)');
    save(`${name}-std-hd`, info, scaled(sideBySide(decodePng(readFileSync(stdFile)), hd), n));
  }
});
