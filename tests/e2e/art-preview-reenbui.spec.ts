// v1.10 (D-067) Reënbui previews, on demand (not part of the regular suite; playwright.config.ts
// ignores art-preview specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-reenbui.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v110-reenbui-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   buildup: the storm towers rolling in, the land dimming (held 4 s into the build-up);
//   drops: the first fat drops, dust puffs, the ground darkening (held 1.6 s into the drops);
//   swarm: the alate columns up, the rain, flocks feeding (?reenbuiPhase=swarm, held 7 s in);
//   column-2x: a column close up with the birds feeding at it (a 2× crop);
//   after: the clearing sky, the towers rolling out, the wet ground drying (?reenbuiPhase=after);
//   columns-std-hd: Standard | HD crop of a column and the rain (the HD boot pairs its crop with the
//     Standard boot's columns-std-crop: same seed, same held tick, no pan; the sheet is Standard in
//     HD, so the two should match apart from the land around it).
// Four boots per device, each test short (≤ ~12 min on software GL, lesson 23): Kalahari Classic
// (no omen: the event's own storm), ?reenbui=1 (the build-up 2 s in), baboons off. Every grab holds
// the sim (__TM_HOLD_AT__) on a fresh frame; the far herds are still (?faunaIdle=0). On desktop the
// real mouse rests at the bottom centre, outside both edge-pan bands. A missing shot fails the test.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const Q = 'biome=kalahari-summer&layout=none&seed=11&huntSeconds=120&baboons=0&reenbui=1&omen=0';
/** The swarm boots' held tick for the wide shot and the Standard | HD crops: 7 s into the swarm
 *  (the same flags in both boots give the same swarm tick). */
const SWARM_HOLD = 7 * 60;

async function swarmTick(page: Page): Promise<number> {
  const v = await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbui ?? null);
  if (v === null) throw new Error('no Reënbui in this hunt');
  return v.swarmTick + SWARM_HOLD;
}

test.use({ serviceWorkers: 'block' });
// In order, in one worker: the HD test pairs its crop with the Standard swarm test's.
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
  join(OUT, `v110-reenbui-${name}-${device(info.project.name)}.png`);

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

interface Column {
  readonly id: number;
  readonly plane: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly alpha: number;
}
type Hooked = {
  __TM__?: {
    tick: number;
    sceneryFrames: number;
    reenbui?: {
      phase: string | null;
      buildupTick: number;
      dropsTick: number;
      swarmTick: number;
      easingTick: number;
      endTick: number;
    } | null;
    reenbuiDraw?: {
      sheet: boolean;
      columns: Column[];
      rainNear: number;
      clouds: number;
      puffs: number;
      wet: number;
    } | null;
    flockSpots: { id: number; x: number; y: number; alive: number; feeding?: boolean }[];
  };
};

/** Boots the title and starts a Classic hunt with the event (Standard or HD); waits until it runs
 *  on the Kalahari with the event's sheet in. */
async function startHunt(
  page: Page,
  info: TestInfo,
  extra: string,
  gfx: 'standard' | 'hd',
): Promise<void> {
  const touch = isTouchProject(info);
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&faunaIdle=0&${Q}${extra}&graphics=${gfx}`);
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
      const h = (window as unknown as Hooked).__TM__;
      return (
        tm?.scene === 'hunt' &&
        tm.biome === 'kalahari-summer' &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        h?.reenbui !== null &&
        h?.reenbui !== undefined &&
        h.reenbuiDraw?.sheet === true
      );
    },
    null,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

/** Holds the sim at tick `at`, waits until it is there and a fresh frame is drawn (lesson 28). */
async function holdAt(page: Page, touch: boolean, at: number): Promise<void> {
  await page.evaluate((t) => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
  }, at);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 900_000 });
  await park(page, touch);
  const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
  await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 3, f0, {
    timeout: 120_000,
  });
  await page.waitForTimeout(1000);
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

/** The box round the column nearest the screen's middle on the mid plane (a feeding flock beside
 *  it when there is one), clear of the screen's edges. */
async function columnBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const w = (await hook(page)).designWidth;
  const cols = (
    await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbuiDraw?.columns ?? [])
  )
    .filter((c) => c.visible && c.x > 260 && c.x < w - 260)
    .sort(
      (a, b) =>
        (a.plane === 'mid' ? 0 : 1) - (b.plane === 'mid' ? 0 : 1) ||
        Math.abs(a.x - w / 2) - Math.abs(b.x - w / 2),
    );
  const c = cols[0];
  if (c === undefined) throw new Error('no alate column on screen');
  // The whole column (~430 px tall on the mid plane, by plane scale on the far one) and the birds
  // feeding at its foot; clear of the top of the screen.
  const tall = c.plane === 'mid' ? 460 : 180;
  const top = Math.max(10, c.y - tall);
  return { x: c.x - 260, y: top, w: 520, h: c.y - top + 70 };
}

test('Reënbui: the build-up and the first drops', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await startHunt(page, info, '', 'standard');
  const v = await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbui ?? null);
  if (v === null) throw new Error('no Reënbui in this hunt');
  await holdAt(page, touch, v.buildupTick + 4 * 60);
  const b = await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbuiDraw ?? null);
  if ((b?.clouds ?? 0) === 0) throw new Error('the storm towers are not drawn');
  save('buildup', info, (await grab(page)).img);
  await release(page);
  await holdAt(page, touch, v.dropsTick + 96);
  const d = await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbuiDraw ?? null);
  if ((d?.rainNear ?? 0) === 0) throw new Error('the first drops are not drawn');
  save('drops', info, (await grab(page)).img);
});

test('Reënbui: the swarm, flocks feeding at a column (wide and close up), the Standard crop', async ({
  page,
}, info) => {
  const touch = isTouchProject(info);
  await startHunt(page, info, '&reenbuiPhase=swarm', 'standard');
  await holdAt(page, touch, await swarmTick(page));
  const s = await page.evaluate(() => {
    const tm = (window as unknown as Hooked).__TM__;
    return {
      phase: tm?.reenbui?.phase ?? null,
      cols: (tm?.reenbuiDraw?.columns ?? []).filter((c) => c.visible).length,
      feeding: (tm?.flockSpots ?? []).filter((f) => f.feeding === true).length,
    };
  });
  if (s.phase !== 'swarm' || s.cols === 0) throw new Error(`no swarm drawn (${JSON.stringify(s)})`);
  const g = await grab(page);
  save('swarm', info, g.img);
  const box = await columnBox(page);
  const c = cut(g, box);
  save('column-2x', info, scaled(c, 2));
  save('columns-std-crop', info, c);
});

test('Reënbui: after the rain — the clearing sky, the ground drying', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await startHunt(page, info, '&reenbuiPhase=after', 'standard');
  const v = await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbui ?? null);
  if (v === null) throw new Error('no Reënbui in this hunt');
  await holdAt(page, touch, v.endTick + 50);
  const d = await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbuiDraw ?? null);
  if ((d?.wet ?? 0) === 0) throw new Error('the wet ground is not drawn');
  save('after', info, (await grab(page)).img);
});

test('Reënbui in HD: a column and the rain, Standard | HD', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const stdFile = fileOf('columns-std-crop', info);
  if (!existsSync(stdFile)) throw new Error('run the Standard swarm test first (its crop)');
  await startHunt(page, info, '&reenbuiPhase=swarm', 'hd');
  await holdAt(page, touch, await swarmTick(page));
  const g = await grab(page);
  const hd = cut(g, await columnBox(page));
  const std = decodePng(readFileSync(stdFile));
  const n = Math.max(1, Math.floor(1600 / (std.width * 2 + 12)));
  save('columns-std-hd', info, scaled(sideBySide(std, hd), n));
});
