// v1.18 (D-081) Die Oes: the raid down the koppie, the small hole and Phase 2 "Defend the field",
// previews on demand (not part of the regular suite; playwright.config.ts ignores art-preview
// specs unless ART_PREVIEW=1):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-harvest2.spec.ts --project=desktop-chromium
// Writes docs/art-preview/compare/v118-harvest-<shot>-<device>.png (palette PNG ≤ 1600 px wide):
//   raid-down, raid-down-2x: a raider scrambling down the koppie (?harvestShots=1: a raid at once,
//     30 s down the koppie);
//   raid-dash, raid-dash-2x: a raider dashing into the rows;
//   hole, hole-2x: the small hole with a piglet squeezing through it (?harvestShots=1: yearlings
//     with a piglet every few seconds, slow in the hole);
//   p2-banner: Phase 2's banner (?harvestPhase2=1: the hunt starts with it);
//   p2-jump, p2-jump-2x: a warthog in mid-jump over the intact fence;
//   p2-fence, p2-fence-2x: a baboon on the fence;
//   p2-hud: the HUD with "Animals left" and Phase 2's clock (phones too);
//   p2-tally: the Harvest tally with the Phase 2 lines (?harvestPhase2Seconds=10);
//   p2-std-hd: the Phase 2 sheet, Standard | HD (the HD boot crops the same held tick and rect as
//     the Standard one; the sheet has no HD twin, so both draw its 1× file).
// Boots: desktop 3 (the rush, Phase 2, Phase 2 in HD); Pixel 7 and iPhone 14 one (Phase 2: the
// banner, the HUD, the tally). Every grab holds the sim (__TM_HOLD_AT__ or ?holdAt); the far herds
// are still (?faunaIdle=0); on desktop the mouse rests at the bottom centre, outside the edge-pan
// bands. A shot that is missing fails the test (bounded attempts).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';
import modes from '../../content/modes.json' with { type: 'json' };
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { hook, isTouchProject, tapRect } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const SAVE = 'tm.e2e.save.v1';
const H = modes.modes.harvest;
const BANNER = Math.round(H.phase2.bannerSeconds * 60);
/** The Phase 2 sheet's frames (src/game/view/harvest/harvest2Sheet.ts). */
const JUMP = ['wh_jump_a', 'wh_jump_b'];
const CLIMB = ['bb_climb_a', 'bb_climb_b', 'bb_drop'];
const P2_FLAGS = 'harvestPhase2=1&harvestPhase2Seconds=10';
const PAIR = join(OUT, 'v118-harvest-p2-std-crop.json');

test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'default' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
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

const desktopOnly = (info: TestInfo): void => {
  test.skip(device(info.project.name) !== 'desktop-chromium', 'desktop only (short on phones)');
};

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(
    join(OUT, `v118-harvest-${name}-${device(info.project.name)}.png`),
    encodePng8(out),
  );
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

async function bootTitle(page: Page, q: string, gfx: 'standard' | 'hd'): Promise<void> {
  await page.goto(`/?e2e=1&feesdag=none&ftue=0&seed=42&faunaIdle=0&${q}&graphics=${gfx}`);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 300_000 });
  await page.waitForFunction(() => window.__TM__?.rects['harvest'] !== undefined, null, {
    timeout: 300_000,
  });
}

/** Taps Die Oes; waits until the Harvest runs on its map with its sheet drawn. */
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
      return (
        tm?.scene === 'hunt' &&
        tm.biome === 'oes' &&
        tm.menu !== 'hdLoading' &&
        tm.graphics.loading !== 'loading' &&
        layers.length > 0 &&
        layers.every((b) => b.key.startsWith('layer:oes/')) &&
        (tm.harvestActors ?? []).some((a) => a.role === 'gap' && a.visible && a.frame !== null)
      );
    },
    null,
    { timeout: 600_000 },
  );
  await park(page, touch);
}

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
}

async function grab(page: Page): Promise<Grab> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  return { img, k: img.height / h.designHeight };
}

type Box = { x: number; y: number; w: number; h: number };
function cut(g: Grab, r: Box): Rgba {
  const x0 = Math.max(0, Math.round(r.x * g.k));
  const y0 = Math.max(0, Math.round(r.y * g.k));
  const x1 = Math.min(g.img.width, Math.round((r.x + r.w) * g.k));
  const y1 = Math.min(g.img.height, Math.round((r.y + r.h) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** Pans (A/D, short presses) until `where()` is near the centre, or on screen with a margin once a
 *  press overshoots it or the camera stops at the panorama's end (bounded). */
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

/** A baboon hook entry (the ridge, the raiders, the descenders). */
async function baboon(
  page: Page,
  pick: (b: { role: string; frame: string | null; visible: boolean }) => boolean,
): Promise<{ x: number; y: number; frame: string | null; visible: boolean } | null> {
  const all = await page.evaluate(() => window.__TM__?.baboons ?? []);
  return all.find(pick) ?? null;
}

/** Steps the held sim on `step` ticks at a time (bounded) until `found()` returns a box. */
async function stepUntil<T>(
  page: Page,
  touch: boolean,
  from: number,
  step: number,
  max: number,
  found: () => Promise<T | null>,
  what: string,
): Promise<{ at: number; got: T }> {
  let t = from;
  for (let i = 0; i < max; i++) {
    const got = await found();
    if (got !== null) return { at: t, got };
    t += step;
    await holdAt(page, touch, t);
  }
  throw new Error(`no ${what} within ${String(max)} steps of ${String(step)} ticks`);
}

test('the rush: the raid down the koppie, the dash for the rows, the small hole', async ({
  page,
}, info) => {
  desktopOnly(info);
  const touch = isTouchProject(info);
  await bootTitle(page, 'harvestShots=1', 'standard');
  await startHarvest(page, info, 'standard');
  // The raid comes at once (?harvestShots=1) and takes 30 s down the koppie: pan to it running.
  await page.waitForFunction(
    () => (window.__TM__?.baboons ?? []).some((b) => b.role === 'descender'),
    null,
    { timeout: 600_000 },
  );
  await panToX(
    page,
    touch,
    async () => (await baboon(page, (b) => b.role === 'descender'))?.x ?? null,
  );
  let tick = (await hook(page)).tick + 2;
  await holdAt(page, touch, tick);
  const down = await baboon(
    page,
    (b) => b.role === 'descender' && b.visible && (b.frame ?? '').startsWith('r_climb'),
  );
  if (down === null) throw new Error('no raider climbing down the koppie on screen');
  let g = await grab(page);
  save('raid-down', info, g.img);
  save(
    'raid-down-2x',
    info,
    scaled(cut(g, { x: down.x - 120, y: down.y - 120, w: 240, h: 160 }), 3),
  );

  // On down: the run across the veld, then the dash. Follow it, then step to the dash.
  await release(page);
  await page.waitForFunction(
    () =>
      (window.__TM__?.baboons ?? []).some(
        (b) => b.role === 'descender' && (b.frame ?? '').startsWith('run'),
      ),
    null,
    { timeout: 900_000 },
  );
  // The dash (slowed by ?harvestShots=1 so a pan can follow it): pan to the raider, then hold.
  await page.waitForFunction(
    () => (window.__TM__?.baboons ?? []).some((b) => b.role === 'raider'),
    null,
    { timeout: 900_000 },
  );
  await panToX(
    page,
    touch,
    async () => (await baboon(page, (b) => b.role === 'raider'))?.x ?? null,
  );
  tick = (await hook(page)).tick + 2;
  const dash = await stepUntil(
    page,
    touch,
    tick,
    6,
    20,
    async () =>
      await baboon(
        page,
        (b) => b.role === 'raider' && b.visible && (b.frame ?? '').startsWith('run'),
      ),
    'raider dashing into the rows',
  );
  g = await grab(page);
  save('raid-dash', info, g.img);
  save(
    'raid-dash-2x',
    info,
    scaled(cut(g, { x: dash.got.x - 160, y: dash.got.y - 200, w: 320, h: 230 }), 2),
  );

  // The small hole: pan to it, then step until a piglet squeezes through.
  await release(page);
  const holeX = async (): Promise<number | null> =>
    (await hook(page)).harvestActors?.find((a) => a.role === 'hole')?.x ?? null;
  await panToX(page, touch, holeX);
  tick = (await hook(page)).tick;
  const hole = await stepUntil(
    page,
    touch,
    tick,
    10,
    120,
    async () => {
      const as = (await hook(page)).harvestActors ?? [];
      const p = as.find((a) => a.role === 'piglet' && a.visible && a.frame === 'pg_squeeze');
      return p ?? null;
    },
    'piglet squeezing through the small hole',
  );
  g = await grab(page);
  save('hole', info, g.img);
  save(
    'hole-2x',
    info,
    scaled(cut(g, { x: hole.got.x - 170, y: hole.got.y - 200, w: 340, h: 240 }), 2),
  );
});

/** Phase 2 from its banner: the shots, the HUD and the tally; `crops` also writes the Standard
 *  crop the HD boot pairs with. */
async function phase2Shots(page: Page, info: TestInfo, gfx: 'standard' | 'hd'): Promise<void> {
  const touch = isTouchProject(info);
  const desktop = device(info.project.name) === 'desktop-chromium';
  await bootTitle(page, `${P2_FLAGS}&holdAt=${String(BANNER - 40)}`, gfx);
  await startHarvest(page, info, gfx);
  await holdAt(page, touch, BANNER - 40);
  if (gfx === 'hd') {
    // The HD crop at the Standard boot's tick and rect (same seed, no pan).
    if (!existsSync(PAIR)) throw new Error('run the Standard Phase 2 test first');
    const p = JSON.parse(readFileSync(PAIR, 'utf8')) as { at: number; box: Box; file: string };
    await holdAt(page, touch, p.at);
    const g = await grab(page);
    const std = decodePng(readFileSync(p.file));
    save('p2-std-hd', info, sideBySide(scaled(std, 2), scaled(cut(g, p.box), 2)));
    return;
  }
  await page.waitForFunction(() => (window.__TM__?.phase2Hud?.banner ?? '') !== '', null, {
    timeout: 300_000,
  });
  save('p2-banner', info, (await grab(page)).img);
  // A warthog in mid-jump (desktop also crops it).
  const actor = async (frames: readonly string[]) => {
    const h = await hook(page);
    return (
      (h.harvestActors ?? []).find(
        (a) =>
          a.visible &&
          a.frame !== null &&
          frames.includes(a.frame) &&
          a.x > 200 &&
          a.x < h.designWidth - 200,
      ) ?? null
    );
  };
  const jump = await stepUntil(page, touch, BANNER - 40, 6, 160, () => actor(JUMP), 'warthog jump');
  let g = await grab(page);
  save('p2-jump', info, g.img);
  const jbox = { x: jump.got.x - 200, y: jump.got.y - 260, w: 400, h: 300 };
  if (desktop) {
    save('p2-jump-2x', info, scaled(cut(g, jbox), 2));
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, 'v118-harvest-p2-std-crop.png');
    writeFileSync(file, encodePng8(cut(g, jbox)));
    writeFileSync(PAIR, JSON.stringify({ at: jump.at, box: jbox, file }));
  }
  // A baboon on the fence.
  const fence = await stepUntil(
    page,
    touch,
    jump.at,
    4,
    300,
    () => actor(CLIMB),
    'baboon on the fence',
  );
  g = await grab(page);
  save('p2-fence', info, g.img);
  if (desktop)
    save(
      'p2-fence-2x',
      info,
      scaled(cut(g, { x: fence.got.x - 170, y: fence.got.y - 240, w: 340, h: 280 }), 2),
    );
  // The HUD with animals in the field (a second on).
  await holdAt(page, touch, fence.at + 60);
  await page.waitForFunction(() => window.__TM__?.phase2Hud?.visible === true, null, {
    timeout: 120_000,
  });
  save('p2-hud', info, (await grab(page)).img);
  // On to the tally (its clock is 10 s).
  await release(page);
  await page.waitForFunction(
    () => window.__TM__?.scene === 'tally' && (window.__TM__.tallyRows?.length ?? 0) > 0,
    null,
    { timeout: 900_000 },
  );
  await page.waitForTimeout(4000);
  save('p2-tally', info, decodePng(await page.screenshot()));
}

test('Phase 2: the banner, a jump, a baboon on the fence, the HUD, the tally', async ({
  page,
}, info) => {
  await phase2Shots(page, info, 'standard');
});

test('Phase 2 in HD: the Phase 2 sheet, Standard | HD', async ({ page }, info) => {
  desktopOnly(info);
  await phase2Shots(page, info, 'hd');
});
