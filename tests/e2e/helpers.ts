// Shared Playwright helpers: the window.__TM__ test hook, design-px → client-px taps, waits.
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { TestHook } from '../../src/game/GameContext';

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

export async function hook(page: Page): Promise<TestHook> {
  const h = await page.evaluate(() => window.__TM__);
  if (!h) throw new Error('test hook missing (load with ?e2e=1)');
  return h;
}

export function isTouchProject(info: TestInfo): boolean {
  return info.project.use.hasTouch === true;
}

export function isLandscape(info: TestInfo): boolean {
  return info.project.metadata['orientation'] === 'landscape';
}

/** Client position of a point given in design px of the visible screen. */
export async function toClient(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  // One page round trip (each costs seconds on a loaded, software-rendered sandbox).
  return page.evaluate(
    ([dx, dy]) => {
      const canvas = document.querySelector('#game canvas');
      const h = window.__TM__;
      if (!canvas || !h) throw new Error('game not booted');
      const r = canvas.getBoundingClientRect();
      return {
        x: r.left + (dx / h.designWidth) * r.width,
        y: r.top + (dy / h.designHeight) * r.height,
      };
    },
    [x, y] as const,
  );
}

/** Tap (touch profiles) or left-click (desktop) at design px. */
export async function tapAt(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  const p = await toClient(page, x, y);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** Taps (or clicks) the centre of a rect the game published in hook.rects. */
export async function tapRect(page: Page, touch: boolean, id: string): Promise<void> {
  const r = (await hook(page)).rects[id];
  if (!r) throw new Error(`no rect "${id}" on screen`);
  await tapAt(page, touch, r.x + r.w / 2, r.y + r.h / 2);
}

/** Reload the way a player would: right-click on desktop, tap the shell belt on touch. */
export async function reload(page: Page, touch: boolean): Promise<void> {
  const h = await hook(page);
  const belt = h.rects['belt'];
  if (!belt) throw new Error('HUD belt not laid out');
  const p = await toClient(page, belt.x + belt.w / 2, belt.y + belt.h / 2);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y, { button: 'right' });
}

/** Waits until the sim has advanced `ticks` past `from` (or the hunt ended). */
export async function waitTicks(page: Page, ticks: number, from?: number): Promise<void> {
  const start = from ?? (await hook(page)).tick;
  await page.waitForFunction(
    (t) => (window.__TM__?.tick ?? 0) >= t || window.__TM__?.over === true,
    start + ticks,
    { timeout: 120_000 },
  );
}

/** Tick, shells and over in one round trip. */
export async function quick(
  page: Page,
): Promise<{ tick: number; shells: number; shots: number; over: boolean }> {
  return page.evaluate(() => {
    const h = window.__TM__;
    return {
      tick: h?.tick ?? 0,
      shells: h?.shells ?? 0,
      shots: h?.shots ?? 0,
      over: h?.over ?? false,
    };
  });
}

/**
 * Loads the game with the test hook. Unless the query says otherwise, starts as a returning
 * player (`ftue=0`): the M2–M4 specs test Classic hunts, the FTUE has its own spec.
 * Unless the query picks a day (`today=`), a map (`layout=`, `bonus=`) or a challenge (`c=`),
 * Classic plays the plain biome (`layout=none`, v1.2): otherwise the weekday layout moves the
 * props these specs tap, and a spec would pass on one UTC day and fail on the next.
 */
export async function boot(page: Page, query: string): Promise<void> {
  const pinned = /(^|&)(today|layout|bonus|c)=/.test(query);
  const withMap = pinned ? query : `${query}&layout=none`;
  const q = /(^|&)ftue=/.test(withMap) ? withMap : `${withMap}&ftue=0`;
  await page.goto(`/?e2e=1&${q}`);
  await expect(page.locator('#game canvas')).toHaveCount(1);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 60_000 });
}

/** Taps the title's START HUNT and waits until the hunt is running. */
export async function startHunt(page: Page, touch: boolean): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.rects['start'] !== undefined, null, {
    timeout: 60_000,
  });
  await tapRect(page, touch, 'start');
  await page.waitForFunction(() => window.__TM__?.scene === 'hunt', null, { timeout: 60_000 });
}

export function stats(values: readonly number[]): {
  avg: number;
  p50: number;
  p95: number;
  n: number;
} {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number): number => v[Math.min(v.length - 1, Math.floor(v.length * q))] ?? 0;
  const avg = v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
  return { avg, p50: at(0.5), p95: at(0.95), n: v.length };
}

export const SCREENSHOTS = 'tests/e2e/__screenshots__';

/**
 * Fires taps at a flock from inside the page, `gapTicks` sim ticks apart, as real PointerEvents on
 * the canvas (the normal InputMapper path). Harness round trips cost seconds on software GL — more
 * than the 1.5 s escalation window — so timing must not depend on them. Each tap aims at the
 * flock's current position. Resolves with the sim tick of each tap.
 */
export async function burstAtFlock(
  page: Page,
  touch: boolean,
  flockId: number,
  count: number,
  gapTicks: number,
): Promise<number[]> {
  return page.evaluate(
    ([id, n, gap, isTouch]) =>
      new Promise<number[]>((resolve, reject) => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        const h = window.__TM__;
        if (!canvas || !h) {
          reject(new Error('game not booted'));
          return;
        }
        const ticks: number[] = [];
        let pointerId = 900;
        const fire = (): void => {
          const spot = h.flockSpots.find((f) => f.id === id);
          if (!spot) {
            resolve(ticks);
            return;
          }
          const r = canvas.getBoundingClientRect();
          const init: PointerEventInit = {
            clientX: r.left + (spot.x / h.designWidth) * r.width,
            clientY: r.top + (spot.y / h.designHeight) * r.height,
            pointerId: pointerId++,
            pointerType: isTouch ? 'touch' : 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
          ticks.push(h.tick);
        };
        const loop = (): void => {
          const last = ticks[ticks.length - 1];
          if (ticks.length >= n) {
            resolve(ticks);
            return;
          }
          if (last === undefined || h.tick >= last + gap) fire();
          requestAnimationFrame(loop);
        };
        loop();
      }),
    [flockId, count, gapTicks, touch] as const,
  );
}
