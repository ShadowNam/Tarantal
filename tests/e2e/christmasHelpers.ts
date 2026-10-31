// D-064: helpers for the Christmas in the sun specs (feesdae-christmas.spec.ts,
// art-preview-xmas.spec.ts). Shots are in-page pointer events with a fresh pointerId each
// (feesdaeHelpers.fireAt); every wait is bounded by sim ticks or a hook value.
import type { Page } from '@playwright/test';
import { cameraStill, fireAt, reloadIfEmpty } from './feesdaeHelpers';
import feel from '../../content/client/feel.json' with { type: 'json' };

/** Waits until Christmas's hunt runs with its presents in the hook (its chunk loads lazily). */
export async function xmasRunning(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window.__TM__?.tick ?? 0) > 20 &&
      (window.__TM__?.spook?.things.some((t) => t.kind === 'present') ?? false),
    null,
    { timeout: 180_000 },
  );
}

/** Waits until the delivered Christmas sheet (not the stand-in) is drawn. */
export async function xmasSheetIn(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__TM__?.spook?.final === true, null, {
    timeout: 180_000,
  });
}

/**
 * Pans (arrow keys) until the shut present nearest the centre stands within `band` px of it;
 * returns its id. Overshoot-tolerant: the key is released as soon as the present is inside the
 * band, and a camera at the panorama's end stops the pan once it has not moved for 20 ticks.
 */
export async function presentInView(page: Page, band = 300): Promise<number> {
  const first = await page.evaluate(() => {
    const g = window.__TM__;
    const shut = (g?.spook?.things ?? []).filter((t) => t.kind === 'present' && !t.dark);
    if (g === undefined || shut.length === 0) return null;
    const c = g.designWidth / 2;
    return [...shut].sort((a, b) => Math.abs(a.x - c) - Math.abs(b.x - c))[0] ?? null;
  });
  if (first === null) throw new Error('no shut present');
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  for (let i = 0; i < 40; i++) {
    const x = await page.evaluate(
      (id) => window.__TM__?.spook?.things.find((t) => t.id === id)?.x ?? null,
      first.id,
    );
    if (x === null || Math.abs(x - w / 2) < band) break;
    const key = x > w / 2 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      ([id, b]) => {
        const g = window.__TM__;
        const t = g?.spook?.things.find((x) => x.id === id);
        if (g === undefined || t === undefined) return true;
        if (Math.abs(t.x - g.designWidth / 2) < b) return true;
        const s = window as unknown as { __xPan?: { x: number; t: number } };
        if (s.__xPan?.x !== g.cameraX) {
          s.__xPan = { x: g.cameraX, t: g.tick };
          return false;
        }
        return g.tick - s.__xPan.t >= 20;
      },
      [first.id, band] as const,
      { timeout: 120_000 },
    );
    await page.keyboard.up(key);
    await page.evaluate(() => {
      delete (window as unknown as { __xPan?: unknown }).__xPan;
    });
    await cameraStill(page);
  }
  await cameraStill(page);
  return first.id;
}

/**
 * Shoots at a present until it opens; true when it did. A seeded hunt's pellet patterns are the
 * same every run, so it gets up to `tries` shots; a shot is a miss once 20 ticks pass without the
 * present opening (no long wait that burns the clock).
 */
/**
 * Waits until Oupa's bark gap (audio.barkGapMs, on the HUD's own clock) has passed since his last
 * line, so a line the next action triggers (a present opened) is said, not dropped inside the gap
 * of an earlier one (a dry spell, an idle or miss-streak line on a slow device: review of #110).
 */
export async function waitBarkGap(page: Page): Promise<void> {
  await page.waitForFunction(
    (gap) => {
      const c = window.__TM__?.barkClock;
      return c === null || c === undefined || c.last === null || c.now - c.last >= gap + 50;
    },
    feel.audio.barkGapMs,
    { timeout: 120_000 },
  );
}

export async function shootPresentOpen(
  page: Page,
  touch: boolean,
  id: number,
  tries = 16,
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await reloadIfEmpty(page, touch);
    // Every shot with Oupa's gap clear: the shot that opens the present gets his line.
    await waitBarkGap(page);
    const before = await fireAt(page, touch, { id });
    if (before === null) return false;
    const out = await page
      .waitForFunction(
        ([pid, n]) => {
          const g = window.__TM__;
          if (g === undefined || g.shots <= n) return null;
          const w = window as unknown as { __presentShotTick?: number };
          w.__presentShotTick ??= g.tick;
          const t = g.spook?.things.find((x) => x.id === pid);
          if (t?.dark === true) return 'open';
          return g.tick - w.__presentShotTick >= 20 ? 'miss' : null;
        },
        [id, before.shots] as const,
        { timeout: 20_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    await page.evaluate(() => {
      delete (window as unknown as { __presentShotTick?: number }).__presentShotTick;
    });
    if (out === 'open') return true;
  }
  return false;
}

/** Holds the sim one tick on (the frame then stays put); `release` lets it run again. */
export async function holdNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__TM__;
    const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
    if (g !== undefined && hold !== undefined) hold(g.tick + 1);
  });
  await page.waitForTimeout(600);
}

export async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hold = (window as unknown as { __TM_HOLD_AT__?: (t: number) => void }).__TM_HOLD_AT__;
    hold?.(Number.MAX_SAFE_INTEGER);
  });
}

/** Hides (or shows) the presents and the tinsel (test hooks only). */
export async function hideXmas(page: Page, on: boolean): Promise<void> {
  await page.evaluate((o) => {
    (window as { __TM_XMAS_HIDE__?: (x: boolean) => void }).__TM_XMAS_HIDE__?.(o);
  }, on);
  await page.waitForTimeout(800);
}
