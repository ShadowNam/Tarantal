// v1.7d Namibië veld life (D-059) previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v17d.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v17d-namibie-<shot>-<device>.png (palette PNG, ≤ 1600 px wide).
//
// The ground before | after: run this spec once on a main checkout with V17D_VARIANT=before
// (only the "ground" test runs; it saves the -before files), then on this branch: the ground test
// saves -after and, with both there, the before | after pair. Every other shot is this branch.
//
// Frames are held at a sim tick (?holdAt) found by running the same hunt in Node (no input, so
// the page plays it the same): the pair at the nest, a balloon in view, the oryx herd in view.
// The running pair uses an in-page watcher (taps beside them at a tick, then holds 18 ticks
// later). Standard | HD: the same held frame loaded with ?graphics=standard and ?graphics=hd,
// cropped to the same box (nothing moves: the camera is in the sim and the sim is held). The
// scope view is live (raising the sight needs the sim running); the herd moves 9 px a second.
// On desktop the real mouse rests at the bottom centre, never in the edge-pan bands.
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
import { withNoBirds } from '../../src/game/devContent';
import { createSim } from '../../src/sim/Sim';
import { planeToDx } from '../../src/sim/camera';
import { coreWidth } from '../../src/sim/world';
import type { ContentBundle } from '../../src/content/schemas';
import type { SimState } from '../../src/sim/types';
import { ORYX_ROAMS, roamAt } from '../../src/game/view/namib/oryxRoam';
import { boot, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
const VARIANT = process.env['V17D_VARIANT'] === 'before' ? 'before' : 'after';
const SEED = 42;
const SECONDS = 90;
/** No frame before this tick (the Namibië groups and the veld-life chunk are in). */
const EARLIEST = 420;
const FULL = loadContent();
const QUIET = withNoBirds(FULL);

type Layout = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const query = (layout: Layout, o: { birds?: boolean; hold?: number; gfx?: string } = {}): string =>
  `biome=namibie&layout=${layout}&seed=${SEED}&huntSeconds=${SECONDS}` +
  `&graphics=${o.gfx ?? 'standard'}${o.birds === false ? '&birds=0' : ''}` +
  `${o.hold === undefined ? '' : `&holdAt=${o.hold}`}`;

/** Runs the page's hunt in Node (no input) and returns the first tick ≥ `from` where `pred`
 *  holds, with that tick's snapshot. */
function findTick(
  content: ContentBundle,
  layout: Layout,
  pred: (s: SimState) => boolean,
  from = EARLIEST,
): { tick: number; state: SimState } {
  const sim = createSim({
    seed: SEED,
    content,
    mode: { id: 'classic', biome: 'namibie', layout, huntSeconds: SECONDS },
    inputKind: 'pointer',
  });
  for (let t = 0; t < SECONDS * 60; t++) {
    sim.step([]);
    sim.drainEvents();
    const s = sim.snapshot();
    if (s.tick >= from && pred(s)) return { tick: s.tick, state: s };
  }
  throw new Error(`namibie ${layout}: no tick for this frame`);
}

const midSf = FULL.scoring.planes.mid.scrollFactor;
const farSf = FULL.scoring.planes.far.scrollFactor;
/** A layer x's distance from the screen centre (design px) at the snapshot's camera. */
const dxOf = (s: SimState, sf: number, x: number): number => planeToDx(s.cameraX, sf, x);

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test gets 10 minutes or more.
  test.setTimeout(900_000);
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

function fileOf(name: string, info: TestInfo): string {
  return join(OUT, `v17d-namibie-${name}-${device(info.project.name)}.png`);
}

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

/** Two images side by side on a dark strip (a | b), each scaled to the same height. */
function sideBySide(a: Rgba, b: Rgba): Rgba {
  const h = Math.max(a.height, b.height);
  const out = blank(a.width + b.width + 8, h);
  for (let i = 0; i < out.data.length; i += 4) out.data.set([24, 22, 20, 255], i);
  blit(out, a, 0, 0);
  blit(out, b, a.width + 8, 0);
  return out;
}

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** Boots the query, starts the hunt and waits for the hold tick, the Namibië art and fonts. */
async function heldAt(page: Page, info: TestInfo, q: string, tick: number): Promise<void> {
  const touch = isTouchProject(info);
  await boot(page, q);
  await startHunt(page, touch);
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 600_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  // The veld-life chunk is in (a lazy area's first frames still show the title behind the veil).
  if (VARIANT === 'after')
    await page.waitForFunction(() => (window.__TM__?.namibLife?.veld ?? 0) > 0, null, {
      timeout: 120_000,
    });
  await park(page, touch);
  await page.waitForTimeout(2000);
}

async function grab(page: Page): Promise<{ img: Rgba; k: number }> {
  const img = decodePng(await page.locator('#game canvas').screenshot());
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  return { img, k: img.width / w };
}

/** A crop round design point (cx, cy), w × h design px, clamped to the image. */
function around(g: { img: Rgba; k: number }, cx: number, cy: number, w: number, h: number): Rgba {
  const x0 = Math.max(0, Math.round((cx - w / 2) * g.k));
  const y0 = Math.max(0, Math.round((cy - h / 2) * g.k));
  const x1 = Math.min(g.img.width, Math.round((cx + w / 2) * g.k));
  const y1 = Math.min(g.img.height, Math.round((cy + h / 2) * g.k));
  return crop(g.img, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}

/** The pair at the nest on Monday: both birds in view, the hen sitting, the cock standing. */
const PAIR = findTick(QUIET, 'mon', (s) => {
  const f = s.ostriches[0];
  if (f?.nest == null) return false;
  const sitting = f.birds.some((b) => b.pose === 'sit');
  const standing = f.birds.some((b) => b.pose === 'stand' || b.pose === 'look');
  return sitting && standing && f.birds.every((b) => Math.abs(dxOf(s, midSf, b.x)) < 600);
});

test('the ground: Namibië centre view and a near-ground close-up (before | after)', async ({
  page,
}, info) => {
  // Tuesday at midday with the mirage, birds on: what a player sees.
  await heldAt(page, info, query('tue', { hold: 600 }), 600);
  const g = await grab(page);
  const w = g.img.width / g.k;
  const centre = g.img;
  const near = around(g, w / 2, 900, 900, 340);
  save(`centre-${VARIANT}`, info, centre);
  save(`ground-near-${VARIANT}`, info, scaled(near, 2));
  if (VARIANT === 'before') return;
  // The full centre view of this branch, and before | after once both are there.
  save('centre', info, centre);
  for (const name of ['centre', 'ground-near']) {
    const b = fileOf(`${name}-before`, info);
    const a = fileOf(`${name}-after`, info);
    if (existsSync(b) && existsSync(a))
      save(
        `${name}-compare`,
        info,
        sideBySide(decodePng(readFileSync(b)), decodePng(readFileSync(a))),
      );
  }
});

test('the ostrich pair at the nest, a close-up and Standard | HD', async ({ page }, info) => {
  test.skip(VARIANT === 'before', 'this branch only');
  const t = PAIR.tick;
  await heldAt(page, info, query('mon', { birds: false, hold: t }), t);
  const life = await page.evaluate(() => window.__TM__?.namibLife ?? null);
  const os = life?.ostriches ?? [];
  expect(os.length).toBe(2);
  const g = await grab(page);
  save('ostriches-pair', info, g.img);
  const cx = os.reduce((s, o) => s + o.x, 0) / os.length;
  const foot = Math.max(...os.map((o) => o.y));
  const tall = Math.min(...os.map((o) => o.h));
  // A close-up where the smaller bird stands ≥ 120 px (the look round asks for it).
  const n = Math.max(2, Math.ceil(150 / (tall * g.k)));
  const box = { cx, cy: foot - tall * 0.55, w: 520, h: tall * 1.5 };
  const std = around(g, box.cx, box.cy, box.w, box.h);
  save('ostriches-closeup', info, scaled(std, n));
  // The same held frame in HD (2× art at half scale): same camera, same birds.
  await heldAt(page, info, query('mon', { birds: false, hold: t, gfx: 'hd' }), t);
  await page.waitForFunction(() => window.__TM__?.graphics.loading === 'done', null, {
    timeout: 300_000,
  });
  await page.waitForTimeout(2000);
  const hd = await grab(page);
  save(
    'ostriches-std-hd',
    info,
    scaled(sideBySide(std, around(hd, box.cx, box.cy, box.w, box.h)), 2),
  );
  // The ground cover (the veld sheet) close up, Standard | HD: the near sand in front.
  const w = g.img.width / g.k;
  save(
    'veld-std-hd',
    info,
    scaled(sideBySide(around(g, w / 2, 960, 560, 230), around(hd, w / 2, 960, 560, 230)), 2),
  );
});

test('the ostriches running from a nearby shot', async ({ page }, info) => {
  test.skip(VARIANT === 'before', 'this branch only');
  const touch = isTouchProject(info);
  const at = PAIR.tick;
  await boot(page, query('mon', { birds: false }));
  await startHunt(page, touch);
  // In-page watcher: at the pair's tick, tap the sand right of them; hold 18 ticks later.
  await page.evaluate(
    ({ at, isTouch }) => {
      const w = window as unknown as { __TM_HOLD_AT__?: (t: number) => void; __V17D__?: number };
      let frames = 0;
      const loop = (): void => {
        const g = window.__TM__;
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        // Bounded: never more than 20 000 frames (CI's software GL runs slow).
        if (++frames > 20_000) return;
        const os = g?.namibLife?.ostriches ?? [];
        if (g === undefined || canvas === null || g.tick < at || os.length === 0) {
          requestAnimationFrame(loop);
          return;
        }
        const x = Math.min(g.designWidth * 0.85, Math.max(...os.map((o) => o.x)) + 120);
        const y = Math.max(...os.map((o) => o.y)) - 4;
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (x / g.designWidth) * r.width,
          clientY: r.top + (y / g.designHeight) * r.height,
          pointerId: 977,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        w.__V17D__ = g.tick + 18;
        w.__TM_HOLD_AT__?.(g.tick + 18);
      };
      requestAnimationFrame(loop);
    },
    { at, isTouch: touch },
  );
  const h = await page.waitForFunction(
    () => (window as unknown as { __V17D__?: number }).__V17D__ ?? null,
    null,
    { timeout: 600_000 },
  );
  const hold = (await h.jsonValue()) as number;
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, hold, { timeout: 120_000 });
  await park(page, touch);
  await page.waitForTimeout(2000);
  const os = await page.evaluate(() => window.__TM__?.namibLife?.ostriches ?? []);
  expect(os.some((o) => o.pose.startsWith('run') || o.pose === 'hiss')).toBe(true);
  const g = await grab(page);
  save('ostriches-running', info, g.img);
  const cx = os.reduce((s, o) => s + o.x, 0) / Math.max(1, os.length);
  const foot = Math.max(...os.map((o) => o.y));
  save('ostriches-running-closeup', info, scaled(around(g, cx, foot - 110, 700, 260), 2));
});

/** Monday's dawn balloon, its middle within 500 px of the screen centre. */
const BALLOON = findTick(
  FULL,
  'mon',
  (s) => s.birds.some((b) => b.creature === 'lugballon' && Math.abs(dxOf(s, farSf, b.x)) < 500),
  EARLIEST,
);

test('a hot-air balloon drifting by, and its close-up', async ({ page }, info) => {
  test.skip(VARIANT === 'before', 'this branch only');
  const t = BALLOON.tick;
  await heldAt(page, info, query('mon', { hold: t }), t);
  const bs = await page.evaluate(() => window.__TM__?.namibLife?.balloons ?? []);
  expect(bs.length).toBeGreaterThan(0);
  const g = await grab(page);
  save('balloon', info, g.img);
  const b = bs[0];
  if (b === undefined) return;
  save('balloon-closeup', info, scaled(around(g, b.x, b.y + 10, 200, 180), 3));
});

/** Tuesday (the mirage on): the oryx herd within 450 px of the screen centre. */
function oryxTick(): number {
  const roam = ORYX_ROAMS['namibie']?.[0];
  if (roam === undefined) throw new Error('no oryx');
  const core = coreWidth(farSf);
  return findTick(QUIET, 'tue', (s) => {
    const at = roamAt(roam, s.tick / 60, core);
    return Math.abs(dxOf(s, farSf, at.x)) < 450;
  }).tick;
}

test('the oryx in the mirage, and through the Langloop scope', async ({ page }, info) => {
  test.skip(VARIANT === 'before', 'this branch only');
  const touch = isTouchProject(info);
  // The Langloop with its variable scope (a returning player who has it).
  await page.addInitScript(() => {
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        settings: { quality: 'high' },
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'langloop', sights: { langloop: 'scope_var' } },
        unlocks: { weapons: ['twee_twee', 'langloop'], sights: [] },
        bestRank: 'bosveldjagter',
      }),
    );
  });
  const t = oryxTick();
  await heldAt(page, info, query('tue', { birds: false, hold: t }), t);
  const life = await page.evaluate(() => window.__TM__?.namibLife ?? null);
  const herd = life?.oryx[0];
  expect(herd).toBeDefined();
  const g = await grab(page);
  save('oryx-mirage', info, g.img);
  if (herd !== undefined)
    save('oryx-mirage-closeup', info, scaled(around(g, herd.screenX, 600, 520, 110), 3));
  // Live (the sight rises on sim time): the same hunt, the scope raised on the herd.
  await boot(page, query('tue', { birds: false }));
  await startHunt(page, touch);
  await page.waitForFunction((tt) => (window.__TM__?.tick ?? 0) >= tt, t, { timeout: 600_000 });
  const x = await page.evaluate(() => window.__TM__?.namibLife?.oryx[0]?.screenX ?? 960);
  await page.evaluate(
    ([dx, isTouch]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const g = window.__TM__;
      if (canvas === null || g === undefined) throw new Error('no game');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: isTouch ? 141 : 1,
          pointerType: isTouch ? 'touch' : 'mouse',
          button: 0,
          buttons: 1,
          clientX:
            r.left + (Math.min(g.designWidth - 300, Math.max(300, dx)) / g.designWidth) * r.width,
          clientY: r.top + (585 / g.designHeight) * r.height,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [x, touch] as const,
  );
  await page.waitForFunction(
    () => {
      const z = window.__TM__?.zoom;
      return z !== undefined && z.raise >= 1;
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1500);
  save('oryx-scope', info, (await grab(page)).img);
});
