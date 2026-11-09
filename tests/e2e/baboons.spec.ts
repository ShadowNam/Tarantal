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
import { boot, hook, isLandscape, isTouchProject, startHunt, tapRect, waitTicks } from './helpers';

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
  /** v1.16 (D-078) a ridge member: how far up over the edge (1: all the way up). */
  readonly rise: number;
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
    baboonCalls?: { wahoo: number; grunt: number; squeal: number; bark: number } | null;
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
  // The build-up in the sim first (warn → climb → travel → on). The bakkie is off screen at the
  // starting camera, and an off-screen raider is not drawn (its hook frame is null), so wait on the
  // raid's state and the raider's presence, not on a drawn frame.
  const seen = await page.waitForFunction(
    () => {
      const tm = (window as unknown as Hooked).__TM__;
      const w = window as unknown as { __BB__?: string[] };
      const phases = (w.__BB__ ??= []);
      const p = tm?.baboonRaid?.phase;
      if (p !== undefined && phases[phases.length - 1] !== p) phases.push(p);
      const r = (tm?.baboons ?? []).find((b) => b.role === 'raider');
      return p === 'on' && r !== undefined ? { phases, spot: tm?.baboonRaid?.spotId } : false;
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
  // Then bring the bakkie on screen and see the raider at its act (the test flag makes the act
  // long and repeats the raid at the same spot, so a slow pan meets the next one).
  await panTo(page, async () => (await raiderOf(page))?.x ?? null);
  await page.waitForFunction(
    () =>
      ((window as unknown as Hooked).__TM__?.baboons ?? []).some(
        (b) => b.role === 'raider' && b.frame?.startsWith('hat_') === true,
      ),
    null,
    { timeout: 180_000 },
  );
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
  // The Windbuks: one pellet, no spread. Mothers sit on the troop's highest seats, next to the
  // lookout's: the Dubbelloop's spread would strike a neighbour and send the troop away first.
  await page.addInitScript(() => {
    if (localStorage.getItem('tm.e2e.save.v1') !== null) return;
    localStorage.setItem(
      'tm.e2e.save.v1',
      JSON.stringify({
        v: 1,
        ftue: { done: true, skipped: false, step: '' },
        loadout: { weapon: 'windbuks' },
        unlocks: { weapons: ['windbuks'] },
      }),
    );
  });
  // v1.16 (D-078): no raids, and the troop's looks over the ridge come quickly and last 10–14 s
  // (?baboonPeek=long): a mother is up over the edge often enough to be shot at.
  await boot(page, BASE.replace('&baboonRaid=hat', '&baboonPeek=long'));
  await startHunt(page, touch);
  expect((await hook(page)).weapon).toBe('windbuks');
  // The troop is in the hook (drawn or culled off screen): pan to a mother, then see her drawn.
  await page.waitForFunction(
    () => ((window as unknown as Hooked).__TM__?.baboons ?? []).some((b) => b.role === 'mother'),
    null,
    { timeout: 300_000 },
  );
  await panTo(
    page,
    async () => (await baboonsOf(page)).find((b) => b.role === 'mother')?.x ?? null,
  );
  await page.waitForFunction(
    () =>
      ((window as unknown as Hooked).__TM__?.baboons ?? []).some(
        (b) => b.role === 'mother' && b.visible && b.rise >= 1,
      ),
    null,
    { timeout: 300_000 },
  );
  // Only all the way up over the edge is she hittable (rising or ducking she is behind it).
  const motherOf = async (): Promise<Baboon | undefined> =>
    (await baboonsOf(page)).find((b) => b.role === 'mother' && b.visible && b.rise >= 1);
  const scale = scoring.planes.far.scale * birds.baboons.motherScale;
  const body = birds.baboons.hitboxes.peek.body;
  let hit = false;
  let scoreBefore = -1;
  for (let shot = 0; shot < 40 && !hit; shot++) {
    await reloadIfEmpty(page, touch);
    const m = await motherOf();
    if (m === undefined) {
      // She is behind the ridge (or the troop is away after a stray hit): wait for her look.
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
  // The troop ducks behind the ridge: within its climb every member is out of sight.
  const climb = Math.ceil(birds.baboons.troop.climbSeconds * 60) + 30;
  await waitTicks(page, climb);
  expect((await baboonsOf(page)).filter((b) => b.role !== 'raider' && b.visible)).toEqual([]);
});

// v1.7e's lesson (R11), and the review of v1.8b: the troop is hittable from the hunt's first tick,
// so a hunt on a map with a troop waits for the baboon sheet (it loads in the background after the
// first download). Its download is held: the hunt doesn't start; released, the hunt starts and the
// troop is really drawn: the canvas over each member's body differs from the sky just above it.
test('a hunt waits for the baboon sheet; then the troop is drawn on the canvas', async ({
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
  await page.route(/\/baboons\/img\/baboons_sheet\.[0-9a-f]+\.png$/, async (route) => {
    held = true;
    await Promise.race([landed, new Promise((r) => setTimeout(r, 100_000))]);
    await route.continue();
  });
  await boot(page, BASE.replace('&baboonRaid=hat', '&baboonPeek=long'));
  // Start the hunt without startHunt's wait for it: it must not run while the sheet is held.
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForTimeout(5000);
  expect(held, 'the baboon sheet download was held').toBe(true);
  expect((await hook(page)).tick, 'the hunt waits for the sheet').toBe(0);
  release();
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 30, null, { timeout: 300_000 });
  await panCamera(page, troopCameraX());
  // v1.16 (D-078): the troop hides behind the ridge; wait for one all the way up over the edge.
  await page.waitForFunction(
    () =>
      ((window as unknown as Hooked).__TM__?.baboons ?? []).some(
        (b) => b.role !== 'raider' && b.visible && b.rise >= 1,
      ),
    null,
    { timeout: 300_000 },
  );
  // Hold the moment (no raids under ?baboonPeek).
  await page.evaluate(() => {
    const t = (window.__TM__?.tick ?? 0) + 20;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1500);
  const img = decodePng(
    await page.locator('#game canvas').screenshot({
      path: `tests/e2e/__screenshots__/baboons-refined-${info.project.name}.png`,
    }),
  );
  const h = await hook(page);
  const k = img.height / h.designHeight;
  const px = (x: number, y: number): [number, number, number] => {
    const i = (Math.round(y * k) * img.width + Math.round(x * k)) * 4;
    return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
  };
  let drawn = 0;
  const all = (await baboonsOf(page)).filter((b) => b.role !== 'raider');
  const shown = all.filter((b) => b.visible && b.rise >= 1);
  // Few at once: the rest are hidden behind the ridge (not drawn at all).
  expect(all.filter((b) => b.visible).length).toBeLessThanOrEqual(3);
  expect(all.length - all.filter((b) => b.visible).length).toBeGreaterThanOrEqual(2);
  for (const b of shown) {
    // The sky well above the head, and the head and shoulders over the edge (a peek's bust is
    // ~27 design px tall on the far ridge; the hook's y is the ridge's edge).
    const sky = px(b.x, b.y - 80);
    let differs = 0;
    for (let y = b.y - 22; y < b.y - 6; y += 2)
      for (let x = b.x - 8; x <= b.x + 8; x += 2) {
        const c = px(x, y);
        if (Math.abs(c[0] - sky[0]) + Math.abs(c[1] - sky[1]) + Math.abs(c[2] - sky[2]) > 60)
          differs++;
      }
    if (differs > 12) drawn++;
  }
  expect(shown.length).toBeGreaterThan(0);
  expect(drawn, `members drawn on the canvas, of ${shown.length}`).toBe(shown.length);
});

// v1.16 (D-078): the troop calls — a wa-hoo plays (the hook's counter) while it is on its ridge,
// and never more often than its limit: one idle wa-hoo per wahooSeconds[0] at most, plus one with
// each raid's warning or scare. Checked on sim ticks (lesson 2: never on the wall clock).
test("the troop's wa-hoo plays, never more often than its limit", async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, BASE.replace('&baboonRaid=hat', ''));
  await startHunt(page, touch);
  const [gapMin = 20, gapMax = 40] = birds.baboons.calls.wahooSeconds;
  const minTicks = gapMax * 60 + 120;
  const res = await (
    await page.waitForFunction(
      (until): { tick: number; wahoo: number; raids: number } | null => {
        const tm = (window as unknown as Hooked).__TM__;
        const c = tm?.baboonCalls;
        if ((tm?.tick ?? 0) < until || c === null || c === undefined) return null;
        return { tick: tm?.tick ?? 0, wahoo: c.wahoo, raids: tm?.baboonRaid?.id ?? 0 };
      },
      minTicks,
      { timeout: 600_000 },
    )
  ).jsonValue();
  if (res === null) throw new Error('no calls hook');
  expect(res.wahoo, 'a wa-hoo within wahooSeconds').toBeGreaterThanOrEqual(1);
  const idleMax = Math.floor(res.tick / (gapMin * 60)) + 1;
  // Raids (each warns once) and scares (none here: no shots) add theirs.
  expect(res.wahoo).toBeLessThanOrEqual(idleMax + res.raids + 1);
});
