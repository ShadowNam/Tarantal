// v1.7e (D-061): the secrets' tell animals (the cue that replaced the hint glint), in the Bushveld:
// every secret that pays has its tell on screen (the agama, the drongo, the skink), a hit on one
// costs nothing (the score stays, no penalty) and it leaves and comes back, a held frame holds
// them still, and a dusk map (Saturday) lights them with the warm outline (Oupa se Kaart's look).
// Shots are in-page pointer events with a fresh pointerId each (feesdaeHelpers.fireAt); the
// seeded pellet patterns are fixed, so the hit takes several shots, each a miss after ~25 ticks.
import { expect, test, type Page } from '@playwright/test';
import birds from '../../content/birds.json' with { type: 'json' };
import bushveld from '../../content/biomes/bushveld-winter.json' with { type: 'json' };
import { decodePng } from '../../tools/assets/image';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';
import { boot, hook, isLandscape, isTouchProject, startHunt, waitTicks } from './helpers';

const BASE = 'biome=bushveld-winter&seed=42&huntSeconds=300&birds=0&graphics=standard&baboons=0';

interface Tell {
  readonly species: string;
  readonly propId: string;
  readonly frame: string | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly glow: boolean;
  readonly alpha: number;
}

/** The hook's tells (null until the tell chunk is in). */
async function tellsOf(page: Page): Promise<readonly Tell[] | null> {
  return page.evaluate(
    () => (window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells ?? null,
  );
}

/** The biome's props, read loosely (only the secret's reward and tell matter here). */
interface LooseProp {
  readonly id: string;
  readonly secret?: { readonly reward: object; readonly tell?: { readonly species: string } };
}
const paying = (bushveld.props as readonly LooseProp[]).filter(
  (p) => p.secret !== undefined && !('penalty' in p.secret.reward),
);

/** Waits until every tell is listed and drawn from the delivered sheet (the late group). */
async function tellsIn(page: Page): Promise<void> {
  await page.waitForFunction(
    (n) => {
      const t = (window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells;
      return (t?.length ?? 0) === n && (t ?? []).every((x) => x.frame !== null || !x.visible);
    },
    paying.length,
    { timeout: 300_000 },
  );
}

test.use({ serviceWorkers: 'block' });

test('every Bushveld secret has its tell animal on screen, drawn from the sheet', async ({
  page,
}, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  await boot(page, BASE);
  await startHunt(page, isTouchProject(info));
  await tellsIn(page);
  const tells = (await tellsOf(page)) ?? [];
  expect(tells.map((t) => t.propId).sort()).toEqual(paying.map((p) => p.id).sort());
  for (const p of paying) {
    const want = p.secret?.tell?.species;
    expect(tells.find((t) => t.propId === p.id)?.species, p.id).toBe(want);
  }
  // Each one is shown (resting or acting) at some tick in the first seconds.
  await page.waitForFunction(
    () => {
      const t = (window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells;
      return (t ?? []).length > 0 && (t ?? []).every((x) => x.visible && x.frame !== null);
    },
    null,
    { timeout: 120_000 },
  );
  // Review R6: no blink after an action. Watch every frame (polling: raf) until two act → rest
  // changes have been seen, bounded by sim ticks; at each change and the 12 ticks after it, the
  // tell's alpha is 1.
  const start = (await hook(page)).tick;
  const seen = await page.waitForFunction(
    (until) => {
      const w = window as unknown as {
        __TM__?: { tick: number; tells?: Tell[] | null };
        __R6__?: {
          last: Record<string, string>;
          since: Record<string, number>;
          n: number;
          low: number;
        };
      };
      const r6 = (w.__R6__ ??= { last: {}, since: {}, n: 0, low: 1 });
      const tick = w.__TM__?.tick ?? 0;
      for (const t of w.__TM__?.tells ?? []) {
        const f = t.frame ?? '';
        const was = r6.last[t.species] ?? '';
        if (/_act_[ab]$/.test(was) && f.endsWith('_rest')) {
          r6.since[t.species] = tick;
          r6.n++;
        }
        const at = r6.since[t.species];
        if (at !== undefined && tick - at <= 12 && t.visible) r6.low = Math.min(r6.low, t.alpha);
        r6.last[t.species] = f;
      }
      if (r6.n >= 2) return { n: r6.n, low: r6.low };
      return tick >= until ? { n: r6.n, low: r6.low } : false;
    },
    start + 1200,
    { timeout: 600_000, polling: 'raf' },
  );
  const r = (await seen.jsonValue()) as { n: number; low: number };
  expect(r.n, 'act → rest changes seen').toBeGreaterThan(0);
  expect(r.low, 'alpha right after an action').toBe(1);
});

test('a hit on the drongo costs nothing; it leaves and comes back', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(900_000);
  const touch = isTouchProject(info);
  await boot(page, BASE);
  await startHunt(page, touch);
  await tellsIn(page);
  // Pan west until the baobab's drongo is well inside the screen (bounded).
  const drongo = async (): Promise<Tell | undefined> =>
    (await tellsOf(page))?.find((t) => t.species === 'fork_tailed_drongo');
  const w = (await hook(page)).designWidth;
  for (let k = 0; k < 120; k++) {
    const d = await drongo();
    if (d !== undefined && d.x > 300 && d.x < w - 300) break;
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(150);
    await page.keyboard.up('KeyA');
  }
  const hit = birds.tells.species.find((s) => s.id === 'fork_tailed_drongo')?.hit;
  if (hit === undefined) throw new Error('no drongo in birds.json');
  let gone = false;
  let scoreBefore = -1;
  for (let shot = 0; shot < 30 && !gone; shot++) {
    await reloadIfEmpty(page, touch);
    const d = await drongo();
    if (d === undefined || !d.visible) {
      await waitTicks(page, 20);
      continue;
    }
    const fired = await fireAt(page, touch, { x: d.x + hit.ox, y: d.y + hit.oy });
    if (fired === null) continue;
    if (scoreBefore < 0) scoreBefore = fired.score;
    const t0 = (await hook(page)).tick;
    // Read the transient state in the same wait that sees it: the drongo gone.
    gone = await page
      .waitForFunction(
        (until) => {
          const tm = (window as unknown as { __TM__?: { tick: number; tells?: Tell[] | null } })
            .__TM__;
          const t = tm?.tells?.find((x) => x.species === 'fork_tailed_drongo');
          if (t !== undefined && (!t.visible || t.frame?.endsWith('_flee') === true)) return true;
          return (tm?.tick ?? 0) >= until ? 'miss' : false;
        },
        t0 + 25,
        { timeout: 120_000 },
      )
      .then(async (h) => (await h.jsonValue()) === true);
  }
  expect(gone, 'the drongo was hit within 30 shots').toBe(true);
  const after = await hook(page);
  // No birds on this map: a shot scores nothing but a bag, and a tell costs nothing.
  expect(after.score).toBe(scoreBefore);
  // It comes back within goneSeconds (+ its flight), on sim time.
  const back = (((birds.tells.goneSeconds as readonly number[])[1] ?? 9) + 1) * 60;
  const tBack = after.tick + back;
  await page.waitForFunction(
    (until) => {
      const tm = (window as unknown as { __TM__?: { tick: number; tells?: Tell[] | null } }).__TM__;
      const t = tm?.tells?.find((x) => x.species === 'fork_tailed_drongo');
      return (
        (t?.visible === true && t.frame?.endsWith('_flee') === false) || (tm?.tick ?? 0) > until
      );
    },
    tBack,
    { timeout: 300_000 },
  );
  const d = await drongo();
  expect(d?.visible, 'the drongo is back').toBe(true);
});

test('a held frame holds the tells; a dusk map lights them', async ({ page }, info) => {
  test.skip(!isLandscape(info), 'landscape only: portrait shows the rotate card');
  test.setTimeout(600_000);
  const touch = isTouchProject(info);
  // Saturday is the dusk map: the secrets are lit (the tells' warm outline).
  await boot(page, `${BASE}&layout=sat`);
  await startHunt(page, touch);
  await tellsIn(page);
  await page.waitForFunction(
    () =>
      ((window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells ?? []).some(
        (t) => t.visible && t.glow,
      ),
    null,
    { timeout: 120_000 },
  );
  const at = await page.evaluate(() => {
    const t = (window.__TM__?.tick ?? 0) + 30;
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 300_000 });
  await page.waitForTimeout(500);
  const a = await tellsOf(page);
  await page.waitForTimeout(1500);
  const b = await tellsOf(page);
  expect(b).toEqual(a);
  expect((await hook(page)).tick).toBe(at);
});

// Review R11: the tell sheet is in the late group. When it lands after the hunt has started (a
// first visit, a slow connection), the tells must appear then, and really be drawn: before the fix
// the empty full-size placeholder stayed under the key and nothing showed while the hook said
// "visible". The sheet's download is held until the hunt runs and the sim is held; the canvas at
// the drongo's spot is compared before and after it lands (Standard graphics).
// Review R12: the hold outlives the old 15 s timeout (as a slow connection would). Late-group
// images now get 8× the timeout (120 s), so the file is still taken when it lands; the hold must
// stay well inside that (it fails clearly past 100 s, and the route lets go at 100 s anyway).
test('the tells appear when the late sheet lands mid-hunt, drawn on the canvas', async ({
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
  await page.route(/\/late\/img\/tells_sheet\.[0-9a-f]+\.png$/, async (route) => {
    held = true;
    heldAt = Date.now();
    await Promise.race([landed, new Promise((r) => setTimeout(r, 100_000))]);
    await route.continue();
  });
  await boot(page, BASE);
  await startHunt(page, touch);
  // Pan west until the baobab (the drongo's prop) is near the screen's centre (bounded).
  const w = (await hook(page)).designWidth;
  for (let k = 0; k < 120; k++) {
    const b = (await hook(page)).graphics.bounds.find((x) => x.key === 'bushveld/baobab');
    if (b !== undefined && b.x + b.w / 2 > w * 0.3 && b.x + b.w / 2 < w * 0.7) break;
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(150);
    await page.keyboard.up('KeyA');
  }
  // Hold the sim past the fade-in (no shots: the drongo rests or acts, never gone).
  const at = await page.evaluate(() => {
    const t = Math.max(90, (window.__TM__?.tick ?? 0) + 30);
    (window as { __TM_HOLD_AT__?: (tick: number) => void }).__TM_HOLD_AT__?.(t);
    return t;
  });
  await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t, at, { timeout: 300_000 });
  expect(held, 'the tell sheet download was held').toBe(true);
  expect(
    Date.now() - heldAt,
    'boot, pan and hold took longer than the hold may last (100 s of the 120 s lazy timeout)',
  ).toBeLessThan(100_000);
  // Without the sheet nothing is drawn, and the hook says so.
  const waiting = (await tellsOf(page)) ?? [];
  expect(waiting.length).toBeGreaterThan(0);
  expect(waiting.every((t) => !t.visible && t.frame === null)).toBe(true);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  const before = decodePng(await page.locator('#game canvas').screenshot());
  const heldMs = Date.now() - heldAt;
  console.log(`[tells] the sheet's request was held ${Math.round(heldMs / 1000)} s`);
  expect(heldMs, 'the hold must stay inside the lazy timeout (120 s)').toBeLessThan(100_000);
  release();
  await page.waitForFunction(
    () =>
      ((window as unknown as { __TM__?: { tells?: Tell[] | null } }).__TM__?.tells ?? []).some(
        (t) => t.species === 'fork_tailed_drongo' && t.visible && t.alpha === 1,
      ),
    null,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(800);
  const after = decodePng(await page.locator('#game canvas').screenshot());
  const d = (await tellsOf(page))?.find((t) => t.species === 'fork_tailed_drongo');
  if (d === undefined) throw new Error('no drongo');
  const h = await hook(page);
  expect(h.tick, 'still held').toBe(at);
  // The box over the drongo (feet at d.x, d.y; it stands ~45 design px tall).
  const k = after.height / h.designHeight;
  let changed = 0;
  for (let y = Math.round((d.y - 50) * k); y < Math.round((d.y + 2) * k); y++)
    for (let x = Math.round((d.x - 20) * k); x < Math.round((d.x + 20) * k); x++) {
      if (x < 0 || y < 0 || x >= after.width || y >= after.height) continue;
      const i = (y * after.width + x) * 4;
      const diff =
        Math.abs((after.data[i] ?? 0) - (before.data[i] ?? 0)) +
        Math.abs((after.data[i + 1] ?? 0) - (before.data[i + 1] ?? 0)) +
        Math.abs((after.data[i + 2] ?? 0) - (before.data[i + 2] ?? 0));
      if (diff > 60) changed++;
    }
  // The black drongo over the sky and branches: many pixels change.
  expect(changed, 'canvas pixels drawn by the drongo').toBeGreaterThan(30 * k * k);
});
