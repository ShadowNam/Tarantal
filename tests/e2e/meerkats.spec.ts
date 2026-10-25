// v1.7 (D-044): the desert maps' meerkat colonies in a real hunt. Saturday's Kalahari map has one
// colony on the mid plane (content/biomes/kalahari-summer.json); the test pans it to the middle
// of the screen and then: the meerkats come out and dive after a nearby shot; a shot meerkat
// costs −10 and pops out of its hole to scold; holding fire with the family out takes the
// Familiefoto. Everything is read from the test hook (`meerkats`, `meerkatLog`), and every
// transient value is read in the same waitForFunction that sees it.
import { expect, test, type Page } from '@playwright/test';
import {
  SCREENSHOTS,
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  startHunt,
} from './helpers';

const COLONY = 'dune_colony';
const QUERY = 'biome=kalahari-summer&layout=sat&seed=42&huntSeconds=90';

/** The colony's centre on screen (mean of its meerkats' feet), or null before the hunt. */
async function colonyX(page: Page): Promise<number | null> {
  return page.evaluate((id) => {
    const ms = window.__TM__?.meerkats.filter((m) => m.colony === id) ?? [];
    return ms.length === 0 ? null : ms.reduce((t, m) => t + m.x, 0) / ms.length;
  }, COLONY);
}

/** Pans until the colony stands within 200 px of the screen's centre. */
async function colonyInView(page: Page): Promise<void> {
  // The biome's art loads lazily: wait for the hunt to run (and the colony to be in the hook).
  await page.waitForFunction(
    (id) => (window.__TM__?.tick ?? 0) > 30 && window.__TM__?.meerkats.some((m) => m.colony === id),
    COLONY,
    { timeout: 120_000 },
  );
  const h = await hook(page);
  const x = await colonyX(page);
  if (x === null) throw new Error('no colony in the hook');
  const centre = h.designWidth / 2;
  if (Math.abs(x - centre) < 200) return;
  const key = x > centre ? 'ArrowRight' : 'ArrowLeft';
  await page.keyboard.down(key);
  await page.waitForFunction(
    (id) => {
      const g = window.__TM__;
      const ms = g?.meerkats.filter((m) => m.colony === id) ?? [];
      if (g === undefined || ms.length === 0) return false;
      const cx = ms.reduce((t, m) => t + m.x, 0) / ms.length;
      return Math.abs(cx - g.designWidth / 2) < 200;
    },
    COLONY,
    { timeout: 300_000 },
  );
  await page.keyboard.up(key);
  // Then wait for the camera to stop (10 ticks without moving), so the shots below land where
  // they were aimed.
  await page.waitForFunction(
    () => {
      const g = window.__TM__;
      const w = window as unknown as { __camStill?: { x: number; t: number } };
      if (g === undefined) return false;
      if (w.__camStill?.x !== g.cameraX) {
        w.__camStill = { x: g.cameraX, t: g.tick };
        return false;
      }
      return g.tick - w.__camStill.t >= 10;
    },
    null,
    { timeout: 60_000 },
  );
}

/**
 * Fires one shot in-page and waits until the sim has counted it. The point is worked out in the
 * same page call from where things are now: `sand` is just right of the colony's burrows and above
 * them (no meerkat in the way), `sky` is far left, high up. Pointer events go straight to the
 * canvas, as in weavers.spec.ts and the −10 test: on WebKit's iPhone profile (CI, 25 Oct) no dive
 * or photo followed a page.touchscreen tap after a held arrow key, while in-page shots worked.
 */
async function shootAt(page: Page, touch: boolean, aim: 'sand' | 'sky'): Promise<void> {
  const before = await page.evaluate(
    ([id, where, isTouch]) => {
      const g = window.__TM__;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      if (g === undefined || canvas === null) throw new Error('game not booted');
      let x = g.designWidth * 0.2;
      let y = g.designHeight * 0.12;
      if (where === 'sand') {
        const ms = g.meerkats.filter((m) => m.colony === id);
        x = Math.min(g.designWidth * 0.8, Math.max(...ms.map((m) => m.x)) + 120);
        y = Math.max(...ms.map((m) => m.y)) - 170;
      }
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + (x / g.designWidth) * r.width,
        clientY: r.top + (y / g.designHeight) * r.height,
        pointerId: 932,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      const shots = g.shots;
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return shots;
    },
    [COLONY, aim, touch] as const,
  );
  await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, before, {
    timeout: 60_000,
  });
}

/** Waits until at least `n` meerkats of the colony are above ground. */
async function outAtLeast(page: Page, n: number): Promise<void> {
  await page.waitForFunction(
    ([id, k]) =>
      (window.__TM__?.meerkats.filter(
        (m) => m.colony === id && ['sit', 'forage', 'sunbathe', 'sentinel'].includes(m.pose),
      ).length ?? 0) >= k,
    [COLONY, n] as const,
    { timeout: 300_000 },
  );
}

test.describe('meerkat colonies (v1.7, D-044)', () => {
  test('meerkats appear on a Kalahari hunt and dive after a nearby shot', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, QUERY);
    await startHunt(page, touch);
    await colonyInView(page);
    expect((await hook(page)).missingTextures).toEqual([]);
    await outAtLeast(page, 2);
    await page.screenshot({ path: `${SCREENSHOTS}/meerkats-out-${info.project.name}.png` });
    // A shot into the sand just right of the burrows (no meerkat in the way: above them).
    await shootAt(page, touch, 'sand');
    // The colony dives: the log says so, and soon every meerkat is in a hole.
    await page.waitForFunction(
      () => window.__TM__?.meerkatLog.includes('dived:shot') === true,
      null,
      {
        timeout: 120_000,
      },
    );
    await page.waitForFunction(
      (id) =>
        window.__TM__?.meerkats.filter((m) => m.colony === id).every((m) => m.pose === 'hidden') ===
        true,
      COLONY,
      { timeout: 120_000 },
    );
    expect(errors).toEqual([]);
  });

  test('shooting a meerkat costs −10 and it pops out to scold', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, QUERY);
    await startHunt(page, touch);
    await colonyInView(page);
    await outAtLeast(page, 1);
    // Pick an adult that is out (inside the screen's middle) and tap its body in the same page
    // call, so it can't have moved off between the two. The shot counts when the meerkat log gets a
    // new "hit:" entry. A shot that also bagged a bird (the colonies sit nearer the flocks since
    // b857284) or landed in the penalty cooldown (hit:0) is tried again after the cooldown, so the
    // score shows the meerkat's −10 alone. A miss is tried again with a fresh pick.
    let result: { before: number; after: number } | null = null;
    for (let attempt = 0; attempt < 8 && result === null; attempt++) {
      await outAtLeast(page, 1);
      const shot = await page.evaluate(
        ([id, isTouch]) => {
          const g = window.__TM__;
          const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
          if (g === undefined || canvas === null) return null;
          const m = g.meerkats.find(
            (x) =>
              x.colony === id &&
              !x.pup &&
              x.hittable &&
              ['sit', 'forage', 'sunbathe', 'sentinel'].includes(x.pose) &&
              x.aimX > g.designWidth * 0.15 &&
              x.aimX < g.designWidth * 0.85,
          );
          if (m === undefined) return null;
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + (m.aimX / g.designWidth) * r.width,
            clientY: r.top + (m.aimY / g.designHeight) * r.height,
            pointerId: 931,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          const out = { score: g.score, log: g.meerkatLog.length };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          return out;
        },
        [COLONY, touch] as const,
      );
      if (shot === null) continue;
      // The hit entry and the score, read in one go (a miss times out and tries again).
      const hit = await page
        .waitForFunction(
          (from) => {
            const g = window.__TM__;
            const entry = g?.meerkatLog.slice(from).find((x) => x.startsWith('hit:'));
            return g === undefined || entry === undefined ? null : { entry, score: g.score };
          },
          shot.log,
          { timeout: 60_000 },
        )
        .catch(() => null);
      const seen =
        hit === null ? null : ((await hit.jsonValue()) as { entry: string; score: number });
      if (seen !== null && seen.entry === 'hit:-10' && seen.score === shot.score - 10)
        result = { before: shot.score, after: seen.score };
      else {
        // Let the penalty cooldown pass, the colony settle and the gun reload before the next try.
        const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
        await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 150, t0, {
          timeout: 120_000,
        });
        await page.keyboard.press('Space');
        if (touch) await page.waitForTimeout(500);
      }
    }
    expect(result, 'a meerkat was hit on its own').not.toBeNull();
    // The −10, and nothing else from that shot.
    expect(result?.after).toBe((result?.before ?? 0) - 10);
    // A moment later it pops its head out of the hole and scolds (the bark carries the −10).
    await page.waitForFunction(
      () =>
        window.__TM__?.meerkatLog.includes('scold:-10') === true &&
        window.__TM__.meerkats.some((m) => m.pose === 'scold'),
      null,
      { timeout: 120_000 },
    );
    await page.screenshot({ path: `${SCREENSHOTS}/meerkats-scold-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });

  test('the Familiefoto: hold fire with the family out (fixed seed)', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, QUERY);
    await startHunt(page, touch);
    await colonyInView(page);
    // Holding fire counts from the first shot: one into the sky, far left of the colony.
    await shootAt(page, touch, 'sky');
    // Then nothing: the family comes out, and after 4 s they line up for the photo. If the hunt
    // ends first, say where the colony was and what it was doing.
    const photo = await page.waitForFunction(
      (id) => {
        const g = window.__TM__;
        if (g === undefined) return null;
        const ms = g.meerkats.filter((m) => m.colony === id);
        const view = {
          row: ms.map((m) => m.pose),
          score: g.score,
          over: g.over,
          tick: g.tick,
          colonyX: ms.length === 0 ? null : Math.round(ms.reduce((t, m) => t + m.x, 0) / ms.length),
          centre: Math.round(g.designWidth / 2),
          log: g.meerkatLog.slice(-8),
        };
        return g.meerkatLog.includes('familiefoto') || g.over ? view : null;
      },
      COLONY,
      { timeout: 480_000 },
    );
    const at = (await photo.jsonValue()) as { row: string[]; score: number; over: boolean };
    expect(at.over, `the hunt ended before the Familiefoto: ${JSON.stringify(at)}`).toBe(false);
    expect(at.row.length).toBeGreaterThanOrEqual(4);
    expect(at.row.every((p) => p === 'photo')).toBe(true);
    await page.screenshot({ path: `${SCREENSHOTS}/meerkats-familiefoto-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
});
