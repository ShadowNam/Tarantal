// v1.10 (D-067): Reënbui, the first rain and the flying ants. In the Kalahari (Classic: no omen,
// so no Donderstorm), with the test flag ?reenbui=1 (the build-up 2 s in) and, for the checks at
// the swarm, ?reenbuiPhase=swarm (the swarm held for 600 s after half-second earlier phases):
// - the hook sees the phases in order, each on the sim's own ticks, and START never waits for the
//   event's sheet (held in flight, the hunt runs; the sheet then lands and is drawn);
// - flocks feed at a column, and the columns are drawn on the canvas: real pixels at a column on a
//   held frame, compared with the same frame with the columns hidden (lesson 14);
// - a bag in the swarm window scores the Reënbui step (the hook's last awards);
// - the specs that pin a seed don't meet the event: ?e2e without ?reenbui= has none, even on the
//   Kalahari's overcast Wednesday that forces it (lesson 17).
// Shots are in-page pointer events with a fresh pointerId each (helpers.burstAtFlock).
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../tools/assets/image';
import { reloadIfEmpty } from './feesdaeHelpers';
import {
  boot,
  burstAtFlock,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
  tapRect,
  waitTicks,
} from './helpers';

const BASE = 'biome=kalahari-summer&seed=11&huntSeconds=120&graphics=standard&baboons=0&reenbui=1';
const SWARM = `${BASE}&reenbuiPhase=swarm`;

interface Column {
  readonly id: number;
  readonly plane: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly groundTop: number;
  readonly groundBottom: number;
  readonly visible: boolean;
  readonly alpha: number;
}

type Hooked = {
  __TM__?: {
    tick: number;
    reenbui?: {
      phase: string | null;
      buildupTick: number;
      dropsTick: number;
      swarmTick: number;
      easingTick: number;
      endTick: number;
      columns: { id: number; plane: string; x: number; y: number }[];
    } | null;
    reenbuiDraw?: { sheet: boolean; columns: Column[]; rainNear: number } | null;
    flockSpots: { id: number; x: number; y: number; alive: number; feeding?: boolean }[];
    awards: { tick: number; award: number; mult: number; kinds: string[] }[];
  };
};

test.use({ serviceWorkers: 'block' });

/** Waits (sim state first) until the swarm is up with its columns and the sheet is drawn. */
async function swarmDrawn(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const tm = (window as unknown as Hooked).__TM__;
      return (
        tm?.reenbui?.phase === 'swarm' &&
        tm.reenbui.columns.length > 0 &&
        tm.reenbuiDraw?.sheet === true &&
        tm.reenbuiDraw.columns.some((c) => c.visible && c.alpha >= 0.9)
      );
    },
    null,
    { timeout: 300_000 },
  );
}

test('the phases come in order on the sim ticks; START never waits for the sheet', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  // Hold the event's sheet in flight: the hunt must start and run without it.
  let release: () => void = () => undefined;
  const landed = new Promise<void>((r) => {
    release = r;
  });
  const sheet = { held: false };
  await page.route('**/reenbui_sheet.*.png', async (route) => {
    sheet.held = true;
    await Promise.race([landed, new Promise((r) => setTimeout(r, 120_000))]);
    await route.continue();
  });
  await boot(page, BASE);
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 120_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(() => (window.__TM__?.tick ?? 0) > 60, null, { timeout: 300_000 });
  expect((await hook(page)).scene).toBe('hunt');
  // Running, and (if its download had started) still without the sheet.
  if (sheet.held)
    expect(
      await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbuiDraw?.sheet ?? false),
    ).toBe(false);
  release();
  // Every phase seen, in order, each first seen inside its own sim tick range.
  const got = await page.waitForFunction(
    () => {
      const tm = (window as unknown as Hooked).__TM__;
      const w = window as unknown as { __RB__?: { p: string | null; t: number }[] };
      const log = (w.__RB__ ??= []);
      const v = tm?.reenbui;
      if (tm === undefined || v === undefined || v === null) return false;
      const p = v.phase;
      if (log.length === 0 || log[log.length - 1]?.p !== p) log.push({ p, t: tm.tick });
      return log.some((e) => e.p === 'easing') && p === null ? { log, v } : false;
    },
    null,
    { timeout: 600_000, polling: 'raf' },
  );
  const { log, v } = (await got.jsonValue()) as {
    log: { p: string | null; t: number }[];
    v: NonNullable<NonNullable<Hooked['__TM__']>['reenbui']>;
  };
  const phases = log.map((e) => e.p).filter((p): p is string => p !== null);
  expect(phases).toEqual(['buildup', 'drops', 'swarm', 'easing']);
  const range: Record<string, [number, number]> = {
    buildup: [v.buildupTick, v.dropsTick],
    drops: [v.dropsTick, v.swarmTick],
    swarm: [v.swarmTick, v.easingTick],
    easing: [v.easingTick, v.endTick],
  };
  for (const e of log) {
    if (e.p === null) continue;
    const r = range[e.p];
    expect(r, e.p).toBeDefined();
    expect(e.t, `${e.p} seen at`).toBeGreaterThanOrEqual(r?.[0] ?? 0);
    expect(e.t, `${e.p} seen at`).toBeLessThan(r?.[1] ?? 0);
  }
  expect(v.swarmTick - v.buildupTick).toBe(9 * 60);
  // The sheet arrived after all and its view is drawing.
  await page.waitForFunction(
    () => (window as unknown as Hooked).__TM__?.reenbuiDraw?.sheet === true,
    null,
    { timeout: 300_000 },
  );
});

test('flocks feed at the columns, and the columns are drawn on the canvas', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, SWARM);
  await startHunt(page, touch);
  await swarmDrawn(page);
  // A flock comes down to feed (sim state, read in the hook).
  await page.waitForFunction(
    () => ((window as unknown as Hooked).__TM__?.flockSpots ?? []).some((f) => f.feeding === true),
    null,
    { timeout: 300_000 },
  );
  // Each column's foot stands on its plane's ground band.
  const cols: readonly Column[] = await page.evaluate(
    () => (window as unknown as Hooked).__TM__?.reenbuiDraw?.columns ?? [],
  );
  for (const c of cols) {
    expect(c.y, `column ${c.id} foot`).toBeGreaterThanOrEqual(c.groundTop - 2);
    expect(c.y, `column ${c.id} foot`).toBeLessThanOrEqual(c.groundBottom + 2);
  }
  // Hold a fresh frame, then grab it with the columns drawn and with them hidden (same tick: the
  // rain and everything else are the same; only the columns differ).
  await page.evaluate(() => {
    const t = (window.__TM__?.tick ?? 0) + 10;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
  });
  const vp = page.viewportSize();
  if (vp !== null && !touch) await page.mouse.move(vp.width / 2, vp.height * 0.3);
  await page.waitForTimeout(1500);
  const shot = async (): Promise<ReturnType<typeof decodePng>> => {
    const f0 = await page.evaluate(() => window.__TM__?.sceneryFrames ?? 0);
    await page.waitForFunction((f) => (window.__TM__?.sceneryFrames ?? 0) > f + 2, f0, {
      timeout: 60_000,
    });
    return decodePng(await page.locator('#game canvas').screenshot());
  };
  const on = await shot();
  await page.evaluate(() => {
    (window as { __TM_REENBUI_HIDE__?: boolean }).__TM_REENBUI_HIDE__ = true;
  });
  const off = await shot();
  await page.evaluate(() => {
    (window as { __TM_REENBUI_HIDE__?: boolean }).__TM_REENBUI_HIDE__ = false;
  });
  const h = await hook(page);
  const k = on.height / h.designHeight;
  const drawnCols: readonly Column[] = await page.evaluate(
    () => (window as unknown as Hooked).__TM__?.reenbuiDraw?.columns ?? [],
  );
  const shown = drawnCols.filter((c) => c.visible && c.x > 40 && c.x < h.designWidth - 40);
  expect(shown.length, 'a column on screen').toBeGreaterThan(0);
  let drawn = 0;
  for (const c of shown) {
    const tall = c.plane === 'far' ? 60 : 160;
    let differs = 0;
    let n = 0;
    for (let y = c.y - tall; y <= c.y; y += 2)
      for (let x = c.x - 8; x <= c.x + 8; x += 2) {
        const i = (Math.round(y * k) * on.width + Math.round(x * k)) * 4;
        const d =
          Math.abs((on.data[i] ?? 0) - (off.data[i] ?? 0)) +
          Math.abs((on.data[i + 1] ?? 0) - (off.data[i + 1] ?? 0)) +
          Math.abs((on.data[i + 2] ?? 0) - (off.data[i + 2] ?? 0));
        n++;
        if (d > 24) differs++;
      }
    if (differs >= n * 0.08) drawn++;
  }
  expect(drawn, `columns drawn on the canvas, of ${shown.length}`).toBeGreaterThan(0);
});

test('a bag in the swarm window scores the Reënbui bonus', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, SWARM);
  await startHunt(page, touch);
  await swarmDrawn(page);
  let got = false;
  for (let attempt = 0; attempt < 12 && !got; attempt++) {
    await reloadIfEmpty(page, touch);
    const target = await page.evaluate(() => {
      const tm = (window as unknown as Hooked).__TM__;
      const w = window.__TM__?.designWidth ?? 1920;
      const spots = (tm?.flockSpots ?? []).filter((f) => f.alive > 0 && f.x > 120 && f.x < w - 120);
      return (spots.find((f) => f.feeding === true) ?? spots[0])?.id ?? null;
    });
    if (target === null) {
      await waitTicks(page, 60);
      continue;
    }
    const from = await page.evaluate(() => window.__TM__?.tick ?? 0);
    await burstAtFlock(page, touch, target, 2, 22);
    // The award and its steps, read in the same call that sees them (lesson 30).
    got = await page
      .waitForFunction(
        (t0) =>
          ((window as unknown as Hooked).__TM__?.awards ?? []).some(
            (a) => a.tick >= t0 && a.kinds.includes('reenbui'),
          ),
        from,
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false);
  }
  expect(got, 'a bag with the Reënbui step').toBe(true);
  const a = await page.evaluate(() =>
    ((window as unknown as Hooked).__TM__?.awards ?? []).filter((x) => x.kinds.includes('reenbui')),
  );
  expect(a[0]?.mult ?? 0).toBeGreaterThan(1);
});

test('specs that pin a seed never meet it: none under ?e2e without ?reenbui=, even on a forcing day', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(300_000);
  const touch = isTouchProject(info);
  await boot(page, 'biome=kalahari-summer&layout=wed&seed=11&graphics=standard&baboons=0');
  await startHunt(page, touch);
  await waitTicks(page, 30);
  expect(await page.evaluate(() => (window as unknown as Hooked).__TM__?.reenbui ?? null)).toBe(
    null,
  );
});
