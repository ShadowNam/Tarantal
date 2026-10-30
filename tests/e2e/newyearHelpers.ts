// D-065: helpers for the New Year countdown specs (feesdae-newyear.spec.ts,
// art-preview-newyear.spec.ts). Shots are in-page pointer events with a fresh pointerId each
// (feesdaeHelpers.fireAt); every wait is bounded by sim ticks or a hook value.
import type { Page } from '@playwright/test';
import { reloadIfEmpty } from './feesdaeHelpers';

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
 * Fires (in-page: the bird read and the pointer events in one evaluate, a fresh pointerId) at the
 * body centre of a hittable target bird on screen — the nearest plane first, then the one nearest
 * the view's centre; returns the shot count and score before, or null when none is in view.
 */
async function fireAtBird(
  page: Page,
  touch: boolean,
): Promise<{ shots: number; score: number } | null> {
  return page.evaluate((isTouch) => {
    const g = window.__TM__;
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (g === undefined || canvas === null) return null;
    const c = g.designWidth / 2;
    const seen = g.targetBirds.filter(
      (b) => b.x > 80 && b.x < g.designWidth - 80 && b.y > 200 && b.y < g.designHeight - 220,
    );
    const rank = (p: string): number => (p === 'near' ? 0 : p === 'mid' ? 1 : 2);
    const b = [...seen].sort(
      (x, y) => rank(x.plane) - rank(y.plane) || Math.abs(x.x - c) - Math.abs(y.x - c),
    )[0];
    if (b === undefined) return null;
    const w = window as unknown as { __nyPointer?: number };
    w.__nyPointer = (w.__nyPointer ?? 6200) + 1;
    const r = canvas.getBoundingClientRect();
    const init: PointerEventInit = {
      clientX: r.left + (b.x / g.designWidth) * r.width,
      clientY: r.top + (b.y / g.designHeight) * r.height,
      pointerId: w.__nyPointer,
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
  }, touch);
}

/**
 * Shoots at target birds until a bag scores in the countdown (from tick `at`); returns that award
 * (with the score's change), or null if the hunt ends or `tries` shots bag nothing. A shot that
 * bags nothing within 20 ticks is a miss (no long wait: the countdown lasts 10 s); with no bird in
 * view it pans and looks again.
 */
export async function bagInCountdown(
  page: Page,
  touch: boolean,
  at: number,
  tries = 24,
): Promise<{ tick: number; award: number; mult: number; kinds: string[]; delta: number } | null> {
  for (let i = 0; i < tries; i++) {
    const over = await page.evaluate(() => window.__TM__?.over ?? true);
    if (over) return null;
    await reloadIfEmpty(page, touch);
    const before = await fireAtBird(page, touch);
    if (before === null) {
      await page.keyboard.press(i % 4 < 2 ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForTimeout(150);
      continue;
    }
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
        { timeout: 30_000, polling: 'raf' },
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
