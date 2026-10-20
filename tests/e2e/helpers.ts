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

export async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/?e2e=1&${query}`);
  await expect(page.locator('#game canvas')).toHaveCount(1);
  await page.waitForFunction(() => window.__TM__?.ready === true, null, { timeout: 60_000 });
}

/** Taps the start card and waits until the hunt is running. */
export async function startHunt(page: Page, touch: boolean): Promise<void> {
  const h = await hook(page);
  await tapAt(page, touch, h.designWidth / 2, h.designHeight / 2);
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
