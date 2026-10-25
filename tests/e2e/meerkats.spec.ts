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
  tapAt,
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
    const h = await hook(page);
    const ms = h.meerkats.filter((m) => m.colony === COLONY);
    const right = Math.max(...ms.map((m) => m.x));
    const ground = Math.max(...ms.map((m) => m.y));
    await tapAt(page, touch, Math.min(h.designWidth * 0.8, right + 120), ground - 170);
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
    // call, so it can't have moved off between the two. A miss (it ran, or another meerkat or
    // bird took the pellets) is tried again with a fresh pick.
    let result: { before: number; after: number } | null = null;
    for (let attempt = 0; attempt < 6 && result === null; attempt++) {
      await outAtLeast(page, 1);
      const before = await page.evaluate(
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
          const score = g.score;
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          return score;
        },
        [COLONY, touch] as const,
      );
      if (before === null) continue;
      // The hit and the score, read in one go (a miss times out and tries again).
      const hit = await page
        .waitForFunction(
          () => {
            const g = window.__TM__;
            return g?.meerkatLog.includes('hit:-10') === true ? { score: g.score } : null;
          },
          null,
          { timeout: 60_000 },
        )
        .catch(() => null);
      if (hit !== null)
        result = { before, after: ((await hit.jsonValue()) as { score: number }).score };
      else {
        // Let the colony settle and the gun reload before the next try.
        await page.keyboard.press('Space');
        if (touch) await page.waitForTimeout(500);
      }
    }
    expect(result, 'a meerkat was hit').not.toBeNull();
    // The −10 (Saturday's flocks feed far from this colony, so no bird shares the shot).
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
    const h = await hook(page);
    await tapAt(page, touch, h.designWidth * 0.2, h.designHeight * 0.12);
    // Then nothing: the family comes out, and after 4 s they line up for the photo.
    const photo = await page.waitForFunction(
      (id) => {
        const g = window.__TM__;
        if (g?.meerkatLog.includes('familiefoto') !== true) return null;
        return {
          row: g.meerkats.filter((m) => m.colony === id).map((m) => m.pose),
          score: g.score,
        };
      },
      COLONY,
      { timeout: 480_000 },
    );
    const at = (await photo.jsonValue()) as { row: string[]; score: number };
    expect(at.row.length).toBeGreaterThanOrEqual(4);
    expect(at.row.every((p) => p === 'photo')).toBe(true);
    await page.screenshot({ path: `${SCREENSHOTS}/meerkats-familiefoto-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });
});
