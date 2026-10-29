// v1.7d (D-059): Namibië's veld life in a real hunt. Tuesday's map (pinned: the layout never
// follows the date) has the ostrich pair and their nest on the mid plane; the test pans them to
// the middle of the screen and then: the pair and the nest are drawn (and the ground cover);
// a shot into the sand beside them sends them running and they come back to the nest; a shot
// ostrich costs −10 and says its bark. Monday's calm dawn always brings a balloon: it drifts.
// Every transient value is read from the test hook (`namibLife`, `namibLog`) in the same
// waitForFunction that sees it; shots are pointer events dispatched in-page with a fresh id.
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
import { reloadIfEmpty } from './feesdaeHelpers';

const QUERY = 'biome=namibie&layout=tue&seed=42&huntSeconds=90&graphics=standard';
const DAWN = 'biome=namibie&layout=mon&seed=42&huntSeconds=90&graphics=standard';

/** The pair's middle on screen (mean of its birds' feet), or null before the chunk is in. */
async function pairX(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const os = window.__TM__?.namibLife?.ostriches ?? [];
    return os.length === 0 ? null : os.reduce((t, o) => t + o.x, 0) / os.length;
  });
}

/** Pans until the pair stands within 200 px of the screen's centre, then waits for the camera. */
async function pairInView(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window.__TM__?.tick ?? 0) > 30 && (window.__TM__?.namibLife?.ostriches.length ?? 0) >= 2,
    null,
    { timeout: 120_000 },
  );
  const h = await hook(page);
  const x = await pairX(page);
  if (x === null) throw new Error('no ostriches in the hook');
  const centre = h.designWidth / 2;
  if (Math.abs(x - centre) >= 200) {
    const key = x > centre ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      () => {
        const g = window.__TM__;
        const os = g?.namibLife?.ostriches ?? [];
        if (g === undefined || os.length === 0) return false;
        const cx = os.reduce((t, o) => t + o.x, 0) / os.length;
        return Math.abs(cx - g.designWidth / 2) < 200;
      },
      null,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
  }
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

/** Fires at screen design point (x, y), worked out in the same page call by `where`. */
async function fire(
  page: Page,
  touch: boolean,
  where: 'sand' | 'bird',
): Promise<{ score: number; log: number; tick: number } | null> {
  return page.evaluate(
    ([w, isTouch]) => {
      const g = window.__TM__;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const os = g?.namibLife?.ostriches ?? [];
      if (g === undefined || canvas === null || os.length === 0) return null;
      let x: number;
      let y: number;
      if (w === 'sand') {
        // Just right of the pair, low on the sand: close enough to scare them, hitting nothing.
        x = Math.min(g.designWidth * 0.85, Math.max(...os.map((o) => o.x)) + 120);
        y = Math.max(...os.map((o) => o.y)) - 4;
      } else {
        // A standing bird's body (about 60 % up from its feet), inside the screen's middle.
        const o = os.find(
          (b) =>
            b.pose !== 'sit' &&
            b.pose !== 'run' &&
            b.x > g.designWidth * 0.15 &&
            b.x < g.designWidth * 0.85,
        );
        if (o === undefined) return null;
        x = o.x;
        y = o.y - o.h * 0.58;
      }
      const r = canvas.getBoundingClientRect();
      const win = window as unknown as { __namibPointer?: number };
      win.__namibPointer = (win.__namibPointer ?? 960) + 1;
      const init: PointerEventInit = {
        clientX: r.left + (x / g.designWidth) * r.width,
        clientY: r.top + (y / g.designHeight) * r.height,
        pointerId: win.__namibPointer,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      const out = { score: g.score, log: g.namibLog.length, tick: g.tick };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return out;
    },
    [where, touch] as const,
  );
}

test.describe('Namibië veld life (v1.7d, D-059)', () => {
  test('the ostriches and their nest appear and run after a nearby shot', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, QUERY);
    await startHunt(page, touch);
    await pairInView(page);
    const h = await hook(page);
    expect(h.missingTextures).toEqual([]);
    // The pair (cock and hen, one sitting on the nest by day) and the ground cover are drawn.
    const life = h.namibLife;
    expect(life?.ostriches.map((o) => o.male).sort()).toEqual([false, true]);
    expect(life?.ostriches.some((o) => o.pose === 'sit')).toBe(true);
    for (const o of life?.ostriches ?? []) expect(o.h).toBeGreaterThan(60);
    expect(life?.veld ?? 0).toBeGreaterThan(500);
    expect(life?.veldShown ?? 0).toBeGreaterThan(20);
    await page.screenshot({ path: `${SCREENSHOTS}/namibie-ostriches-${info.project.name}.png` });
    // A shot into the sand beside them: the log says they ran and the birds run (one read).
    let ran = false;
    for (let attempt = 0; attempt < 4 && !ran; attempt++) {
      const shot = await fire(page, touch, 'sand');
      if (shot === null) continue;
      ran = await page
        .waitForFunction(
          (from) => {
            const g = window.__TM__;
            const entry = g?.namibLog.slice(from).find((x) => x.startsWith('ran:'));
            return (
              entry !== undefined && g?.namibLife?.ostriches.some((o) => o.pose === 'run') === true
            );
          },
          shot.log,
          { timeout: 15_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!ran) await reloadIfEmpty(page, touch);
    }
    expect(ran, 'the pair ran from the shot').toBe(true);
    // They come back: one settles on the nest again.
    await page.waitForFunction(
      () =>
        window.__TM__?.namibLife?.ostriches.some((o) => o.pose === 'sit') === true &&
        window.__TM__.namibLife.ostriches.every((o) => o.pose !== 'run'),
      null,
      { timeout: 120_000 },
    );
    expect(errors).toEqual([]);
  });

  test('shooting an ostrich costs −10 and it says "Leave my eggs alone!"', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, QUERY);
    await startHunt(page, touch);
    await pairInView(page);
    let result: { before: number; after: number; bark: boolean } | null = null;
    for (let attempt = 0; attempt < 8 && result === null; attempt++) {
      const shot = await fire(page, touch, 'bird');
      if (shot === null) {
        // Both birds sitting or running: give them a moment.
        const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
        await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 60, t0, {
          timeout: 60_000,
        });
        continue;
      }
      // The hit entry, its bark and the score, read in one go (a miss times out and tries again).
      const hit = await page
        .waitForFunction(
          (from) => {
            const g = window.__TM__;
            const log = g?.namibLog.slice(from) ?? [];
            const entry = log.find((x) => x.startsWith('hit:'));
            return g === undefined || entry === undefined
              ? null
              : { entry, score: g.score, bark: log.includes('bark:bark.ostrich') };
          },
          shot.log,
          { timeout: 10_000 },
        )
        .catch(() => null);
      const seen =
        hit === null
          ? null
          : ((await hit.jsonValue()) as { entry: string; score: number; bark: boolean });
      if (seen !== null && seen.entry === 'hit:-10' && seen.score === shot.score - 10)
        result = { before: shot.score, after: seen.score, bark: seen.bark };
      else if (seen === null) await reloadIfEmpty(page, touch);
      else {
        // Inside the cooldown, or a bird was bagged too: wait it out and try again.
        const t0 = await page.evaluate(() => window.__TM__?.tick ?? 0);
        await page.waitForFunction((t) => (window.__TM__?.tick ?? 0) >= t + 150, t0, {
          timeout: 120_000,
        });
        await reloadIfEmpty(page, touch);
      }
    }
    expect(result, 'an ostrich was hit on its own').not.toBeNull();
    expect(result?.after).toBe((result?.before ?? 0) - 10);
    expect(result?.bark).toBe(true);
    // Never hurt: still two birds.
    expect((await hook(page)).namibLife?.ostriches).toHaveLength(2);
    await page.screenshot({ path: `${SCREENSHOTS}/namibie-ostrich-hit-${info.project.name}.png` });
    expect(errors).toEqual([]);
  });

  test('a hot-air balloon drifts across on a fixed seed (calm dawn)', async ({ page }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, DAWN);
    await startHunt(page, touch);
    const first = await page.waitForFunction(
      () => {
        const b = window.__TM__?.namibLife?.balloons[0];
        return b === undefined ? null : { id: b.id, x: b.x, tick: window.__TM__?.tick ?? 0 };
      },
      null,
      { timeout: 300_000 },
    );
    const a = (await first.jsonValue()) as { id: number; x: number; tick: number };
    // 4 s of sim time later the same balloon has drifted (the camera stays put: no input).
    const later = await page.waitForFunction(
      (p) => {
        const g = window.__TM__;
        const b = g?.namibLife?.balloons.find((x) => x.id === p.id);
        if (g === undefined || b === undefined || g.tick < p.tick + 240) return null;
        return { x: b.x, h: b.h };
      },
      a,
      { timeout: 300_000 },
    );
    const b = (await later.jsonValue()) as { x: number; h: number };
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(5);
    expect(b.h).toBeGreaterThan(60);
    expect(errors).toEqual([]);
  });
});
