// v1.8b (D-062): baboon troops on the far ridges and the raiders that come down. In the Karoo with
// no birds (birds=0, so no flock stands in front) and the test flag ?baboonRaid=hat (the first raid
// after 2 s, at the bakkie, one raider, a long act, a slow run when hit): a raid starts on a fixed
// seed with its build-up and the raider's feet stand on its spot's ground line; two hits bag it
// (paid, with the stop bonus, and Oupa's "caught in the act"); a hit on a mother on the ridge costs
// the penalty and the troop runs over the ridge; and the baboons are drawn on the canvas in
// Standard when their sheet (late group) lands mid-hunt. Shots are in-page pointer events with a
// fresh pointerId each (feesdaeHelpers.fireAt); a miss is decided after ~25 ticks.
import { expect, test, type Page } from '@playwright/test';
import birds from '../../content/birds.json' with { type: 'json' };
import karoo from '../../content/biomes/karoo-autumn.json' with { type: 'json' };
import scoring from '../../content/scoring.json' with { type: 'json' };
import { decodePng } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { boot, hook, isLandscape, isTouchProject, startHunt, waitTicks } from './helpers';

const BASE =
  'biome=karoo-autumn&layout=mon&seed=42&huntSeconds=300&birds=0&graphics=standard&baboonRaid=hat';

interface Baboon {
  readonly id: number;
  readonly role: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly groundY: number | null;
  readonly visible: boolean;
  readonly alpha: number;
}

interface Raid {
  readonly id: number;
  readonly spotId: string;
  readonly action: string;
  readonly phase: string;
  readonly completed: boolean;
}

type Hooked = {
  __TM__?: {
    tick: number;
    score: number;
    baboons?: Baboon[] | null;
    baboonRaid?: Raid | null;
    namibLog?: string[];
  };
};

async function baboonsOf(page: Page): Promise<readonly Baboon[]> {
  return page.evaluate(() => (window as unknown as Hooked).__TM__?.baboons ?? []);
}

const raiderOf = async (page: Page): Promise<Baboon | undefined> =>
  (await baboonsOf(page)).find((b) => b.role === 'raider');

/** Pans (bounded) until `x` of the thing `where` finds is in the middle part of the screen. */
async function panTo(page: Page, where: () => Promise<number | null>): Promise<void> {
  const w = (await hook(page)).designWidth;
  for (let k = 0; k < 120; k++) {
    const x = await where();
    if (x === null || (x > w * 0.25 && x < w * 0.75)) return;
    const key = x < w / 2 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key);
    await page.waitForTimeout(120);
    await page.keyboard.up(key);
  }
}

/** Pans the camera (bounded) until its centre is within 60 px of `cx`; stops on an overshoot or
 *  when the camera stops at the panorama's end. */
async function panCamera(page: Page, cx: number): Promise<void> {
  let prev: number | null = null;
  for (let k = 0; k < 160; k++) {
    const now = (await hook(page)).cameraX;
    const o = cx - now;
    if (Math.abs(o) <= 60) return;
    if (prev !== null && (Math.sign(o) !== Math.sign(prev) || Math.abs(o - prev) < 2)) return;
    prev = o;
    const key = o > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.abs(o) > 600 ? 300 : 100);
    await page.keyboard.up(key);
  }
}

/** The camera centre that puts the Karoo troop mid-screen: its ridge (scroll 0.15) is drawn at
 *  layer x − (cx − 960) × 0.15, and the troop sits at u × (1920 + 3200 × 0.15). */
const troopCameraX = (): number => {
  const u = karoo.baboons.troops[0]?.u ?? 0.5;
  return 960 + (u * (1920 + 3200 * 0.15) - 960) / 0.15;
};

test.use({ serviceWorkers: 'block' });

test('a raid on a fixed seed: the lookout barks, a raider comes down to the bakkie; two hits bag it', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, BASE);
  await startHunt(page, touch);
  // The build-up first (warn → climb → travel), then the raider at its act, in one wait.
  const seen = await page.waitForFunction(
    () => {
      const tm = (window as unknown as Hooked).__TM__;
      const w = window as unknown as { __BB__?: string[] };
      const phases = (w.__BB__ ??= []);
      const p = tm?.baboonRaid?.phase;
      if (p !== undefined && phases[phases.length - 1] !== p) phases.push(p);
      const r = (tm?.baboons ?? []).find((b) => b.role === 'raider');
      return r?.frame?.startsWith('hat_') === true
        ? { phases, spot: tm?.baboonRaid?.spotId }
        : false;
    },
    null,
    { timeout: 300_000, polling: 'raf' },
  );
  const first = (await seen.jsonValue()) as { phases: string[]; spot: string };
  expect(first.phases.slice(0, 2), 'the lookout barks before the raider climbs down').toEqual([
    'warn',
    'climb',
  ]);
  expect(first.spot).toBe('hat');
  await panTo(page, async () => (await raiderOf(page))?.x ?? null);
  // Its feet stand on the spot's ground line (frames are placed by their feet, not their middle).
  const r0 = await raiderOf(page);
  expect(r0?.visible).toBe(true);
  expect(
    Math.abs((r0?.y ?? 0) - (r0?.groundY ?? -99)),
    'raider feet on the ground',
  ).toBeLessThanOrEqual(1);
  const k = scoring.planes.mid.scale;
  const sit = birds.baboons.hitboxes.sit.body;
  const walk = birds.baboons.hitboxes.walk.body;
  const scoreBefore = (await hook(page)).score;
  let bagged = false;
  let hits = 0;
  for (let shot = 0; shot < 40 && !bagged; shot++) {
    await reloadIfEmpty(page, touch);
    const r = await raiderOf(page);
    if (r === undefined || !r.visible) {
      await waitTicks(page, 20);
      continue;
    }
    const box = r.frame?.startsWith('hat_') === true ? sit : walk;
    const fired = await fireAt(page, touch, { x: r.x, y: r.y + box.oy * k });
    if (fired === null) {
      await panTo(page, async () => (await raiderOf(page))?.x ?? null);
      continue;
    }
    const t0 = (await hook(page)).tick;
    // Read the transient change in the same wait that sees it: running off, or the tumble.
    const res = (await (
      await page.waitForFunction(
        ([until, n]) => {
          const tm = (window as unknown as Hooked).__TM__;
          const rr = (tm?.baboons ?? []).find((b) => b.role === 'raider');
          if (rr?.frame === 'tumble' || rr?.frame === 'down') return 'bagged';
          if (n === 0 && rr?.frame?.startsWith('run_') === true) return 'hit';
          return (tm?.tick ?? 0) >= until ? 'miss' : false;
        },
        [t0 + 25, hits] as const,
        { timeout: 120_000 },
      )
    ).jsonValue()) as string;
    if (res === 'hit') hits = 1;
    if (res === 'bagged') bagged = true;
  }
  expect(hits, 'the first hit sends it running').toBe(1);
  expect(bagged, 'two hits bag it').toBe(true);
  const after = await hook(page);
  // No birds here: the gain is the raider's points and the stop bonus (× Frenzy/Stampede ≥ 1).
  const base = Math.round(scoring.planes.mid.base * birds.baboons.hit.pointsMul);
  expect(after.score - scoreBefore).toBeGreaterThanOrEqual(base + birds.baboons.hit.stopBonus);
  const log = await page.evaluate(() => (window as unknown as Hooked).__TM__?.namibLog ?? []);
  expect(log).toContain('bark:guide.baboon.raid_hat');
  expect(log).toContain('bark:guide.baboon.stopped');
});

test('a hit on a mother costs points; the troop runs over the ridge', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  // No raid flag: the troop sits on its ridge (the first raid is 12 s off at the earliest).
  await boot(page, BASE.replace('&baboonRaid=hat', ''));
  await startHunt(page, touch);
  await page.waitForFunction(
    () =>
      ((window as unknown as Hooked).__TM__?.baboons ?? []).some(
        (b) => b.role === 'mother' && b.visible,
      ),
    null,
    { timeout: 300_000 },
  );
  const motherOf = async (): Promise<Baboon | undefined> =>
    (await baboonsOf(page)).find((b) => b.role === 'mother' && b.visible);
  await panTo(page, async () => (await motherOf())?.x ?? null);
  const scale = scoring.planes.far.scale * birds.baboons.motherScale;
  const body = birds.baboons.hitboxes.sit.body;
  let hit = false;
  let scoreBefore = -1;
  for (let shot = 0; shot < 40 && !hit; shot++) {
    await reloadIfEmpty(page, touch);
    const m = await motherOf();
    if (m === undefined) {
      // The troop is away over the ridge (a stray hit on another member): wait for it.
      await waitTicks(page, 60);
      continue;
    }
    if (scoreBefore < 0) scoreBefore = (await hook(page)).score;
    const fired = await fireAt(page, touch, { x: m.x, y: m.y + body.oy * scale });
    if (fired === null) continue;
    const t0 = (await hook(page)).tick;
    hit =
      (await (
        await page.waitForFunction(
          ([until, before]) => {
            const tm = (window as unknown as Hooked).__TM__;
            if ((tm?.score ?? 0) < before) return true;
            return (tm?.tick ?? 0) >= until ? 'miss' : false;
          },
          [t0 + 25, scoreBefore] as const,
          { timeout: 120_000 },
        )
      ).jsonValue()) === true;
  }
  expect(hit, 'a mother was hit within 40 shots').toBe(true);
  const after = await hook(page);
  expect(after.score).toBe(scoreBefore - birds.baboons.hit.penalty);
  const log = await page.evaluate(() => (window as unknown as Hooked).__TM__?.namibLog ?? []);
  expect(log).toContain('bark:guide.baboon.mother');
  // The troop runs over the ridge: within its climb every member is gone from the ridge.
  const climb = Math.ceil(birds.baboons.troop.climbSeconds * 60) + 30;
  await waitTicks(page, climb);
  expect((await baboonsOf(page)).filter((b) => b.role !== 'raider' && b.visible)).toEqual([]);
});

// v1.7e's lesson (R11): a lazily delivered sheet must really be drawn when it lands mid-hunt. The
// baboon sheet's download is held until the hunt runs and the sim is held; then the canvas pixels
// at the troop's spot are compared before and after it lands (Standard graphics).
test('the troop is drawn on the canvas when the baboon sheet lands mid-hunt', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  let release: () => void = () => undefined;
  const landed = new Promise<void>((r) => {
    release = r;
  });
  let held = false;
  let heldAt = 0;
  await page.route(/\/late\/img\/baboons_sheet\.[0-9a-f]+\.png$/, async (route) => {
    held = true;
    heldAt = Date.now();
    await Promise.race([landed, new Promise((r) => setTimeout(r, 100_000))]);
    await route.continue();
  });
  await boot(page, BASE.replace('&baboonRaid=hat', ''));
  await startHunt(page, touch);
  await panCamera(page, troopCameraX());
  // Hold the sim early (the troop sits; no raid before 12 s).
  const at = await page.evaluate(() => {
    const t = Math.max(120, (window.__TM__?.tick ?? 0) + 30);
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 300_000 });
  expect(held, 'the baboon sheet download was held').toBe(true);
  // Without the sheet nothing is drawn, and the hook says so.
  expect((await baboonsOf(page)).filter((b) => b.visible)).toEqual([]);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  const before = decodePng(await page.locator('#game canvas').screenshot());
  expect(Date.now() - heldAt, 'the hold must stay inside the lazy timeout (120 s)').toBeLessThan(
    100_000,
  );
  release();
  await page.waitForFunction(
    () =>
      ((window as unknown as Hooked).__TM__?.baboons ?? []).filter((b) => b.visible).length >= 5,
    null,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(800);
  const after = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  expect(h.tick, 'still held').toBe(at);
  const shown = (await baboonsOf(page)).filter((b) => b.visible);
  const k = after.height / h.designHeight;
  let changed = 0;
  // A box over each baboon's body (feet at x, y; a sitting male is ~54 design px on the ridge).
  for (const b of shown)
    for (let y = Math.round((b.y - 40) * k); y < Math.round((b.y - 4) * k); y++)
      for (let x = Math.round((b.x - 12) * k); x < Math.round((b.x + 12) * k); x++) {
        if (x < 0 || y < 0 || x >= after.width || y >= after.height) continue;
        const i = (y * after.width + x) * 4;
        const diff =
          Math.abs((after.data[i] ?? 0) - (before.data[i] ?? 0)) +
          Math.abs((after.data[i + 1] ?? 0) - (before.data[i + 1] ?? 0)) +
          Math.abs((after.data[i + 2] ?? 0) - (before.data[i + 2] ?? 0));
        if (diff > 60) changed++;
      }
  expect(changed, 'canvas pixels drawn by the troop').toBeGreaterThan(60 * k * k);
});
