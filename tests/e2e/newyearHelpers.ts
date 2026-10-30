// D-065: helpers for the New Year countdown specs (feesdae-newyear.spec.ts,
// art-preview-newyear.spec.ts). Shots are in-page pointer events with a fresh pointerId each
// (feesdaeHelpers.fireAt); every wait is bounded by sim ticks or a hook value.
import type { Page } from '@playwright/test';
import { fireAt, reloadIfEmpty } from './feesdaeHelpers';

/** Waits until New Year's hunt runs with its look in the hook (its chunk loads lazily). */
export async function nyRunning(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window.__TM__?.tick ?? 0) > 20 &&
      window.__TM__?.spook?.id === 'newyear' &&
      window.__TM__.spook.newYear !== undefined,
    null,
    { timeout: 180_000 },
  );
}

/** Waits until the delivered New Year sheet (not the stand-in) is drawn. */
export async function nySheetIn(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.spook?.newYear?.sheet === 'standard', null, {
    timeout: 180_000,
  });
}

/** Hides (or shows) the fireworks and the stars (test hooks only). */
export async function hideNy(page: Page, on: boolean): Promise<void> {
  await page.evaluate((o) => {
    (window as { __TM_NY_HIDE__?: (x: boolean) => void }).__TM_NY_HIDE__?.(o);
  }, on);
  await page.waitForTimeout(800);
}

/** Waits (sim ticks) until the countdown runs; returns its first tick. */
export async function countdownOn(page: Page): Promise<number> {
  const h = await page.waitForFunction(
    () => {
      const c = window.__TM__?.spook?.newYear?.countdown;
      return c?.active === true ? c.atTick : null;
    },
    null,
    { timeout: 300_000 },
  );
  return (await h.jsonValue()) as number;
}

/**
 * Shoots at the flock nearest the view's centre until a bag scores in the countdown (from tick
 * `at`); returns that award, or null after `tries` shots. A shot that bags nothing within 20 ticks
 * is a miss (no long wait: the countdown lasts 10 s).
 */
export async function bagInCountdown(
  page: Page,
  touch: boolean,
  at: number,
  tries = 14,
): Promise<{ tick: number; award: number; mult: number; kinds: string[]; delta: number } | null> {
  for (let i = 0; i < tries; i++) {
    const over = await page.evaluate(() => window.__TM__?.over ?? true);
    if (over) return null;
    await reloadIfEmpty(page, touch);
    const spot = await page.evaluate(() => {
      const g = window.__TM__;
      if (g === undefined) return null;
      const c = g.designWidth / 2;
      const seen = g.flockSpots.filter(
        (f) => f.alive > 0 && f.x > 120 && f.x < g.designWidth - 120 && f.y > 260,
      );
      return [...seen].sort((a, b) => Math.abs(a.x - c) - Math.abs(b.x - c))[0] ?? null;
    });
    if (spot === null) {
      await page.keyboard.press(i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
      continue;
    }
    const before = await fireAt(page, touch, { x: spot.x, y: spot.y });
    if (before === null) continue;
    const got = await page
      .waitForFunction(
        ([t0, n, score]) => {
          const g = window.__TM__;
          if (g === undefined || g.shots <= n) return null;
          const w = window as unknown as { __nyShot?: number };
          const shot = (w.__nyShot ??= g.tick);
          const a = g.awards.find((x) => x.tick >= t0 && x.tick >= shot - 1);
          if (a !== undefined) return { ...a, delta: g.score - score };
          return g.tick - shot >= 20 || g.over ? 'miss' : null;
        },
        [at, before.shots, before.score] as const,
        { timeout: 30_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    await page.evaluate(() => {
      delete (window as unknown as { __nyShot?: number }).__nyShot;
    });
    if (got !== null && got !== 'miss') return got;
  }
  return null;
}
