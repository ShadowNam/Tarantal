// D-029 art previews (on demand, not part of the regular suite): the same hunt frames before
// (no asset index → runtime placeholders) and after (the packed interim art), composed side by
// side into docs/art-preview/compare/. Run:
//   ART_PREVIEW=1 npx playwright test tests/e2e/art-preview.spec.ts \
//     --project=desktop-chromium --project=pixel7-landscape
// Scenes are held at a fixed sim tick (?holdAt) found with the sim, so they are repeatable; the
// flush is played live (three shots into the flock).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { composePair } from '../../tools/art/compare';
import { boot, burstAtFlock, hook, isTouchProject, startHunt, waitTicks } from './helpers';

const OUT = join(import.meta.dirname, '..', '..', 'docs', 'art-preview');
const RAW = join(OUT, 'screens');
const PROFILES = ['desktop-chromium', 'pixel7-landscape'];
const VARIANTS = ['before', 'after'] as const;
type Variant = (typeof VARIANTS)[number];

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }, info) => {
  test.skip(process.env['ART_PREVIEW'] !== '1', 'on demand: ART_PREVIEW=1');
  test.skip(!PROFILES.includes(info.project.name), 'previews: desktop + Pixel 7 landscape');
  await page.addInitScript(() => {
    const key = 'tm.e2e.save.v1';
    if (localStorage.getItem(key) === null)
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          settings: { quality: 'medium' },
          ftue: { done: true, skipped: false, step: '' },
        }),
      );
  });
});

/** Before = no asset index (every key on its placeholder). */
async function setVariant(page: Page, v: Variant): Promise<void> {
  await page.unroute('**/assets/asset-index.json');
  if (v === 'before')
    await page.route('**/assets/asset-index.json', (r) => r.fulfill({ status: 404, body: '' }));
}

/** Fonts in, and the pointer parked off the canvas (no reticle, gun at rest). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.fontsReady === true, null, { timeout: 30_000 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
}

/** Aims where a player would (the screen centre), so the gun leans as in play. */
async function aimCentre(page: Page): Promise<void> {
  const box = await page.locator('#game canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.42);
  await page.waitForTimeout(400);
}

function save(name: string, v: Variant, info: TestInfo, png: Buffer): void {
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(RAW, `${name}-${v}-${info.project.name}.png`), png);
}

function compose(name: string, info: TestInfo): void {
  composePair(name, info.project.name);
}

/** A hunt held at `holdAt` (seed and hunt length fixed), screenshot per variant. */
async function held(
  page: Page,
  info: TestInfo,
  name: string,
  query: string,
  holdAt: number,
  after?: (page: Page) => Promise<void>,
): Promise<void> {
  for (const v of VARIANTS) {
    await setVariant(page, v);
    await boot(page, `${query}&holdAt=${holdAt}`);
    await startHunt(page, isTouchProject(info));
    await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, holdAt, {
      timeout: 300_000,
    });
    if (after !== undefined) await after(page);
    await settle(page);
    save(name, v, info, await page.screenshot());
  }
  compose(name, info);
}

test('near pop-up', async ({ page }, info) => {
  test.setTimeout(400_000);
  await held(page, info, 'popup-near', 'seed=3&huntSeconds=20', 560);
});

test('mid and far fly-overs', async ({ page }, info) => {
  test.setTimeout(400_000);
  await held(page, info, 'flyover-mid', 'seed=3&huntSeconds=20', 250);
  await held(page, info, 'flyover-far', 'seed=42&huntSeconds=20', 400);
});

test('flock foraging, then flushing', async ({ page }, info) => {
  test.setTimeout(400_000);
  await held(page, info, 'flock-forage', 'seed=42&huntSeconds=20', 70);
  const touch = isTouchProject(info);
  for (const v of VARIANTS) {
    await setVariant(page, v);
    await boot(page, 'seed=42&huntSeconds=60');
    await startHunt(page, touch);
    const flock = (await hook(page)).flockSpots.find((f) => f.alive > 0 && f.y > 500);
    if (!flock) throw new Error('no flock in view at the start');
    await burstAtFlock(page, touch, flock.id, 3, 15);
    await waitTicks(page, 40);
    await page.mouse.move(0, 0);
    save('flock-flush', v, info, await page.screenshot());
  }
  compose('flock-flush', info);
});

test('the Generaal (and the hitbox overlay)', async ({ page }, info) => {
  test.setTimeout(400_000);
  await held(page, info, 'generaal', 'seed=11&huntSeconds=20', 800);
  await held(page, info, 'debug-hitboxes', 'seed=11&huntSeconds=20&debug=1', 800);
});

const GUNS: readonly [string, number | null][] = [
  ['dubbelloop', 3],
  ['windbuks', null],
  ['kettie', null],
  ['pomp', 2],
  ['voorlaaier', 2],
  ['mielie_masjien', null],
];

test('every gun: idle, mid-recoil and reload', async ({ page }, info) => {
  test.setTimeout(400_000);
  type Pose = (id: string, clip: string | null, frame?: number) => void;
  for (const v of VARIANTS) {
    await setVariant(page, v);
    await boot(page, 'seed=42&huntSeconds=20&holdAt=30');
    await startHunt(page, isTouchProject(info));
    await page.waitForFunction(() => (window.__TM__?.tick ?? 0) >= 30, null, { timeout: 120_000 });
    await settle(page);
    await aimCentre(page);
    for (const [id, reloadFrame] of GUNS) {
      const poses: [string, string, number][] = [
        [`gun-${id}-idle`, 'idle', 0],
        [`gun-${id}-fire`, 'fire', 0],
        ...(reloadFrame === null
          ? []
          : ([[`gun-${id}-reload`, 'reload', reloadFrame]] as [string, string, number][])),
      ];
      for (const [name, clip, frame] of poses) {
        await page.evaluate(
          ([g, c, f]) => {
            (window as unknown as { __TM_GUN__?: Pose }).__TM_GUN__?.(g, c, f);
          },
          [id, clip, frame] as const,
        );
        await page.waitForTimeout(250);
        save(name, v, info, await page.screenshot());
      }
    }
  }
  for (const [id, reloadFrame] of GUNS) {
    compose(`gun-${id}-idle`, info);
    compose(`gun-${id}-fire`, info);
    if (reloadFrame !== null) compose(`gun-${id}-reload`, info);
  }
  expect(true).toBe(true);
});
