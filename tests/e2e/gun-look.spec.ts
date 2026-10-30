// v1.1 gun feel (D-032): every primary and crate gun shows its own ammo and crosshair, full and
// partly spent, on every landscape profile; real play spends the right rounds; the touch offset
// crosshair puts the shot above the finger. The ammo and crosshair of a gun that isn't equipped
// are shown through the e2e preview hook (`__TM_AMMO__`) on a held hunt frame (?holdAt).
//
// Previews for the product owner (on demand): ART_PREVIEW=1 also writes the after shots to
// docs/art-preview/screens/v1.1-<gun>-<state>-after-<project>.png. GUNLOOK_BEFORE=1 instead
// plays each gun for real on a build of main (served by a scratch config) and writes the before
// shots; then `npx tsx tools/art/compare.ts` (or the after run) composes the pairs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { composePair } from '../../tools/art/compare';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapAt,
  waitTicks,
} from './helpers';

const PREVIEW = process.env['ART_PREVIEW'] === '1';
const BEFORE = process.env['GUNLOOK_BEFORE'] === '1';
const RAW = join(import.meta.dirname, '..', '..', 'docs', 'art-preview', 'screens');
/** Where the crosshair is shown: right of centre, so one crop holds it and the belt. */
const AIM = { x: 0.68, y: 0.58 };

type Ammo = 'shell12' | 'diabolo' | 'stone' | 'paper' | 'kernel';
interface Case {
  readonly gun: string;
  readonly ammo: Ammo;
  /** Rounds shown full and partly spent (timed crate gun: percent of its time). */
  readonly full: number;
  readonly part: number;
  /** Expected ammo textures: [full rounds, spent rounds] in each state. */
  readonly expectFull: readonly [number, number];
  readonly expectPart: readonly [number, number];
}
const CASES: readonly Case[] = [
  { gun: 'dubbelloop', ammo: 'shell12', full: 8, part: 3, expectFull: [8, 0], expectPart: [3, 5] },
  { gun: 'pomp', ammo: 'shell12', full: 6, part: 2, expectFull: [6, 0], expectPart: [2, 4] },
  { gun: 'windbuks', ammo: 'diabolo', full: 6, part: 2, expectFull: [6, 0], expectPart: [2, 0] },
  // Kettie: unlimited; "partly spent" = the top stone in the pouch while the band is drawn.
  { gun: 'kettie', ammo: 'stone', full: 5, part: 0, expectFull: [5, 0], expectPart: [4, 0] },
  { gun: 'voorlaaier', ammo: 'paper', full: 3, part: 1, expectFull: [3, 0], expectPart: [1, 2] },
  {
    gun: 'mielie_masjien',
    ammo: 'kernel',
    full: 100,
    part: 35,
    expectFull: [1, 1],
    expectPart: [1, 1],
  },
];

test.use({ serviceWorkers: 'block' });

/** A returning player (FTUE done, medium tier for stable previews), optionally with a gun. */
async function seed(page: Page, weapon: string | null, extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([w, more]) => {
      const key = 'tm.e2e.save.v1';
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'medium', ...more },
          ftue: { done: true, skipped: false, step: '' },
          bestRank: 'plaaswerker',
          ...(w === null ? {} : { loadout: { weapon: w }, unlocks: { weapons: [w] } }),
        }),
      );
    },
    [weapon, extra] as const,
  );
}

async function fontsIn(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
}

/** The right part of the screen: the crosshair at AIM and the belt (bottom right). */
async function crop(page: Page): Promise<Buffer> {
  const v = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = Math.round(v.width * 0.45);
  const y = Math.round(v.height * 0.3);
  return page.screenshot({ clip: { x, y, width: v.width - x, height: v.height - y } });
}

function saveRaw(name: string, variant: 'before' | 'after', info: TestInfo, png: Buffer): void {
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, `${name}-${variant}-${info.project.name}.png`), png);
}

const counts = (keys: readonly string[], ammo: Ammo): [number, number] => [
  keys.filter((k) => k === `ui/ammo/${ammo}`).length,
  keys.filter((k) => k === `ui/ammo/${ammo}_spent`).length,
];

test('every gun shows its own ammo and crosshair, full and partly spent', async ({
  page,
}, info) => {
  test.skip(BEFORE, 'before shots: the other test');
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await seed(page, null);
  await boot(page, 'seed=42&huntSeconds=20&holdAt=30&baboons=0');
  await startHunt(page, isTouchProject(info));
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 30, null, { timeout: 120_000 });
  await fontsIn(page);
  const h0 = await hook(page);
  const ax = Math.round(h0.designWidth * AIM.x);
  const ay = Math.round(h0.designHeight * AIM.y);
  const extents: Record<string, number> = {};
  // writeFileSync doesn't create folders (page.screenshot does); a fresh CI checkout has none.
  mkdirSync(SCREENSHOTS, { recursive: true });
  for (const c of CASES) {
    for (const state of ['full', 'part'] as const) {
      await page.evaluate(
        ([g, n, x, y]) => {
          type Preview = (id: string | null, rounds?: number, x?: number, y?: number) => void;
          (window as unknown as { __TM_AMMO__?: Preview }).__TM_AMMO__?.(g, n, x, y);
        },
        [c.gun, state === 'full' ? c.full : c.part, ax, ay] as const,
      );
      await page.waitForFunction(
        (g) => window.__TM__?.crosshair.weapon === g && window.__TM__.crosshair.visible,
        c.gun,
      );
      await page.waitForTimeout(150);
      const h = await hook(page);
      expect(counts(h.ammo, c.ammo), `${c.gun} ${state}`).toEqual(
        state === 'full' ? c.expectFull : c.expectPart,
      );
      expect(h.ammo.every((k) => k.startsWith(`ui/ammo/${c.ammo}`))).toBe(true);
      expect(Math.abs(h.crosshair.x - ax)).toBeLessThanOrEqual(c.gun === 'mielie_masjien' ? 6 : 1);
      extents[c.gun] = h.crosshair.extent;
      const png = await crop(page);
      writeFileSync(`${SCREENSHOTS}/gun-look-${c.gun}-${state}-${info.project.name}.png`, png);
      if (PREVIEW) saveRaw(`v1.1-${c.gun}-${state}`, 'after', info, png);
    }
  }
  // The crosshair shows the spread: Pomp tighter than the Dubbelloop, the Voorlaaier widest,
  // the Windbuks a fine dot with a small ring.
  expect(extents['pomp']).toBeLessThan(extents['dubbelloop'] ?? 0);
  expect(extents['voorlaaier']).toBeGreaterThan(extents['dubbelloop'] ?? 0);
  expect(extents['windbuks']).toBeLessThan(40);
  if (PREVIEW)
    for (const c of CASES)
      for (const s of ['full', 'part']) composePair(`v1.1-${c.gun}-${s}`, info.project.name);
  expect(errors).toEqual([]);
});

test('real play: firing the Windbuks spends its diabolo pellets', async ({ page }, info) => {
  test.skip(BEFORE, 'before shots: the other test');
  test.skip(!isLandscape(info), 'portrait shows the rotate card');
  test.setTimeout(180_000);
  const touch = isTouchProject(info);
  const errors = collectErrors(page);
  await seed(page, 'windbuks');
  await boot(page, 'seed=42&huntSeconds=20&baboons=0');
  await startHunt(page, touch);
  let h = await hook(page);
  expect(counts(h.ammo, 'diabolo')).toEqual([6, 0]);
  for (let i = 0; i < 2; i++) {
    const before = (await hook(page)).shots;
    await tapAt(page, touch, h.designWidth / 2, 120);
    await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, before);
    await waitTicks(page, 16);
  }
  await page.waitForFunction(() => window.__TM__?.shells === 4);
  await waitTicks(page, 2);
  h = await hook(page);
  expect(counts(h.ammo, 'diabolo')).toEqual([4, 0]);
  expect(h.crosshair.weapon).toBe('windbuks');
  expect(errors).toEqual([]);
});

test('touch: the offset crosshair sits above the finger and the shot goes there', async ({
  page,
}, info) => {
  test.skip(BEFORE, 'before shots: the other test');
  test.skip(!isLandscape(info) || !isTouchProject(info), 'touch profiles only');
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await seed(page, null, { offsetCrosshair: true });
  await boot(page, 'seed=42&huntSeconds=20&baboons=0');
  await startHunt(page, true);
  const h = await hook(page);
  const x = Math.round(h.designWidth / 2);
  await tapAt(page, true, x, 500);
  await page.waitForFunction(() => (window.__TM__?.shots ?? 0) >= 1);
  const after = await hook(page);
  // feel.json guns.offsetCrosshairPx = 70.
  expect(Math.abs(after.crosshair.y - 430)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.crosshair.x - x)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Before shots: main's HUD, playing each gun for real (main has no preview hook).

test('before: each gun on main, full and partly spent', async ({ browser, baseURL }, info) => {
  test.skip(!BEFORE || !PREVIEW, 'on demand against a main build');
  test.skip(!['desktop-chromium', 'pixel7-landscape'].includes(info.project.name), 'previews');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  for (const c of CASES) {
    const crate = c.gun === 'voorlaaier' || c.gun === 'mielie_masjien';
    // A fresh context per gun: the save (loadout) must not carry over.
    const d = info.project.use;
    const context = await browser.newContext({
      ...(d.viewport != null ? { viewport: d.viewport } : {}),
      ...(d.userAgent !== undefined ? { userAgent: d.userAgent } : {}),
      ...(d.deviceScaleFactor !== undefined ? { deviceScaleFactor: d.deviceScaleFactor } : {}),
      ...(d.isMobile !== undefined ? { isMobile: d.isMobile } : {}),
      ...(d.hasTouch !== undefined ? { hasTouch: d.hasTouch } : {}),
      ...(baseURL === undefined ? {} : { baseURL }),
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await seed(page, crate ? null : c.gun);
    await boot(page, `seed=7&huntSeconds=60&baboons=0${crate ? `&crate=${c.gun}` : ''}`);
    await startHunt(page, touch);
    await fontsIn(page);
    const h = await hook(page);
    const ax = h.designWidth * AIM.x;
    const ay = h.designHeight * AIM.y;
    if (crate) {
      await page.waitForFunction(() => (window.__TM__?.crateSpots.length ?? 0) > 0, null, {
        timeout: 120_000,
      });
      for (let i = 0; i < 12 && (await hook(page)).weapon !== c.gun; i++) {
        const spot = (await hook(page)).crateSpots[0];
        if (spot !== undefined) await tapAt(page, touch, spot.x, spot.y);
        await waitTicks(page, 12);
      }
    }
    const box = await page.locator('#game canvas').boundingBox();
    const aimMouse = async (): Promise<void> => {
      if (box !== null && !touch)
        await page.mouse.move(
          box.x + (ax / h.designWidth) * box.width,
          box.y + (ay / h.designHeight) * box.height,
        );
    };
    await aimMouse();
    await page.waitForTimeout(400);
    saveRaw(`v1.1-${c.gun}-full`, 'before', info, await crop(page));
    const shots = c.gun === 'kettie' ? 1 : c.full - c.part;
    if (c.gun === 'mielie_masjien') {
      // Its time runs down by itself: wait until about a third is left.
      await waitTicks(page, 200);
    } else
      for (let i = 0; i < shots; i++) {
        const n = (await hook(page)).shots;
        await tapAt(page, touch, ax, 140);
        await page.waitForFunction((k) => (window.__TM__?.shots ?? 0) > k, n, { timeout: 30_000 });
        if (i < shots - 1) await waitTicks(page, c.gun === 'voorlaaier' ? 160 : 20);
      }
    await aimMouse();
    saveRaw(`v1.1-${c.gun}-part`, 'before', info, await crop(page));
    await context.close();
  }
  expect(true).toBe(true);
});
