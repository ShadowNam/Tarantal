// v1.18 (D-081): Die Oes, Phase 2 — "Defend the field". Started straight away with the test flag
// (?harvestPhase2=1; ?harvestPhase2Seconds keeps its clock short): the banner, then the HUD's
// "Animals left: N" and Phase 2's own clock (on phones too, clear of the other HUD), a warthog
// hit counts the animals down, the clock ends it and the Harvest tally has the Phase 2 lines; and
// the Phase 2 sheet (a lazy file of its own) is really drawn on the canvas — pixels at a jumping,
// squeezing or climbing animal change when the Harvest's actors are hidden at the same held tick.
// Shots are in-page pointer events with a fresh pointerId each; every wait is bounded by ticks.
import { expect, test, type Page } from '@playwright/test';
import modes from '../../content/modes.json' with { type: 'json' };
import { decodePng, type Rgba } from '../../tools/assets/image';
import { fireAt } from './feesdaeHelpers';
import { boot, hook, isLandscape, isTouchProject, tapRect } from './helpers';

const P2 = modes.modes.harvest.phase2;
const BANNER = Math.round(P2.bannerSeconds * 60);
/** The Phase 2 sheet's frames (src/game/view/harvest/harvest2Sheet.ts). */
const SHEET2 = [
  'wh_jump_a',
  'wh_jump_b',
  'wh_squeeze',
  'pg_squeeze',
  'bb_climb_a',
  'bb_climb_b',
  'bb_drop',
];

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

/** Holds the sim at `t` and waits there (fails fast if the sim stops short of it). */
async function holdAt(page: Page, t: number): Promise<void> {
  await page.evaluate((x) => {
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(x);
  }, t);
  await page.waitForFunction(
    (want) => {
      const w = window as unknown as { __H2T__?: { tick: number; at: number } };
      const tick = window.__TM__?.tick ?? 0;
      if (tick >= want) return true;
      const now = performance.now();
      if (w.__H2T__ === undefined || w.__H2T__.tick !== tick) w.__H2T__ = { tick, at: now };
      else if (now - w.__H2T__.at > 20_000)
        throw new Error(`the sim stopped at tick ${String(tick)} (< ${String(want)})`);
      return false;
    },
    t,
    { timeout: 300_000, polling: 250 },
  );
}

/** The mouse rests at the bottom centre, outside the edge-pan bands. */
async function parkMouse(page: Page, touch: boolean): Promise<void> {
  if (touch) return;
  const box = await page.locator('#game canvas').boundingBox();
  if (box !== null) await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.97);
}

test.use({ serviceWorkers: 'block' });

test('Phase 2: the banner, the HUD, a hit warthog counts down, the clock ends it, the tally', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await boot(
    page,
    `seed=7&baboons=0&graphics=standard&harvestPhase2=1&harvestPhase2Seconds=8&holdAt=${String(BANNER - 30)}`,
  );
  await startHarvest(page, touch);
  await parkMouse(page, touch);
  await holdAt(page, BANNER - 30);
  // The banner (lazy strings: read in the same wait that sees them).
  const banner = await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      const b = tm?.phase2Hud?.banner ?? '';
      return tm?.harvest?.phase === 'banner' && b !== '' ? b : false;
    },
    null,
    { timeout: 120_000 },
  );
  expect(String(await banner.jsonValue())).toMatch(/defend|verdedig|verteidige/i);
  const h0 = await hook(page);
  expect(h0.harvest?.phase2?.left).toBe(P2.waves.length);
  expect(h0.harvest?.workers ?? [], 'the workers are off to the farmhouse').toHaveLength(0);
  expect(h0.harvest?.hole?.patched, 'the small hole is patched').toBe(true);
  expect(h0.harvest?.repair, 'the fence is whole').toBe(1);

  // Into Phase 2, the first burst in the field: the HUD shows the counter and the clock.
  let tick = BANNER + 150;
  await holdAt(page, tick);
  const hud = await page.waitForFunction(
    () => {
      const p = window.__TM__?.phase2Hud;
      return p?.visible === true && p.plate !== null ? p : false;
    },
    null,
    { timeout: 120_000 },
  );
  const p = (await hud.jsonValue()) as {
    left: number;
    seconds: number;
    plate: { x: number; y: number; w: number; h: number };
  };
  expect(p.left).toBe(P2.waves.length);
  expect(p.seconds).toBeGreaterThan(0);
  expect(p.seconds).toBeLessThanOrEqual(8);
  // Clear of every other HUD element (the crop meter's own rects aside), phones too.
  const rects = (await hook(page)).rects;
  const hit = (a: typeof p.plate, b: typeof p.plate): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [name, o] of Object.entries(rects))
    if (!name.startsWith('harvest') && name !== 'charms' && name !== 'quota')
      expect(hit(p.plate, o), `the Phase 2 plate over ${name}`).toBe(false);
  await info.attach('phase2-hud.png', {
    body: await page.locator('#game canvas').screenshot(),
    contentType: 'image/png',
  });

  // A warthog on screen: shots at its body until one hits (bounded); the counter goes down,
  // read in the same wait that sees the hit.
  let counted: { before: number; after: number } | null = null;
  for (let attempt = 0; attempt < 10 && counted === null; attempt++) {
    const h = await hook(page);
    const before = h.harvest?.phase2?.left ?? 0;
    const hog = (h.harvestActors ?? []).find(
      (a) =>
        a.role === 'p2-warthog' &&
        a.visible &&
        a.body !== null &&
        a.phase !== 'flee' &&
        a.phase !== 'tumble' &&
        a.body.x > 60 &&
        a.body.x < h.designWidth - 60,
    );
    if (hog === undefined || hog.body === null) {
      tick += 30;
      await holdAt(page, tick);
      continue;
    }
    await fireAt(page, touch, { x: Math.round(hog.body.x), y: Math.round(hog.body.y) });
    const until = tick + 20;
    await page.evaluate((t) => {
      (window as { __TM_HOLD_AT__?: (x: number) => void }).__TM_HOLD_AT__?.(t);
    }, until);
    const got = await page.waitForFunction(
      ([u, id, b]) => {
        const tm = window.__TM__;
        const a = tm?.harvest?.phase2?.animals.find((x) => x.id === id);
        const left = tm?.harvest?.phase2?.left ?? b;
        if (a !== undefined && (a.phase === 'flee' || a.phase === 'tumble') && left < b)
          return { before: b, after: left };
        return (tm?.tick ?? 0) >= u ? 'miss' : false;
      },
      [until, hog.id, before] as const,
      { timeout: 120_000, polling: 'raf' },
    );
    const v = (await got.jsonValue()) as { before: number; after: number } | 'miss';
    if (v !== 'miss') counted = v;
    tick = until;
  }
  if (counted === null) throw new Error('ten tries found and hit no Phase 2 warthog');
  expect(counted.after).toBeLessThan(counted.before);
  // The HUD follows.
  await page.waitForFunction((n) => (window.__TM__?.phase2Hud?.left ?? -1) <= n, counted.after, {
    timeout: 60_000,
  });

  // The clock ends it (not the crop, not all stopped): the verdict, then the tally's lines.
  await page.evaluate(() => {
    (window as { __TM_HOLD_AT__?: (x: number) => void }).__TM_HOLD_AT__?.(1_000_000);
  });
  const end = await page.waitForFunction(
    () => {
      const tm = window.__TM__;
      const r = tm?.harvest?.phase2?.result ?? null;
      const w = window as unknown as { __P2R__?: typeof r };
      if (r !== null) w.__P2R__ = r;
      if (tm?.scene === 'tally' && (tm.tallyRows?.length ?? 0) > 0)
        return { result: w.__P2R__ ?? null, rows: tm.tallyRows ?? [] };
      if ((tm?.tick ?? 0) > 60 * 60) throw new Error('no tally by tick 3600');
      return false;
    },
    null,
    { timeout: 600_000, polling: 'raf' },
  );
  const e = (await end.jsonValue()) as {
    result: { reason: string; stopped: number; total: number; crop: number } | null;
    rows: string[];
  };
  expect(e.result?.reason, 'the clock ran out').toBe('time');
  expect(e.result?.total).toBe(P2.waves.length);
  const stopped = e.rows.find((r) =>
    r.endsWith(`${String(e.result?.stopped)} / ${String(P2.waves.length)}`),
  );
  expect(stopped, `a Phase 2 "stopped" line in ${e.rows.join(' ; ')}`).toBeDefined();
  expect(
    e.rows.some((r) => r.endsWith(`${String(Math.floor(e.result?.crop ?? -1))} %`)),
    'the crop at the end',
  ).toBe(true);
});

test('the Phase 2 sheet is drawn: a jump, squeeze or climb on the canvas', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  await boot(page, `seed=7&baboons=0&graphics=standard&harvestPhase2=1&holdAt=${String(BANNER)}`);
  await startHarvest(page, touch);
  await parkMouse(page, touch);
  let tick = BANNER;
  await holdAt(page, tick);
  // Step on (bounded) until a Phase 2 sheet frame is on screen, clear of the other actors.
  let found: { x: number; y: number; frame: string } | null = null;
  for (let step = 0; step < 60 && found === null; step++) {
    tick += 8;
    await holdAt(page, tick);
    const h = await hook(page);
    const all = (h.harvestActors ?? []).filter((a) => a.visible);
    const a = all.find(
      (x) =>
        x.frame !== null &&
        SHEET2.includes(x.frame) &&
        x.x > 120 &&
        x.x < h.designWidth - 120 &&
        x.y > 200 &&
        !all.some((o) => o !== x && o.role.startsWith('p2') && Math.abs(o.x - x.x) < 140),
    );
    if (a?.frame) found = { x: a.x, y: a.y, frame: a.frame };
  }
  if (found === null) throw new Error('no jump, squeeze or climb came clear on screen in 60 steps');
  // Wait for the sheet to be delivered and drawn at this held tick (the frame already says so),
  // then the canvas with and without the actors.
  await page.waitForTimeout(1200);
  const grab = async (): Promise<Rgba> =>
    decodePng(await page.locator('#game canvas').screenshot());
  const hide = async (on: boolean): Promise<void> => {
    await page.evaluate((o) => {
      (window as { __TM_HARVEST_HIDE__?: (x: boolean) => void }).__TM_HARVEST_HIDE__?.(o);
    }, on);
    await page.waitForTimeout(800);
  };
  const on = await grab();
  await hide(true);
  const off = await grab();
  await hide(false);
  const h = await hook(page);
  const k = on.height / h.designHeight;
  let changed = 0;
  for (let y = found.y - 90; y <= found.y; y += 3)
    for (let x = found.x - 70; x <= found.x + 70; x += 3) {
      const i = (Math.round(y * k) * on.width + Math.round(x * k)) * 4;
      const d =
        Math.abs((on.data[i] ?? 0) - (off.data[i] ?? 0)) +
        Math.abs((on.data[i + 1] ?? 0) - (off.data[i + 1] ?? 0)) +
        Math.abs((on.data[i + 2] ?? 0) - (off.data[i + 2] ?? 0));
      if (d > 40) changed++;
    }
  expect(changed, `pixels drawn for ${found.frame} at ${found.x}, ${found.y}`).toBeGreaterThan(40);
});
