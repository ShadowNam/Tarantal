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

/** Pans (arrow keys) until a lit lantern stands within `band` px of the screen's centre; its id. */
export async function lanternInView(page: Page, band = 260): Promise<number> {
  const first = await page.evaluate(() => {
    const g = window.__TM__;
    const lit = (g?.spook?.things ?? []).filter((t) => t.kind === 'lantern' && !t.dark);
    if (g === undefined || lit.length === 0) return null;
    const c = g.designWidth / 2;
    // The nearest lantern to the centre (by screen x).
    return [...lit].sort((a, b) => Math.abs(a.x - c) - Math.abs(b.x - c))[0] ?? null;
  });
  if (first === null) throw new Error('no lit lantern');
  const w = await page.evaluate(() => window.__TM__?.designWidth ?? 1920);
  if (Math.abs(first.x - w / 2) >= band) {
    const key = first.x > w / 2 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await page.waitForFunction(
      ([id, b]) => {
        const g = window.__TM__;
        const t = g?.spook?.things.find((x) => x.id === id);
        return g !== undefined && t !== undefined && Math.abs(t.x - g.designWidth / 2) < b;
      },
      [first.id, band] as const,
      { timeout: 300_000 },
    );
    await page.keyboard.up(key);
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

/** Shoots at a lantern until it is dark (each try waits for the hook); true when it went out. */
export async function shootLanternOut(page: Page, touch: boolean, id: number): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await reloadIfEmpty(page, touch);
    const before = await fireAt(page, touch, { id });
    if (before === null) return false;
    const out = await page
      .waitForFunction(
        ([lid, n]) => {
          const g = window.__TM__;
          if (g === undefined || g.shots <= n) return null;
          const t = g.spook?.things.find((x) => x.id === lid);
          return t?.dark === true ? { dark: true, lit: g.spook?.lanternsLit ?? -1 } : null;
        },
        [id, before.shots] as const,
        { timeout: 20_000 },
      )
      .catch(() => null);
    if (out !== null) return true;
  }
  return false;
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
