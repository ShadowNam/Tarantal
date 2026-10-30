// v1.8c (D-063): Die Oes (The Harvest). From the title's Die Oes button: the intro (the fence
// breaks, the family barges in), the rush, the fence closing and the Harvest tally with a local
// best; a tap in the intro skips it without a shot; a shot aimed at a worker costs the penalty and
// the worker ducks; and the Harvest's sheet is really drawn on the canvas (pixels at a worker's
// spot differ once the workers stand there). Short rushes via ?huntSeconds (the rush follows it);
// the troop is off (?baboons=0) where a raid would only add noise. Shots are in-page pointer events
// with a fresh pointerId each (feesdaeHelpers.fireAt); every wait is bounded by sim ticks.
import { expect, test, type Page } from '@playwright/test';
import modes from '../../content/modes.json' with { type: 'json' };
import scoring from '../../content/scoring.json' with { type: 'json' };
import { decodePng } from '../../tools/assets/image';
import { fireAt } from './feesdaeHelpers';
import { boot, hook, isLandscape, isTouchProject, tapRect } from './helpers';

const H = modes.modes.harvest;
const INTRO = Math.round(H.intro.seconds * 60);

interface Actor {
  readonly id: number;
  readonly role: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

async function actorsOf(page: Page): Promise<readonly Actor[]> {
  return page.evaluate(() => window.__TM__?.harvestActors ?? []);
}

/** Waits until the sim reaches tick `t`; fails fast (not after minutes) when the sim stops short of
 *  it — a hold that wasn't lifted — i.e. the tick doesn't move for 20 s. */
async function untilTick(page: Page, t: number): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const w = window as unknown as { __HVT__?: { tick: number; at: number } };
      const tick = window.__TM__?.tick ?? 0;
      if (tick >= want) return true;
      const now = performance.now();
      if (w.__HVT__ === undefined || w.__HVT__.tick !== tick) w.__HVT__ = { tick, at: now };
      else if (now - w.__HVT__.at > 20_000)
        throw new Error(`the sim stopped at tick ${String(tick)} (< ${String(want)})`);
      return false;
    },
    t,
    { timeout: 300_000, polling: 250 },
  );
}

async function startHarvest(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['harvest'] !== undefined, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'harvest');
  await page.waitForFunction(
    () => window.__TM__?.scene === 'hunt' && window.__TM__.harvest !== null,
    null,
    { timeout: 300_000 },
  );
}

test.use({ serviceWorkers: 'block' });

test('from the title: the intro, the rush, the fence closes, the Harvest tally and a best', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await boot(page, 'seed=7&huntSeconds=6&baboons=0&graphics=standard');
  // The title's button and its first-time line.
  const h0 = await hook(page);
  expect(h0.rects['harvest'], 'the Die Oes button').toBeDefined();
  expect(h0.rects['harvestStatus'], 'its line').toBeDefined();
  await startHarvest(page, touch);
  // Review round 1: the crop and fence bars overlap no other HUD element (the pause button above).
  await page.waitForFunction(() => window.__TM__?.rects['harvestCrop'] !== undefined, null, {
    timeout: 120_000,
  });
  const rects = (await hook(page)).rects;
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const bar of ['harvestCrop', 'harvestRepair']) {
    const r = rects[bar];
    expect(r, bar).toBeDefined();
    if (r === undefined) continue;
    for (const [name, o] of Object.entries(rects))
      if (!name.startsWith('harvest') && name !== 'charms' && name !== 'quota')
        expect(hit(r, o), `${bar} over ${name}`).toBe(false);
  }
  // Every phase in order, read in the same wait that sees them (bounded by the sim's ticks).
  const phases = await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      const w = window as unknown as { __HV__?: string[] };
      const seen = (w.__HV__ ??= []);
      const p = tm?.scene === 'tally' ? 'tally' : tm?.harvest?.phase;
      if (p !== undefined && seen[seen.length - 1] !== p) seen.push(p);
      if (tm?.scene === 'tally') return seen;
      if ((tm?.tick ?? 0) > 60 * 60) throw new Error(`no tally by tick 3600 (${seen.join(',')})`);
      return false;
    },
    null,
    { timeout: 600_000, polling: 'raf' },
  );
  expect(await phases.jsonValue()).toEqual(['intro', 'rush', 'outro', 'tally']);
  // The best is kept (the save's harvest section).
  const best = await page.evaluate(() => {
    const raw = localStorage.getItem('tm.e2e.save.v1');
    return raw === null ? null : (JSON.parse(raw) as { harvest?: { best: number | null } }).harvest;
  });
  expect(best?.best, 'the Harvest best is saved').not.toBeNull();
});

test('a tap in the intro skips it without a shot', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await boot(page, `seed=7&huntSeconds=30&baboons=0&graphics=standard&holdAt=20`);
  await startHarvest(page, touch);
  await untilTick(page, 20);
  expect((await hook(page)).harvest?.phase).toBe('intro');
  await fireAt(page, touch, { x: (await hook(page)).designWidth / 2, y: 500 });
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(40);
  });
  await untilTick(page, 40);
  const h = await hook(page);
  expect(h.harvest?.phase, 'the intro was skipped').toBe('rush');
  expect(h.harvest?.clockTicksLeft ?? 0, 'the 30-s clock runs').toBeGreaterThan(30 * 60 - 40);
  expect(h.score, 'no shot was fired').toBe(0);
});

test('a shot aimed at a worker costs the penalty and the worker ducks; the sheet is drawn', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  // Held at tick 3: the workers are still running in from the right (their spots show the field).
  await boot(page, 'seed=7&huntSeconds=30&baboons=0&graphics=standard&holdAt=3');
  await startHarvest(page, touch);
  await untilTick(page, 3);
  await page.waitForFunction(
    () => (window.__TM__?.harvestActors ?? []).some((a) => a.role === 'gap' && a.visible),
    null,
    { timeout: 300_000 },
  );
  if (!touch) await page.mouse.move(0, 0);
  await page.waitForTimeout(1500);
  const before = decodePng(await page.locator('#game canvas').screenshot());
  // On to the rush with the workers at work (held).
  const at = INTRO + 60;
  await page.evaluate((t) => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
  }, at);
  await untilTick(page, at);
  await page.waitForTimeout(1500);
  const after = decodePng(await page.locator('#game canvas').screenshot());
  const h = await hook(page);
  const k = after.height / h.designHeight;
  const workers = (await actorsOf(page)).filter((a) => a.role === 'worker' && a.visible);
  expect(workers.length, 'workers on screen at the gap').toBeGreaterThan(0);
  // Pixels: a worker's body (feet up to ~1/2 its height) differs from the field there before.
  const px = (img: typeof after, x: number, y: number): [number, number, number] => {
    const i = (Math.round(y * k) * img.width + Math.round(x * k)) * 4;
    return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
  };
  const tall = H.workers.heightPx * scoring.planes.mid.scale;
  let drawn = 0;
  for (const w of workers) {
    let differs = 0;
    for (let y = w.y - tall * 0.6; y < w.y - tall * 0.15; y += 4)
      for (let x = w.x - 10; x <= w.x + 10; x += 4) {
        const a = px(before, x, y);
        const b = px(after, x, y);
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 60) differs++;
      }
    if (differs > 10) drawn++;
  }
  expect(drawn, `workers drawn on the canvas, of ${workers.length}`).toBe(workers.length);

  // A shot aimed at a worker's body: the penalty, the duck (read in the same wait).
  const w = workers[0];
  if (w === undefined) throw new Error('no worker');
  const score0 = (await hook(page)).score;
  await fireAt(page, touch, {
    x: w.x,
    y: w.y + H.workers.hitboxes.work.body.oy * scoring.planes.mid.scale,
  });
  await page.evaluate((t) => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t + 30);
  }, at);
  const got = await page.waitForFunction(
    (until) => {
      const tm = window.__TM__;
      const hv = tm?.harvest;
      if (hv !== null && hv !== undefined && hv.bystanderPenalty > 0)
        return {
          penalty: hv.bystanderPenalty,
          score: tm?.score ?? 0,
          ducked: hv.workers.some((x) => x.phase === 'duck'),
        };
      if ((tm?.tick ?? 0) >= until) throw new Error('the shot cost nothing');
      return false;
    },
    at + 30,
    { timeout: 300_000, polling: 'raf' },
  );
  const r = (await got.jsonValue()) as { penalty: number; score: number; ducked: boolean };
  expect(r.penalty).toBe(H.workers.penalty);
  expect(r.score).toBe(score0 - H.workers.penalty);
  expect(r.ducked, 'the worker ducks').toBe(true);
});
