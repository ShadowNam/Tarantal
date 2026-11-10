// D-048: helpers for the Halloween Spookjag specs (feesdae.spec.ts, art-preview-halloween.spec.ts).
// Every shot is a PointerEvent dispatched on the canvas from inside the page, with a fresh
// pointerId each time (page.touchscreen taps after a held arrow key did not register on WebKit's
// iPhone profile in CI, 25 Oct; see meerkats.spec.ts).
import type { Page } from '@playwright/test';

/** One thing of the Spookjag as the test hook shows it (screen design px). */
export interface SpookSpot {
  readonly id: number;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly dark: boolean;
}

/** Waits until the special's hunt runs with its things in the hook (its chunk loads lazily). */
export async function spookRunning(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window.__TM__?.tick ?? 0) > 20 && (window.__TM__?.spook?.things.length ?? 0) > 0,
    null,
    { timeout: 180_000 },
  );
}

/** Waits for the camera to stop (10 ticks without moving). */
export async function cameraStill(page: Page): Promise<void> {
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
 * Pans (arrow keys) until a lit lantern stands within `band` px of the screen's centre; its id.
 * D-049: a mid or near flock standing in front of a lantern takes the shots meant for it, so a
 * lantern with no such flock within `clearPx` (screen x) is preferred, then the nearest to the
 * centre. A lantern near the panorama's end can't be centred (the camera stops at its limit):
 * the pan then ends when the camera has not moved for 20 ticks, with the lantern on screen.
 * Which lanterns a hunt has follows the Daily's seed, i.e. the content hash.
 */
export async function lanternInView(page: Page, band = 260, clearPx = 360): Promise<number> {
  const first = await page.evaluate((clearOf) => {
    const g = window.__TM__;
    const lit = (g?.spook?.things ?? []).filter((t) => t.kind === 'lantern' && !t.dark);
    if (g === undefined || lit.length === 0) return null;
    const c = g.designWidth / 2;
    const flocks = g.flockSpots.filter(
      (f) => f.alive > 0 && (f.plane === 'mid' || f.plane === 'near'),
    );
    const clear = (x: number): number => (flocks.every((f) => Math.abs(f.x - x) > clearOf) ? 1 : 0);
    return (
      [...lit].sort(
        (a, b) => clear(b.x) - clear(a.x) || Math.abs(a.x - c) - Math.abs(b.x - c),
      )[0] ?? null
    );
  }, clearPx);
  if (first === null) throw new Error('no lit lantern');
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  if (Math.abs(first.x - w / 2) >= band) {
    const key = first.x > w / 2 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      ([id, b]) => {
        const g = window.__TM__;
        const t = g?.spook?.things.find((x) => x.id === id);
        if (g === undefined || t === undefined) return false;
        if (Math.abs(t.x - g.designWidth / 2) < b) return true;
        // The camera at its limit: stop once it has not moved for 20 ticks.
        const w = window as unknown as { __lanternPan?: { x: number; t: number } };
        if (w.__lanternPan?.x !== g.cameraX) {
          w.__lanternPan = { x: g.cameraX, t: g.tick };
          return false;
        }
        return g.tick - w.__lanternPan.t >= 20 && t.x > 60 && t.x < g.designWidth - 60;
      },
      [first.id, band] as const,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
    await page.evaluate(() => {
      delete (window as unknown as { __lanternPan?: unknown }).__lanternPan;
    });
  }
  await cameraStill(page);
  return first.id;
}

/**
 * Fires one shot in-page at a Spookjag thing (where the hook shows it now) or at a screen point;
 * returns the shot count and score before it, or null if the thing is gone or off screen.
 */
export async function fireAt(
  page: Page,
  touch: boolean,
  target: { id: number } | { x: number; y: number },
): Promise<{ shots: number; score: number } | null> {
  return page.evaluate(
    ([t, isTouch]) => {
      const g = window.__TM__;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      if (g === undefined || canvas === null) return null;
      const w = window as unknown as { __spookPointer?: number };
      const spot = 'id' in t ? g.spook?.things.find((x) => x.id === t.id) : t;
      if (spot === undefined || spot.x < 40 || spot.x > g.designWidth - 40) return null;
      w.__spookPointer = (w.__spookPointer ?? 4400) + 1;
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + (spot.x / g.designWidth) * r.width,
        clientY: r.top + (spot.y / g.designHeight) * r.height,
        pointerId: w.__spookPointer,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      const before = { shots: g.shots, score: g.score };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      return before;
    },
    [target, touch] as const,
  );
}

/** Reloads (Space on desktop; a belt tap on touch) when the gun is empty, and waits for it. */
export async function reloadIfEmpty(page: Page, touch: boolean): Promise<void> {
  const shells = await page.evaluate(() => window.__TM__?.shells ?? 0);
  if (shells > 0) return;
  if (!touch) await page.keyboard.press('Space');
  else
    await page.evaluate(() => {
      const g = window.__TM__;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const belt = g?.rects['belt'];
      if (g === undefined || canvas === null || belt === undefined) return;
      const w = window as unknown as { __spookPointer?: number };
      w.__spookPointer = (w.__spookPointer ?? 4400) + 1;
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + ((belt.x + belt.w / 2) / g.designWidth) * r.width,
        clientY: r.top + ((belt.y + belt.h / 2) / g.designHeight) * r.height,
        pointerId: w.__spookPointer,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    });
  await page.waitForFunction(() => (window.__TM__?.shells ?? 0) > 0, null, { timeout: 60_000 });
}

/**
 * Shoots at a lantern until it is dark; true when it went out. A Dubbelloop shot puts a mid
 * lantern out about 4 times in 10, and a seeded hunt's pellet patterns are the same every run, so
 * it gets up to `tries` shots; a shot is a miss once 20 ticks pass without the lantern going dark.
 *
 * The whole loop (fire, wait, reload) runs in the page in one call. On CI's loaded Pixel 7 shard
 * each Playwright round trip took seconds, so a try cost ~480 ticks and the 40 s hunt ended after
 * 3 shots (D-081 review, logged on 5e2e0f26); in the page a try costs about 20–30 ticks.
 */
export async function shootLanternOut(
  page: Page,
  touch: boolean,
  id: number,
  tries = 16,
): Promise<boolean> {
  const out = await page.evaluate(
    async ([lid, maxTries, isTouch]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const log: string[] = [];
      if (canvas === null) return { dark: false, log: ['no canvas'] };
      const w = window as unknown as { __spookPointer?: number };
      const frame = (): Promise<void> =>
        new Promise((resolve) =>
          requestAnimationFrame(() => {
            resolve();
          }),
        );
      // Waits until `done` holds or `ticks` sim ticks pass (or 20 s of wall time, so it never hangs).
      const waitTicks = async (ticks: number, done: () => boolean): Promise<boolean> => {
        const t0 = window.__TM__?.tick ?? 0;
        const wall = performance.now();
        for (;;) {
          if (done()) return true;
          const g = window.__TM__;
          if (g === undefined || g.over || g.tick - t0 >= ticks) return false;
          if (performance.now() - wall > 20_000) return false;
          await frame();
        }
      };
      const press = (x: number, y: number, button: number): void => {
        const g = window.__TM__;
        if (g === undefined) return;
        w.__spookPointer = (w.__spookPointer ?? 4400) + 1;
        const r = canvas.getBoundingClientRect();
        const init: PointerEventInit = {
          clientX: r.left + (x / g.designWidth) * r.width,
          clientY: r.top + (y / g.designHeight) * r.height,
          pointerId: w.__spookPointer,
          pointerType: isTouch ? 'touch' : 'mouse',
          isPrimary: true,
          button,
          buttons: button === 2 ? 2 : 1,
          bubbles: true,
          cancelable: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      };
      const lantern = () => window.__TM__?.spook?.things.find((x) => x.id === lid);
      for (let i = 0; i < maxTries; i++) {
        const g = window.__TM__;
        if (g === undefined || g.over) {
          log.push(`try ${String(i)}: the hunt is over`);
          break;
        }
        if (g.shells === 0) {
          // Reload: a tap on the shell belt on touch, a right-click with a mouse.
          const belt = g.rects['belt'];
          if (isTouch && belt !== undefined) press(belt.x + belt.w / 2, belt.y + belt.h / 2, 0);
          else press(g.designWidth / 2, g.designHeight / 2, 2);
          await waitTicks(240, () => (window.__TM__?.shells ?? 0) > 0);
          continue;
        }
        const t = lantern();
        if (t === undefined || t.x < 40 || t.x > g.designWidth - 40) {
          log.push(`try ${String(i)}: not in view at tick ${String(g.tick)}`);
          await waitTicks(30, () => false);
          continue;
        }
        const shots = g.shots;
        press(t.x, t.y, 0);
        // The shot lands (cooldown or a reload can hold it back), then 20 ticks for the lantern.
        if (!(await waitTicks(60, () => (window.__TM__?.shots ?? 0) > shots))) {
          log.push(`try ${String(i)}: no shot at tick ${String(window.__TM__?.tick)}`);
          continue;
        }
        if (await waitTicks(20, () => lantern()?.dark === true)) return { dark: true, log };
        const h = window.__TM__;
        const l = lantern();
        log.push(
          `try ${String(i)}: miss ${JSON.stringify({
            tick: h?.tick,
            left: h?.ticksLeft,
            score: h?.score,
            lantern: l === undefined ? null : { x: Math.round(l.x), y: Math.round(l.y) },
            flocks: (h?.flockSpots ?? []).map((f) => [f.plane, Math.round(f.x), Math.round(f.y)]),
          })}`,
        );
      }
      return { dark: false, log };
    },
    [id, tries, touch] as const,
  );
  // CI-only failures (D-081 review): say what each miss looked like.
  for (const line of out.log) console.log(`[lantern] ${line}`);
  return out.dark;
}

/** Taps a hook rect (a menu button) in-page, like the shots (never page.touchscreen). */
export async function tapRectInPage(page: Page, touch: boolean, id: string): Promise<void> {
  await page.waitForFunction((r) => window.__TM__?.rects[r] !== undefined, id, {
    timeout: 60_000,
  });
  await page.evaluate(
    ([rid, isTouch]) => {
      const g = window.__TM__;
      const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
      const rect = g?.rects[rid];
      if (g === undefined || canvas === null || rect === undefined) throw new Error(`no ${rid}`);
      const w = window as unknown as { __spookPointer?: number };
      w.__spookPointer = (w.__spookPointer ?? 4400) + 1;
      const r = canvas.getBoundingClientRect();
      const init: PointerEventInit = {
        clientX: r.left + ((rect.x + rect.w / 2) / g.designWidth) * r.width,
        clientY: r.top + ((rect.y + rect.h / 2) / g.designHeight) * r.height,
        pointerId: w.__spookPointer,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    },
    [id, touch] as const,
  );
}
