// v1.7c (D-047): fruit react to shots. On an Okavango hunt (fixed seed, no birds so nothing else
// can score) the test pans the sausage tree to the middle, fires a shot beside a sausage (the
// pellets' near misses and stray hits swing it), then a shot straight at it while it still
// swings (it snaps off, falls and lands). The score never changes: fruit are not targets. Shots
// are pointer events dispatched on the canvas in-page (as in weavers.spec.ts and
// meerkats.spec.ts), and every transient value is read in the waitForFunction that sees it.
import { expect, test, type Page } from '@playwright/test';
import {
  boot,
  collectErrors,
  hook,
  isLandscape,
  isTouchProject,
  reload,
  startHunt,
  waitTicks,
} from './helpers';

const QUERY = 'biome=okavango-spring&seed=42&huntSeconds=90&birds=0';
let pointer = 940;

/** Pans until a sausage hangs within 200 px of the screen's centre, then waits for the camera
 *  to stop. */
async function sausageInView(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window.__TM__?.tick ?? 0) > 30 &&
      (window.__TM__?.fruit?.spots.some((f) => f.species === 'sausage') ?? false),
    null,
    { timeout: 180_000 },
  );
  const h = await hook(page);
  const xs = (h.fruit?.spots ?? []).filter((f) => f.species === 'sausage').map((f) => f.aimX);
  const centre = h.designWidth / 2;
  const x = xs.reduce((a, b) => (Math.abs(b - centre) < Math.abs(a - centre) ? b : a), xs[0] ?? 0);
  if (Math.abs(x - centre) >= 200) {
    const key = x > centre ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      () => {
        const g = window.__TM__;
        if (g === undefined || g.fruit === null) return false;
        return g.fruit.spots.some(
          (f) => f.species === 'sausage' && Math.abs(f.aimX - g.designWidth / 2) < 200,
        );
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
    { timeout: 120_000 },
  );
}

/**
 * Fires one shot in-page at sausage `i` (or the sausage nearest the centre when `i` is null),
 * `offset` design px to its right, and waits until the sim has counted it. Returns the sausage.
 */
async function shootSausage(
  page: Page,
  touch: boolean,
  i: number | null,
  offset: number,
): Promise<number> {
  // A full belt, and past the fire cooldown (a tap in it is not a shot).
  if ((await hook(page)).shells === 0) {
    await reload(page, touch);
    await page.waitForFunction(() => (window.__TM__?.shells ?? 0) > 0, null, { timeout: 120_000 });
  }
  await waitTicks(page, 12);
  pointer++;
  const before = await page.evaluate(
    ([want, off, isTouch, id]) => {
      const g = window.__TM__;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      if (g === undefined || g.fruit === null || canvas === null) throw new Error('no fruit');
      const all = g.fruit.spots.filter((f) => f.species === 'sausage' && !f.dropped);
      const centre = g.designWidth / 2;
      const f =
        want === null
          ? all.reduce((a, b) => (Math.abs(b.aimX - centre) < Math.abs(a.aimX - centre) ? b : a))
          : all.find((x) => x.i === want);
      if (f === undefined) throw new Error('sausage gone');
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + ((f.aimX + off) / g.designWidth) * r.width,
        clientY: r.top + (f.aimY / g.designHeight) * r.height,
        // A fresh pointer per tap, as a real second touch would be.
        pointerId: id,
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
      return { shots, i: f.i };
    },
    [i, offset, touch, pointer] as const,
  );
  await page.waitForFunction((n) => (window.__TM__?.shots ?? 0) > n, before.shots, {
    timeout: 60_000,
  });
  return before.i;
}

test.describe('fruit react to shots (v1.7c, D-047)', () => {
  test('a shot sausage swings, a second shot drops it, and the score stays', async ({
    page,
  }, info) => {
    test.skip(!isLandscape(info), 'portrait shows the rotate card');
    test.setTimeout(600_000);
    const touch = isTouchProject(info);
    const errors = collectErrors(page);
    await boot(page, QUERY);
    await startHunt(page, touch);
    await sausageInView(page);
    const h0 = await hook(page);
    expect(h0.missingTextures).toEqual([]);
    expect(h0.fruit?.count ?? 0).toBeGreaterThan(0);
    const score = h0.score;
    // Beside it: the spread's near misses (and maybe a stray pellet) swing it.
    const i = await shootSausage(page, touch, null, 70);
    const swing = await page.waitForFunction(
      (id) => {
        const f = window.__TM__?.fruit?.spots.find((x) => x.i === id);
        return f !== undefined && Math.abs(f.angle) > 0.02
          ? { angle: f.angle, dropped: f.dropped }
          : null;
      },
      i,
      { timeout: 120_000 },
    );
    const swung = (await swing.jsonValue()) as { angle: number; dropped: boolean };
    expect(swung.dropped).toBe(false);
    // Straight at it while it still swings: it snaps off (a few tries if the spread missed it).
    for (let k = 0; k < 4; k++) {
      const dropped = await page.evaluate(
        (id) => window.__TM__?.fruit?.spots.find((x) => x.i === id)?.dropped ?? false,
        i,
      );
      if (dropped) break;
      await shootSausage(page, touch, i, 0);
    }
    await page.waitForFunction(
      (id) => window.__TM__?.fruit?.spots.find((x) => x.i === id)?.dropped === true,
      i,
      { timeout: 60_000 },
    );
    // It falls and lands on the ground line.
    await page.waitForFunction(
      (id) => window.__TM__?.fruit?.spots.find((x) => x.i === id)?.landed === true,
      i,
      { timeout: 120_000 },
    );
    const h1 = await hook(page);
    expect(h1.fruit?.drops ?? 0).toBeGreaterThanOrEqual(1);
    expect(h1.score).toBe(score);
    expect(errors).toEqual([]);
  });
});
