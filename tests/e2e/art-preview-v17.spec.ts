// v1.7 meerkat colonies (D-044) previews, on demand (not part of the regular suite):
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview-v17.spec.ts --project=desktop-chromium
// One profile at a time (desktop, Pixel 7, iPhone 14 landscape). Writes
// docs/art-preview/compare/v17-meerkats-<shot>-<device>.png (the whole view) and
// v17-meerkats-<shot>-closeup-<device>.png (round the meerkat, 2×), palette PNG ≤ 1600 px wide.
//
// Monday's map opens with both colonies on screen in either desert (no panning), seed 42. Until
// the first shot a colony depends only on the seed and the map, so the spec runs the same hunt in
// Node to find the tick of each pose (a peek, the sentinel on its mound, a dash's halfway stop, a
// Namibië colony) and holds the page there (?holdAt). The shot frames (the dive, the scold, the
// Familiefoto) use an in-page rAF watcher: it taps at a set tick, and the page's hold tick
// (__TM_HOLD_AT__) freezes the sim right after. Everything that moves is on sim time, so a held
// frame holds. On desktop the real mouse rests at the bottom centre (never in the edge-pan bands).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blank, crop, decodePng, encodePng8, resize, type Rgba } from '../../tools/assets/image';
import { loadContent } from '../../tools/testContent';
import { withNoBirds } from '../../src/game/devContent';
import { createSim } from '../../src/sim/Sim';
import type { ColonyView, SimState } from '../../src/sim/types';
import { boot, isTouchProject, startHunt } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'compare');
const PROFILES = ['desktop-chromium', 'pixel7-landscape', 'iphone14-landscape'];
/** The device name of a project (a local Chromium stand-in for WebKit keeps the device's). */
const device = (name: string): string => name.replace(/-chromium-fallback$/, '');
/** Seed 33: Monday's near colony has a pup in both deserts. */
const SEED = 33;
const SECONDS = 60;
/** As the page's ?birds=0: no birds or world events, so the meerkats are the subject. */
const CONTENT = withNoBirds(loadContent());
/** No frame before this tick (the desert art group has loaded and the view has settled). */
const EARLIEST = 420;

type Biome = 'kalahari-summer' | 'namibie';
const query = (biome: Biome, hold?: number): string =>
  `seed=${SEED}&huntSeconds=${SECONDS}&biome=${biome}&layout=mon&birds=0${hold === undefined ? '' : `&holdAt=${hold}`}`;

const OUT_POSES = ['sit', 'forage', 'sunbathe', 'sentinel'];

/** Runs the page's hunt in Node (no commands) and returns the first tick ≥ `from` where `pred`
 *  holds, with that tick's snapshot. */
function findTick(
  biome: Biome,
  pred: (s: SimState) => boolean,
  from = EARLIEST,
): { tick: number; state: SimState } {
  const sim = createSim({
    seed: SEED,
    content: CONTENT,
    mode: { id: 'classic', biome, layout: 'mon', huntSeconds: SECONDS },
    inputKind: 'pointer',
  });
  for (let t = 0; t < SECONDS * 60; t++) {
    sim.step([]);
    sim.drainEvents();
    const s = sim.snapshot();
    if (s.tick >= from && pred(s)) return { tick: s.tick, state: s };
  }
  throw new Error(`${biome}: no tick for this pose`);
}

const colonyOn = (s: SimState, plane: 'near' | 'mid'): ColonyView | undefined =>
  s.meerkats.find((c) => c.plane === plane);

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(device(info.project.name)), 'previews: desktop, Pixel 7, iPhone 14');
  // Software GL is slow: each test is small, but gets 10 minutes.
  test.setTimeout(600_000);
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

function save(name: string, info: TestInfo, img: Rgba): void {
  mkdirSync(OUT, { recursive: true });
  let out = img;
  if (out.width > 1600) out = resize(out, 1600, Math.round((out.height * 1600) / out.width));
  writeFileSync(
    join(OUT, `v17-meerkats-${name}-${device(info.project.name)}.png`),
    encodePng8(out),
  );
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

/** A meerkat's standing height in design px: near colonies stand on y ≈ 966, mid on 812. */
const tallPx = (y: number): number => (y > 900 ? 127 : 64);
/** Close-ups show every meerkat at least this tall (the look round asks for ≥ 120 px). */
const CLOSE_TALL = 150;

/** Desktop: the real mouse rests at the bottom centre, outside both edge-pan bands. */
async function park(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

/** Waits for the hold tick and the fonts; parks the mouse; lets a few frames draw. */
async function held(page: Page, touch: boolean, tick: number): Promise<void> {
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, tick, { timeout: 420_000 });
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await park(page, touch);
  await page.waitForTimeout(1500);
}

/** The tick the watcher held the sim at, once it has set it. */
async function watchedHold(page: Page): Promise<number> {
  const h = await page.waitForFunction(
    () => (window as unknown as { __V17_HOLD__?: number }).__V17_HOLD__ ?? null,
    null,
    { timeout: 480_000 },
  );
  return (await h.jsonValue()) as number;
}

/** The whole view, and a 2× close-up round a meerkat (or a colony) of the held frame. */
async function shoot(
  page: Page,
  info: TestInfo,
  name: string,
  focus: (m: {
    id: number;
    colony: string;
    pose: string;
    pup: boolean;
    x: number;
    y: number;
  }) => boolean,
  halfW = 240,
): Promise<void> {
  const shot = decodePng(await page.locator('#game canvas').screenshot());
  const g = await page.evaluate(() => ({
    w: window.__TM__?.designWidth ?? 1920,
    h: window.__TM__?.designHeight ?? 1080,
    meerkats: window.__TM__?.meerkats ?? [],
  }));
  save(name, info, shot);
  const picked = g.meerkats.filter(focus);
  if (picked.length === 0) return;
  const cx = picked.reduce((t, m) => t + m.x, 0) / picked.length;
  const ground = Math.max(...picked.map((m) => m.y));
  const k = shot.width / g.w;
  // Zoom so the smallest picked meerkat stands ≥ CLOSE_TALL px, and the crop fits 1600 px.
  const tall = Math.min(...picked.map((m) => tallPx(m.y)));
  const n = Math.max(2, Math.ceil(CLOSE_TALL / (tall * k)));
  const half = Math.min(halfW, 1600 / n / k / 2);
  const x0 = Math.max(0, Math.round((cx - half) * k));
  const x1 = Math.min(shot.width, Math.round((cx + half) * k));
  const y0 = Math.max(0, Math.round((ground - tall * 1.6) * k));
  const y1 = Math.min(shot.height, Math.round((ground + tall * 0.4) * k));
  save(`${name}-closeup`, info, scaled(crop(shot, x0, y0, x1 - x0, y1 - y0), n));
}

/**
 * In-page watcher: when the sim reaches `at`, taps the design point `where()` picks (run in the
 * page, from the hook), then holds the sim `holdAfter` ticks later (or when `until` is in the
 * meerkat log, `holdAfter` ticks after that). Resolves nothing; the test waits on the hook.
 */
async function watch(
  page: Page,
  touch: boolean,
  o: {
    at: number;
    target: 'sky' | 'beside' | { id: number };
    holdAfter: number;
    until?: string;
  },
): Promise<void> {
  await page.evaluate(
    ({ at, target, holdAfter, until, isTouch }) => {
      const w = window as unknown as {
        __TM_HOLD_AT__?: (t: number) => void;
        __V17_HOLD__?: number;
      };
      const hold = (t: number): void => {
        w.__V17_HOLD__ = t;
        w.__TM_HOLD_AT__?.(t);
      };
      let tapped = false;
      const loop = (): void => {
        const g = window.__TM__;
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (g === undefined || canvas === null) {
          requestAnimationFrame(loop);
          return;
        }
        if (!tapped && g.tick >= at) {
          let x = g.designWidth * 0.8;
          let y = g.designHeight * 0.1;
          if (target === 'beside') {
            // The colony on screen nearest the centre (Monday's mid colony opens off a 16:9
            // screen, beyond the weaver tree; the near one is in view).
            const onScreen = g.meerkats.filter((n) => n.x > 0 && n.x < g.designWidth);
            const centre = onScreen.sort(
              (a, b) => Math.abs(a.x - g.designWidth / 2) - Math.abs(b.x - g.designWidth / 2),
            )[0]?.colony;
            const mid = g.meerkats.filter((m) => m.colony === centre);
            x = Math.min(g.designWidth * 0.85, Math.max(...mid.map((m) => m.x)) + 150);
            y = Math.max(...mid.map((m) => m.y)) - 170;
          } else if (typeof target === 'object') {
            const m = g.meerkats.find((n) => n.id === target.id);
            if (m !== undefined) {
              x = m.aimX;
              y = m.aimY;
            }
          }
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + (x / g.designWidth) * r.width,
            clientY: r.top + (y / g.designHeight) * r.height,
            pointerId: 917,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          tapped = true;
          if (until === undefined) {
            hold(g.tick + holdAfter);
            return;
          }
        }
        if (tapped && until !== undefined && g.meerkatLog.includes(until)) {
          hold(g.tick + holdAfter);
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    { ...o, isTouch: touch },
  );
}

// --- held frames found in Node ----------------------------------------------------------------

test('a peek', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const { tick, state } = findTick('kalahari-summer', (s) => {
    const c = colonyOn(s, 'near');
    return c?.meerkats.some((m) => m.pose === 'peek' && m.look < 0 && m.poseTicks >= 8) === true;
  });
  const id = colonyOn(state, 'near')?.meerkats.find((m) => m.pose === 'peek')?.id;
  await boot(page, query('kalahari-summer', tick));
  await startHunt(page, touch);
  await held(page, touch, tick);
  await shoot(page, info, 'peek', (m) => m.id === id, 160);
});

test('the sentinel on its mound', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const { tick, state } = findTick('kalahari-summer', (s) =>
    s.meerkats.some((c) => c.meerkats.some((m) => m.pose === 'sentinel' && m.poseTicks >= 30)),
  );
  const colony = state.meerkats.find((c) => c.meerkats.some((m) => m.pose === 'sentinel'))?.id;
  await boot(page, query('kalahari-summer', tick));
  await startHunt(page, touch);
  await held(page, touch, tick);
  await shoot(page, info, 'sentinel', (m) => m.colony === colony, 260);
  const h = await page.evaluate(() => window.__TM__?.meerkats.map((m) => m.pose) ?? []);
  expect(h).toContain('sentinel');
});

test('a dash between burrows', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // Mid-dash: at least two adults of one colony running in a line, tails up.
  const running = (c: ColonyView): number =>
    c.meerkats.filter((m) => !m.pup && m.pose === 'run' && m.poseTicks >= 6).length;
  const { tick, state } = findTick('kalahari-summer', (s) =>
    s.meerkats.some((c) => running(c) >= 2),
  );
  const colony = state.meerkats.find((c) => running(c) >= 2)?.id;
  await boot(page, query('kalahari-summer', tick));
  await startHunt(page, touch);
  await held(page, touch, tick);
  await shoot(page, info, 'dash', (m) => m.colony === colony && m.pose === 'run', 300);
  const poses = await page.evaluate(() => window.__TM__?.meerkats.map((m) => m.pose) ?? []);
  expect(poses.filter((p) => p === 'run').length).toBeGreaterThanOrEqual(2);
});

test('the sentinel and the pup, close up', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // The near colony (the biggest on screen): a sentinel standing tall and the pup sitting.
  const { tick } = findTick('kalahari-summer', (s) => {
    const c = colonyOn(s, 'near');
    return (
      c?.meerkats.some((m) => m.pose === 'sentinel' && m.poseTicks >= 20) === true &&
      c.meerkats.some((m) => m.pup && m.pose === 'sit')
    );
  });
  await boot(page, query('kalahari-summer', tick));
  await startHunt(page, touch);
  await held(page, touch, tick);
  await shoot(
    page,
    info,
    'sentinel-pup',
    (m) => m.y > 900 && (m.pose === 'sentinel' || (m.pup && m.pose === 'sit')),
    220,
  );
});

test('a Namibië colony', async ({ page }, info) => {
  const touch = isTouchProject(info);
  const { tick } = findTick('namibie', (s) =>
    s.meerkats.every((c) => c.meerkats.filter((m) => OUT_POSES.includes(m.pose)).length >= 3),
  );
  await boot(page, query('namibie', tick));
  await startHunt(page, touch);
  await held(page, touch, tick);
  await shoot(page, info, 'namibie', (m) => m.y < 900, 320);
});

// --- frames after a shot (in-page watcher) -----------------------------------------------------

test('the dive after a shot', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // A moment with the mid colony mostly out, 40 ticks before the frame.
  const { tick } = findTick(
    'kalahari-summer',
    (s) =>
      (colonyOn(s, 'mid')?.meerkats.filter((m) => OUT_POSES.includes(m.pose)).length ?? 0) >= 4,
    EARLIEST + 60,
  );
  await boot(page, query('kalahari-summer'));
  await startHunt(page, touch);
  await park(page, touch);
  // The shot lands in the sand beside the burrows; the frame is ~10–25 ticks later.
  await watch(page, touch, { at: tick, target: 'beside', holdAfter: 10, until: 'dived:shot' });
  await held(page, touch, await watchedHold(page));
  await shoot(
    page,
    info,
    'dive',
    (m) => m.pose === 'dive' || m.pose === 'run' || m.pose === 'hidden',
    300,
  );
});

test('the scold', async ({ page }, info) => {
  const touch = isTouchProject(info);
  // An adult of the near colony sitting still for a while: the tap goes on its body.
  const { tick, state } = findTick('kalahari-summer', (s) => {
    const c = colonyOn(s, 'near');
    return c?.meerkats.some((m) => !m.pup && m.pose === 'sit' && m.poseTicks >= 20) === true;
  });
  const id = colonyOn(state, 'near')?.meerkats.find((m) => !m.pup && m.pose === 'sit')?.id;
  expect(id).toBeDefined();
  await boot(page, query('kalahari-summer'));
  await startHunt(page, touch);
  await park(page, touch);
  await watch(page, touch, {
    at: tick,
    target: { id: id ?? 0 },
    holdAfter: 30,
    until: 'scold:-10',
  });
  await held(page, touch, await watchedHold(page));
  await shoot(page, info, 'scold', (m) => m.pose === 'scold', 200);
});

test('the Familiefoto', async ({ page }, info) => {
  const touch = isTouchProject(info);
  await boot(page, query('kalahari-summer'));
  await startHunt(page, touch);
  await park(page, touch);
  // One shot into the empty sky (holding fire counts from the first shot), then nothing: the
  // family comes out and lines up; the frame is held in the middle of the photo pose.
  await watch(page, touch, { at: EARLIEST, target: 'sky', holdAfter: 40, until: 'familiefoto' });
  await held(page, touch, await watchedHold(page));
  await shoot(page, info, 'familiefoto', (m) => m.pose === 'photo', 320);
  const poses = await page.evaluate(() => window.__TM__?.meerkats.map((m) => m.pose) ?? []);
  expect(poses).toContain('photo');
});
