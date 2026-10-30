// v1.8c (D-063): Die Oes (The Harvest). From the title's Die Oes button: the intro (the fence
// breaks, the family barges in), the rush, the fence closing and the Harvest tally with a local
// best; a tap in the intro skips it without a shot; a shot aimed at a worker costs the penalty and
// the worker ducks; and the Harvest's sheet is really drawn on the canvas (pixels at a worker's
// spot differ once the workers stand there). Short rushes via ?huntSeconds (the rush follows it);
// the troop is off (?baboons=0) where a raid would only add noise. Shots are in-page pointer events
// with a fresh pointerId each (feesdaeHelpers.fireAt); every wait is bounded by sim ticks.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import modes from '../../content/modes.json' with { type: 'json' };
import { crop, decodePng, encodePng8, type Rgba } from '../../tools/assets/image';
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
  /** The body's hit ellipse on screen (workers, warthogs). */
  readonly body: { x: number; y: number; rx: number; ry: number } | null;
  readonly facing: 1 | -1;
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

/** The canvas with and without the Harvest's actors, at the same held tick (test hook). */
async function withAndWithout(page: Page): Promise<{ on: Rgba; off: Rgba; k: number }> {
  const grab = async (): Promise<Rgba> =>
    decodePng(await page.locator('#game canvas').screenshot());
  const hide = async (on: boolean): Promise<void> => {
    await page.evaluate((o) => {
      (window as { __TM_HARVEST_HIDE__?: (x: boolean) => void }).__TM_HARVEST_HIDE__?.(o);
    }, on);
    await page.waitForTimeout(800);
  };
  await hide(false);
  const on = await grab();
  await hide(true);
  const off = await grab();
  await hide(false);
  const h = await hook(page);
  return { on, off, k: on.height / h.designHeight };
}

/**
 * Review round 3: the horizontal centroid (design px) of the pixels that change when the actors
 * are hidden, in a band ±halfW round the body's centre at torso height (±ry/2); null: none.
 */
function changedCentroidX(
  pair: { on: Rgba; off: Rgba; k: number },
  b: { x: number; y: number; ry: number },
  halfW: number,
): number | null {
  const { on, off, k } = pair;
  let sum = 0;
  let n = 0;
  for (let y = b.y - b.ry / 2; y <= b.y + b.ry / 2; y += 1)
    for (let x = b.x - halfW; x <= b.x + halfW; x += 1) {
      const px = Math.round(x * k);
      const py = Math.round(y * k);
      if (px < 0 || py < 0 || px >= on.width || py >= on.height) continue;
      const i = (py * on.width + px) * 4;
      const d =
        Math.abs((on.data[i] ?? 0) - (off.data[i] ?? 0)) +
        Math.abs((on.data[i + 1] ?? 0) - (off.data[i + 1] ?? 0)) +
        Math.abs((on.data[i + 2] ?? 0) - (off.data[i + 2] ?? 0));
      if (d > 40) {
        sum += x;
        n++;
      }
    }
  return n === 0 ? null : sum / n;
}

/** On failure: the actor's crop with and without the actors, attached to the report. */
async function attachPair(
  info: TestInfo,
  name: string,
  pair: { on: Rgba; off: Rgba; k: number },
  b: { x: number; y: number; rx: number; ry: number },
): Promise<void> {
  const k = pair.k;
  const x0 = Math.max(0, Math.round((b.x - b.rx - 60) * k));
  const y0 = Math.max(0, Math.round((b.y - b.ry - 60) * k));
  const w = Math.min(pair.on.width - x0, Math.round((2 * b.rx + 120) * k));
  const hh = Math.min(pair.on.height - y0, Math.round((2 * b.ry + 120) * k));
  for (const [tag, img] of [
    ['with', pair.on],
    ['without', pair.off],
  ] as const)
    await info.attach(`${name}-${tag}.png`, {
      body: Buffer.from(encodePng8(crop(img, x0, y0, Math.max(1, w), Math.max(1, hh)))),
      contentType: 'image/png',
    });
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
  // Review round 3: the mouse rests at the bottom centre, outside both edge-pan bands (at 0, 0 it
  // panned the camera between the two grabs and the workers slid out of view).
  if (!touch) {
    const box = await page.locator('#game canvas').boundingBox();
    if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
  }
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
  // Review round 2: only workers whose body is fully on screen (the iPhone's view is narrower).
  const workers = (await actorsOf(page)).filter(
    (a) =>
      a.role === 'worker' &&
      a.visible &&
      a.body !== null &&
      a.body.x - a.body.rx > 0 &&
      a.body.x + a.body.rx < h.designWidth &&
      a.body.y - a.body.ry > 0,
  );
  expect(workers.length, 'workers fully on screen at the gap').toBeGreaterThan(0);
  // Pixels inside each worker's body ellipse differ from the field there before they came.
  const px = (img: typeof after, x: number, y: number): [number, number, number] => {
    const i = (Math.round(y * k) * img.width + Math.round(x * k)) * 4;
    return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
  };
  // Several points inside each body ellipse; a point inside another worker's ellipse is skipped.
  let drawn = 0;
  const report: string[] = [];
  for (const w of workers) {
    const b = w.body;
    if (b === null) continue;
    let samples = 0;
    let differs = 0;
    for (let dy = -0.8; dy <= 0.81; dy += 0.2)
      for (let dx = -0.6; dx <= 0.61; dx += 0.3) {
        const x = b.x + dx * b.rx;
        const y = b.y + dy * b.ry;
        const other = workers.some(
          (o) =>
            o !== w &&
            o.body !== null &&
            ((x - o.body.x) / o.body.rx) ** 2 + ((y - o.body.y) / o.body.ry) ** 2 <= 1,
        );
        if (other) continue;
        samples++;
        const a = px(before, x, y);
        const c = px(after, x, y);
        if (Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]) > 40) differs++;
      }
    report.push(`${String(w.id)}: ${String(differs)}/${String(samples)}`);
    if (samples > 0 && differs >= samples / 4) drawn++;
  }
  expect(drawn, `workers drawn on the canvas, of ${workers.length} (${report.join(', ')})`).toBe(
    workers.length,
  );

  // Review round 3: each worker's art sits on its hit ellipse — the centroid of the pixels that
  // change when the actors are hidden (same held tick), in a ±45 px band at torso height, lies
  // within half the ellipse's radius of its centre (a mirrored frame was drawn up to 20 px off).
  const pair = await withAndWithout(page);
  for (const w of workers) {
    const b = w.body;
    if (b === null) continue;
    const cx = changedCentroidX(pair, b, 45);
    const ok = cx !== null && Math.abs(cx - b.x) <= 0.5 * b.rx;
    if (!ok) await attachPair(info, `worker-${String(w.id)}`, pair, b);
    expect(
      ok,
      `worker ${String(w.id)} drawn on its ellipse (centroid ${String(cx)} vs ${b.x.toFixed(1)} ± ${(0.5 * b.rx).toFixed(1)})`,
    ).toBe(true);
  }

  // A shot aimed at a worker's body centre (the sim's own ellipse, from the hook): the penalty
  // and the duck, read in the same wait; bounded attempts, each held 30 ticks.
  const score0 = (await hook(page)).score;
  let r: { penalty: number; score: number; ducked: boolean } | null = null;
  let tick = at;
  for (let attempt = 0; attempt < 4 && r === null; attempt++) {
    const w = (await actorsOf(page)).find((a) => a.id === workers[0]?.id);
    const b = w?.body ?? null;
    if (b === null) throw new Error('the worker has no body on screen');
    const aim = { x: Math.round(b.x), y: Math.round(b.y) };
    const inside = ((aim.x - b.x) / b.rx) ** 2 + ((aim.y - b.y) / b.ry) ** 2 <= 1;
    expect(inside, 'the aim point is inside the body ellipse').toBe(true);
    await fireAt(page, touch, aim);
    const until = tick + 30;
    await page.evaluate((t) => {
      (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    }, until);
    const got = await page.waitForFunction(
      (u) => {
        const tm = window.__TM__;
        const hv = tm?.harvest;
        if (hv !== null && hv !== undefined && hv.bystanderPenalty > 0)
          return {
            penalty: hv.bystanderPenalty,
            score: tm?.score ?? 0,
            ducked: hv.workers.some((x) => x.phase === 'duck'),
          };
        return (tm?.tick ?? 0) >= u ? 'miss' : false;
      },
      until,
      { timeout: 120_000, polling: 'raf' },
    );
    const v = (await got.jsonValue()) as
      { penalty: number; score: number; ducked: boolean } | 'miss';
    if (v !== 'miss') r = v;
    tick = until;
  }
  if (r === null) throw new Error('four shots aimed at a worker cost nothing');
  expect(r.penalty).toBe(H.workers.penalty);
  expect(r.score).toBe(score0 - H.workers.penalty);
  expect(r.ducked, 'the worker ducks').toBe(true);

  // Review round 3: a LEFT-facing (mirrored) warthog's art sits on its hit ellipse too. Step on
  // (bounded) until one is fully on screen with no other actor near it, then the same check.
  let checked = false;
  for (let step = 0; step < 8 && !checked; step++) {
    const t = (await hook(page)).tick + 60;
    await page.evaluate((x) => {
      (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(x);
    }, t);
    await untilTick(page, t);
    await page.waitForTimeout(800);
    const hw = (await hook(page)).designWidth;
    const all = await actorsOf(page);
    const hog = all.find((a) => {
      const b = a.body;
      if (a.role !== 'warthog' || !a.visible || a.facing !== -1 || b === null) return false;
      if (a.frame === null || !a.frame.startsWith('wh_') || a.frame.startsWith('wh_tumble'))
        return false;
      if (b.x - b.rx - 40 < 0 || b.x + b.rx + 40 > hw || b.y - b.ry < 0) return false;
      // Nothing else of the Harvest's reaching into the band (her piglets trail ~100 px behind).
      return !all.some(
        (o) =>
          o !== a &&
          o.visible &&
          o.role !== 'gap' &&
          o.role !== 'sign' &&
          Math.abs(o.x - b.x) < b.rx + 45 &&
          Math.abs(o.y - a.y) < b.ry * 3,
      );
    });
    const b = hog?.body ?? null;
    if (hog === undefined || b === null) continue;
    const pairW = await withAndWithout(page);
    const cx = changedCentroidX(pairW, b, b.rx + 20);
    const ok = cx !== null && Math.abs(cx - b.x) <= 0.5 * b.rx;
    if (!ok) await attachPair(info, `warthog-${String(hog.id)}`, pairW, b);
    expect(
      ok,
      `a left-facing warthog drawn on its ellipse (centroid ${String(cx)} vs ${b.x.toFixed(1)} ± ${(0.5 * b.rx).toFixed(1)})`,
    ).toBe(true);
    checked = true;
  }
  expect(checked, 'a left-facing warthog came clear on screen within 8 steps').toBe(true);
});
